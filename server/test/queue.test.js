// T04 "Unit tests for every transition in §4a" + AT-11 "kill-and-restart".
// Node's test runner isolates each file in its own process, so the low
// limits set here (before any other import) only apply to this file.
process.env.QUEUED_RUNS_LIMIT = "1";
process.env.ACTIVE_RUNS_LIMIT = "1";
process.env.RUNS_PER_HOUR_LIMIT = "2";
process.env.SESSION_SECRET ??= "test-secret";
process.env.ACCESS_CODE ??= "test-code";
process.env.DATABASE_URL ??= "postgres://localhost:5432/docsync_test";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { migrate } from "../src/db/migrate.js";
import { getPool, closePool } from "../src/db/pool.js";
import { startRun } from "../src/runner/start-run.js";
import { tryStartNext, recoverInterruptedRuns, _resetQueueLockForTests } from "../src/runner/queue.js";
import { QueueFullError, RateLimitedError } from "../src/runner/limits.js";

before(async () => {
  await migrate();
});

after(async () => {
  await closePool();
});

// These limits are global ("app-wide" per §4a), so every test needs a
// clean `runs` table - leftover rows from an earlier test file run (or an
// earlier test in this file) would otherwise make the counts non-deterministic.
beforeEach(async () => {
  _resetQueueLockForTests();
  await getPool().query(`DELETE FROM runs`);
});

async function insertRepo(owner, name) {
  const { rows } = await getPool().query(
    `INSERT INTO repos (owner, name) VALUES ($1, $2) ON CONFLICT (owner, name) DO UPDATE SET owner = EXCLUDED.owner RETURNING id`,
    [owner, name]
  );
  return rows[0].id;
}

async function insertRun(repoId, status, { ref = null, createdAt = null } = {}) {
  const { rows } = await getPool().query(
    `INSERT INTO runs (repo_id, requested_ref, status, config, budget_cap_usd, created_at)
     VALUES ($1, $2, $3, '{}'::jsonb, 1.5, COALESCE($4, now())) RETURNING id`,
    [repoId, ref, status, createdAt]
  );
  return rows[0].id;
}

async function statusOf(runId) {
  const { rows } = await getPool().query(`SELECT status, failure_code FROM runs WHERE id = $1`, [runId]);
  return rows[0];
}

test("a new run is refused with QueueFullError once the queued-runs limit is hit", async () => {
  const repoId = await insertRepo("limit-test", "repo-a");
  await insertRun(repoId, "queued", { ref: "one" });
  // QUEUED_RUNS_LIMIT=1: one already-queued run fills it.
  await assert.rejects(() => startRun({ owner: "limit-test", name: "repo-b", ref: null }), QueueFullError);
});

test("rate_limited once runs-per-hour is hit, independent of current queue depth", async () => {
  const repoId = await insertRepo("rate-test", "repo-a");
  await insertRun(repoId, "complete", {});
  await insertRun(repoId, "failed", {});
  // RATE limit is 2/hour; both above count toward it even though neither is active/queued.
  await assert.rejects(() => startRun({ owner: "rate-test", name: "repo-b", ref: null }), RateLimitedError);
});

test("duplicate Generate for the same repo+ref returns the existing run, not a new one", async () => {
  process.env.QUEUED_RUNS_LIMIT = "5";
  process.env.RUNS_PER_HOUR_LIMIT = "50";
  const first = await startRun({ owner: "dup-test", name: "repo", ref: "main" });
  assert.equal(first.duplicateOf, null);
  const second = await startRun({ owner: "dup-test", name: "repo", ref: "main" });
  assert.equal(second.duplicateOf, first.runId);
  assert.equal(second.runId, first.runId);
});

test("queued -> failed: queue_timeout for a run queued past the 30-minute window", async () => {
  const repoId = await insertRepo("timeout-test", "repo");
  const staleId = await insertRun(repoId, "queued", { createdAt: new Date(Date.now() - 31 * 60 * 1000) });
  await tryStartNext();
  const stale = await statusOf(staleId);
  assert.equal(stale.status, "failed");
  assert.equal(stale.failure_code, "queue_timeout");
});

test("queued -> running: tryStartNext picks the oldest queued run and starts it, then chains to the next one", async () => {
  const repoId = await insertRepo("octocat", "Hello-World"); // real, tiny, stable - see T05
  const olderId = await insertRun(repoId, "queued", { createdAt: new Date(Date.now() - 5000) });
  const newerId = await insertRun(repoId, "queued", { createdAt: new Date() });

  await tryStartNext();
  // Give the async pipeline a moment to pick up and finish (tiny real repo, AI stub mode - fast).
  await new Promise((resolve) => setTimeout(resolve, 4000));

  const older = await statusOf(olderId);
  const newer = await statusOf(newerId);
  assert.notEqual(older.status, "queued", "the older run should have started before the newer one");
  assert.ok(["running", "complete", "complete_with_errors", "failed"].includes(newer.status), "the second run should have been picked up once the first finished");
});

test("AT-11: a run stuck 'running' from a previous process is recovered as failed:interrupted, queued runs are untouched", async () => {
  const repoId = await insertRepo("kill-test", "repo");
  const stuckId = await insertRun(repoId, "running", {});
  const queuedId = await insertRun(repoId, "queued", { ref: "other" });

  const recoveredIds = await recoverInterruptedRuns();
  assert.ok(recoveredIds.includes(stuckId));

  const stuck = await statusOf(stuckId);
  assert.equal(stuck.status, "failed");
  assert.equal(stuck.failure_code, "interrupted");

  const queued = await statusOf(queuedId);
  assert.equal(queued.status, "queued");
});

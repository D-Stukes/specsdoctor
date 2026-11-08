import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { migrate } from "../src/db/migrate.js";
import { getPool, closePool } from "../src/db/pool.js";
import { deleteExpiredFailedRuns } from "../src/runner/retention.js";

process.env.DATABASE_URL ??= "postgres://localhost:5432/docsync_test";

let repoId;
before(async () => {
  await migrate();
  const { rows } = await getPool().query(`INSERT INTO repos (owner, name) VALUES ('retention-test', $1) RETURNING id`, [crypto.randomUUID()]);
  repoId = rows[0].id;
});
after(async () => {
  await getPool().query(`DELETE FROM repos WHERE id = $1`, [repoId]).catch(() => {});
  await closePool();
});

const DAY = 24 * 60 * 60 * 1000;

async function insertRun(status, ageDays) {
  const at = new Date(Date.now() - ageDays * DAY);
  const { rows } = await getPool().query(
    `INSERT INTO runs (repo_id, status, config, budget_cap_usd, created_at, finished_at)
     VALUES ($1, $2::run_status, '{}'::jsonb, 1, $3::timestamptz, $3::timestamptz) RETURNING id`,
    [repoId, status, at]
  );
  await getPool().query(`INSERT INTO run_stages (run_id, stage) VALUES ($1, 'reader')`, [rows[0].id]);
  return rows[0].id;
}

test("T23: failed runs older than 7 days are removed with their children; everything else stays", async () => {
  const oldFailed = await insertRun("failed", 8);
  const recentFailed = await insertRun("failed", 1);
  const oldComplete = await insertRun("complete", 30);
  const oldQueued = await insertRun("queued", 30);

  const deleted = await deleteExpiredFailedRuns();
  assert.ok(deleted.includes(oldFailed));
  for (const id of [recentFailed, oldComplete, oldQueued]) assert.ok(!deleted.includes(id));

  const exists = async (id) => (await getPool().query(`SELECT 1 FROM runs WHERE id = $1`, [id])).rowCount === 1;
  assert.equal(await exists(oldFailed), false);
  assert.equal(await exists(recentFailed), true);
  assert.equal(await exists(oldComplete), true);
  assert.equal(await exists(oldQueued), true);

  const stages = await getPool().query(`SELECT 1 FROM run_stages WHERE run_id = $1`, [oldFailed]);
  assert.equal(stages.rowCount, 0, "child rows cascade");

  await getPool().query(`DELETE FROM runs WHERE repo_id = $1`, [repoId]);
});

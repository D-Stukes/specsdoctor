import crypto from "node:crypto";
import { getPool } from "../db/pool.js";
import { STAGE_NAMES } from "@docsync/contracts";

// Stand-in for the real runner (T04, built in Task 3). Fakes a resolved SHA
// and marches run_stages through pending -> running -> done on a timer, so
// T03's M1 ("the deployed app ... shows a stub run progressing") has
// something real to poll, without a Repo Reader, Scanner or any model call.
// Technical Design AT-15 calls this "stub mode."

const STAGE_DELAY_MS = 1500;

function fakeSha(owner, name, ref) {
  return crypto.createHash("sha1").update(`${owner}/${name}@${ref ?? "default"}`).digest("hex");
}

export async function startStubRun({ owner, name, ref }) {
  const pool = getPool();
  const resolvedSha = fakeSha(owner, name, ref);

  const { rows: repoRows } = await pool.query(
    `INSERT INTO repos (owner, name) VALUES ($1, $2)
     ON CONFLICT (owner, name) DO UPDATE SET owner = EXCLUDED.owner
     RETURNING id`,
    [owner, name]
  );
  const repoId = repoRows[0].id;

  const existing = await pool.query(
    `SELECT id FROM runs WHERE repo_id = $1 AND resolved_sha = $2 AND status IN ('queued', 'running')`,
    [repoId, resolvedSha]
  );
  if (existing.rows.length > 0) {
    return { runId: existing.rows[0].id, duplicateOf: existing.rows[0].id };
  }

  const config = { stub: true, models: null, prompt_version: "stub/0", schema_version: "stub/0", parser_version: "stub/0", limits: {} };
  const { rows: runRows } = await pool.query(
    `INSERT INTO runs (repo_id, requested_ref, resolved_sha, status, config, budget_cap_usd, started_at)
     VALUES ($1, $2, $3, 'running', $4, 1.5, now())
     RETURNING id`,
    [repoId, ref, resolvedSha, config]
  );
  const runId = runRows[0].id;

  for (const stage of STAGE_NAMES) {
    await pool.query(
      `INSERT INTO run_stages (run_id, stage, status, items_total) VALUES ($1, $2, 'pending', $3)`,
      [runId, stage, 10]
    );
  }

  runStages(runId).catch((err) => console.error(`stub run ${runId} failed:`, err));

  return { runId, duplicateOf: null };
}

async function runStages(runId) {
  const pool = getPool();
  for (const stage of STAGE_NAMES) {
    await pool.query(
      `UPDATE run_stages SET status = 'running', started_at = now() WHERE run_id = $1 AND stage = $2`,
      [runId, stage]
    );
    await sleep(STAGE_DELAY_MS);
    await pool.query(
      `UPDATE run_stages SET status = 'done', items_done = items_total, finished_at = now()
       WHERE run_id = $1 AND stage = $2`,
      [runId, stage]
    );
  }
  await pool.query(
    `UPDATE runs SET status = 'complete', cost_usd = 0, finished_at = now() WHERE id = $1`,
    [runId]
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import { getPool } from "../db/pool.js";

export async function initStages(runId, stages) {
  const pool = getPool();
  for (const stage of stages) {
    await pool.query(`INSERT INTO run_stages (run_id, stage, status) VALUES ($1, $2, 'pending')`, [runId, stage]);
  }
}

export async function startStage(runId, stage, itemsTotal) {
  await getPool().query(`UPDATE run_stages SET status = 'running', started_at = now(), attempt = attempt + 1, items_total = $3 WHERE run_id = $1 AND stage = $2`, [runId, stage, itemsTotal ?? null]);
}

export async function finishStage(runId, stage, status, { itemsDone = null, itemsFailed = null, message = null } = {}) {
  await getPool().query(
    `UPDATE run_stages SET status = $3, finished_at = now(), items_done = COALESCE($4, items_done), items_failed = COALESCE($5, items_failed), message = $6
     WHERE run_id = $1 AND stage = $2`,
    [runId, stage, status, itemsDone, itemsFailed, message]
  );
}

export async function skipStage(runId, stage, message) {
  await getPool().query(`UPDATE run_stages SET status = 'skipped', message = $3 WHERE run_id = $1 AND stage = $2`, [runId, stage, message]);
}

export async function recordEvent(runId, stage, level, code, detail) {
  await getPool().query(`INSERT INTO run_events (run_id, stage, level, code, detail) VALUES ($1, $2, $3, $4, $5)`, [runId, stage, level, code, detail ?? null]);
}

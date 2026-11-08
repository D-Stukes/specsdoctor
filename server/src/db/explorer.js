import { getPool } from "./pool.js";

export async function saveExplorer(runId, explorer, costUsd) {
  await getPool().query(
    `INSERT INTO explorer_runs (run_id, explorer, status, cost_usd) VALUES ($1, $2, $3, $4)
     ON CONFLICT (run_id) DO UPDATE SET explorer = EXCLUDED.explorer, status = EXCLUDED.status, cost_usd = EXCLUDED.cost_usd, created_at = now()`,
    [runId, JSON.stringify(explorer), explorer.source === "ai" ? "ready" : "template_only", costUsd]
  );
}

export async function loadExplorer(runId) {
  const { rows } = await getPool().query(`SELECT explorer FROM explorer_runs WHERE run_id = $1`, [runId]);
  return rows[0]?.explorer ?? null;
}

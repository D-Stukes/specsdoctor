import { getPool } from "../db/pool.js";
import { MODELS } from "../ai/models.js";

const DEFAULT_BUDGET_CAP_USD = 1.5; // §4a

/**
 * Creates (or returns the existing) run row for owner/name/ref, then the
 * caller fires runPipeline() without awaiting it - the run continues
 * server-side even if the browser disconnects (§4a).
 *
 * Duplicate guard: keyed on (repo, requested_ref) rather than the schema's
 * (repo, resolved_sha) unique index, since resolved_sha is only known once
 * the Repo Reader finishes - a second request for the same repo+ref made
 * while the first is still queued wouldn't collide on resolved_sha (both
 * NULL) but should still be treated as a duplicate (§4d "Duplicate
 * Generate").
 */
export async function startRun({ owner, name, ref }) {
  const pool = getPool();
  const { rows: repoRows } = await pool.query(
    `INSERT INTO repos (owner, name) VALUES ($1, $2)
     ON CONFLICT (owner, name) DO UPDATE SET owner = EXCLUDED.owner
     RETURNING id`,
    [owner, name]
  );
  const repoId = repoRows[0].id;

  const { rows: dupRows } = await pool.query(
    `SELECT id FROM runs WHERE repo_id = $1 AND requested_ref IS NOT DISTINCT FROM $2 AND status IN ('queued', 'running')
     ORDER BY created_at DESC LIMIT 1`,
    [repoId, ref]
  );
  if (dupRows.length > 0) {
    return { runId: dupRows[0].id, duplicateOf: dupRows[0].id };
  }

  const config = { stub: false, models: MODELS, prompt_version: "v1", schema_version: "index/1", parser_version: "js-0.1.0", limits: {} };
  const { rows } = await pool.query(
    `INSERT INTO runs (repo_id, requested_ref, status, config, budget_cap_usd, started_at)
     VALUES ($1, $2, 'running', $3, $4, now())
     RETURNING id`,
    [repoId, ref, config, DEFAULT_BUDGET_CAP_USD]
  );
  return { runId: rows[0].id, duplicateOf: null };
}

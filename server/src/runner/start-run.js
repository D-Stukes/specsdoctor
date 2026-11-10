import { getPool } from "../db/pool.js";
import { MODELS } from "../ai/models.js";
import { getLimits, QueueFullError, RateLimitedError } from "./limits.js";

const DEFAULT_BUDGET_CAP_USD = Number(process.env.RUN_BUDGET_CAP_USD) || 1.5; // §4a; env override for evaluation runs

/**
 * Creates (or returns the existing) run row for owner/name/ref as 'queued'.
 * The caller is responsible for calling tryStartNext() afterwards (queue.js)
 * to actually begin work - this function only enqueues, matching the real
 * state machine (`queued -> running: Runner picks the oldest queued run
 * when no run is active`, §4a).
 *
 * Duplicate guard: keyed on (repo, requested_ref) rather than the schema's
 * (repo, resolved_sha) unique index, since resolved_sha is only known once
 * the Repo Reader finishes - a second request for the same repo+ref made
 * while the first is still queued wouldn't collide on resolved_sha (both
 * NULL) but should still be treated as a duplicate (§4d "Duplicate
 * Generate").
 *
 * Throws QueueFullError or RateLimitedError if §4a's limits are hit; the
 * caller maps those to 503 / 429 (§4d).
 */
export async function startRun({ owner, name, ref, writeFor = "developers" }) {
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

  const limits = getLimits();
  const { rows: hourlyRows } = await pool.query(`SELECT count(*)::int AS n FROM runs WHERE created_at > now() - interval '1 hour'`);
  if (hourlyRows[0].n >= limits.runsPerHour) {
    throw new RateLimitedError(`Runs-per-hour limit (${limits.runsPerHour}) reached`);
  }

  // "Queued runs, app-wide: 3 (further requests get 429)" and "Active runs,
  // app-wide: 1" are separate limits (§4a) - a full active slot doesn't by
  // itself block new requests from queuing.
  const { rows: queuedRows } = await pool.query(`SELECT count(*)::int AS n FROM runs WHERE status = 'queued'`);
  if (queuedRows[0].n >= limits.queuedRuns) {
    throw new QueueFullError(`Queue is full (${limits.queuedRuns} already queued)`);
  }

  const config = { stub: false, models: MODELS, prompt_version: "v1", schema_version: "index/1", parser_version: "js-0.1.0", limits };
  const { rows } = await pool.query(
    `INSERT INTO runs (repo_id, requested_ref, status, config, budget_cap_usd, write_for)
     VALUES ($1, $2, 'queued', $3, $4, $5)
     RETURNING id`,
    [repoId, ref, config, DEFAULT_BUDGET_CAP_USD, writeFor]
  );
  return { runId: rows[0].id, duplicateOf: null };
}

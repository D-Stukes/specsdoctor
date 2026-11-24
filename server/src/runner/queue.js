import { getPool } from "../db/pool.js";
import { runPipeline } from "./pipeline.js";
import { getLimits, QUEUE_TIMEOUT_MS } from "./limits.js";

// §4a: "one Render instance runs an in-process runner... No external queue."
// This in-memory flag is that runner's single thread of execution - it's
// correct precisely because there's only one process, matching the
// documented limitation (no scaling past one instance without changes).
let running = false;

/**
 * Picks the oldest queued run and starts it, if no run is currently active
 * and queue limits allow it. Safe to call any time (after a run finishes,
 * after a new run is queued, on server boot) - it's a no-op if there's
 * nothing to do. Never throws; pipeline failures are handled inside
 * runPipeline itself.
 */
export async function tryStartNext() {
  if (running) return;
  const pool = getPool();

  // On a serverless host a run can be cut off without warning (e.g. Vercel's 5-minute limit),
  // leaving it 'running' forever and blocking the queue. Free any run stuck that long.
  const staleMinutes = Number(process.env.STALE_RUN_MINUTES) || 10;
  await pool.query(
    `UPDATE runs SET status = 'failed', failure_code = 'interrupted', finished_at = now()
     WHERE status = 'running' AND started_at < now() - ($1 || ' minutes')::interval`,
    [String(staleMinutes)]
  );

  const { rows: activeRows } = await pool.query(`SELECT count(*)::int AS n FROM runs WHERE status = 'running'`);
  if (activeRows[0].n >= getLimits().activeRuns) return;

  const { rows: queued } = await pool.query(
    `SELECT r.id, r.requested_ref, r.created_at, rp.owner, rp.name
     FROM runs r JOIN repos rp ON rp.id = r.repo_id
     WHERE r.status = 'queued' ORDER BY r.created_at ASC LIMIT 1`
  );
  if (queued.length === 0) return;
  const run = queued[0];

  // "queued -> failed: ... queued longer than 30 minutes" (§4a transition table).
  if (Date.now() - new Date(run.created_at).getTime() > QUEUE_TIMEOUT_MS) {
    await pool.query(`UPDATE runs SET status = 'failed', failure_code = 'queue_timeout', finished_at = now() WHERE id = $1`, [run.id]);
    return tryStartNext(); // try the next one in line
  }

  running = true;
  await pool.query(`UPDATE runs SET status = 'running', started_at = now() WHERE id = $1`, [run.id]);

  const aiStub = (process.env.AI_STUB_MODE ?? "").trim().toLowerCase() !== "false";
  return runPipeline(run.id, { owner: run.owner, name: run.name, ref: run.requested_ref }, { aiStub })
    .catch((err) => console.error(`run ${run.id} pipeline crashed:`, err))
    .finally(() => {
      running = false;
      return tryStartNext();
    });
}

/**
 * Restart recovery (§4a): on boot, a run stuck in 'running' means the
 * process died mid-run - it can't be resumed, so it's marked failed.
 * Queued runs are untouched; tryStartNext() picks them up normally.
 */
export async function recoverInterruptedRuns() {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE runs SET status = 'failed', failure_code = 'interrupted', finished_at = now()
     WHERE status = 'running' RETURNING id`
  );
  return rows.map((r) => r.id);
}

/** Exposed for tests only, to reset the in-memory lock between test cases. */
export function _resetQueueLockForTests() {
  running = false;
}

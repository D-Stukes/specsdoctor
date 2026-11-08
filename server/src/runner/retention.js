import { getPool } from "../db/pool.js";

// §4b Retention: failed runs (and, via ON DELETE CASCADE, their source text,
// pages and findings) are deleted after 7 days. Completed runs are kept so
// they can be rechecked.
export const FAILED_RUN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Deletes failed runs older than the retention window. Returns the deleted run ids. */
export async function deleteExpiredFailedRuns(now = Date.now()) {
  const cutoff = new Date(now - FAILED_RUN_RETENTION_MS);
  const { rows } = await getPool().query(
    `DELETE FROM runs
     WHERE status = 'failed' AND COALESCE(finished_at, created_at) < $1::timestamptz
     RETURNING id`,
    [cutoff]
  );
  return rows.map((r) => r.id);
}

async function runCleanup() {
  try {
    const deleted = await deleteExpiredFailedRuns();
    if (deleted.length > 0) console.log(`Retention: removed ${deleted.length} failed run(s) older than 7 days`);
  } catch (err) {
    console.error("retention cleanup failed:", err);
  }
}

/** Runs the cleanup now (server startup) and then every 24 hours. */
export function startRetentionJob() {
  runCleanup();
  const timer = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  timer.unref();
  return timer;
}

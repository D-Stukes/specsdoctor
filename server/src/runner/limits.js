// §4a "Limits" table, all env-configurable. A function, not a frozen
// object, so tests (and a real deploy changing env vars) see current values
// rather than whatever was set at first import.
export function getLimits() {
  return {
    activeRuns: Number(process.env.ACTIVE_RUNS_LIMIT) || 1,
    queuedRuns: Number(process.env.QUEUED_RUNS_LIMIT) || 3,
  };
}

export const QUEUE_TIMEOUT_MS = 30 * 60 * 1000; // "queued longer than 30 minutes" -> failed

export class QueueFullError extends Error {}

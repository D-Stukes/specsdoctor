// How many model calls run at once within a stage. The budget manager
// reserves synchronously before each call (AT-9), so overlapping calls
// can't overspend.
export const AI_CONCURRENCY = Number(process.env.AI_CONCURRENCY) || 4;

/** Runs fn(item) for every item, at most `limit` at a time, starting items in order. fn must handle its own errors. */
export async function forEachConcurrent(items, limit, fn) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

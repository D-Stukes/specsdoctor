import { test } from "node:test";
import assert from "node:assert/strict";
import { forEachConcurrent } from "../src/runner/concurrency.js";

test("forEachConcurrent never exceeds the limit, handles every item, and starts in order", async () => {
  let active = 0;
  let peak = 0;
  const started = [];
  await forEachConcurrent([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    started.push(n);
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active -= 1;
  });
  assert.equal(peak, 3);
  assert.deepEqual(started, [1, 2, 3, 4, 5, 6, 7]);
});

test("forEachConcurrent handles an empty list and a limit larger than the list", async () => {
  await forEachConcurrent([], 4, async () => assert.fail("not called"));
  const seen = [];
  await forEachConcurrent([1, 2], 10, async (n) => seen.push(n));
  assert.deepEqual(seen.sort(), [1, 2]);
});

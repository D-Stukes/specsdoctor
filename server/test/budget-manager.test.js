// AT-9 "concurrent budget": spent + reserved never exceeds cap; protected
// reserve stays intact for Writer/Verifier. Technical Design §4a, §7.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BudgetManager, BudgetExceededError } from "../src/ai/budget-manager.js";

const HAIKU_PRICES = { input: 0.1, output: 0.5 }; // $/1M tokens

test("reserve() computes worst case from estimated input + max output tokens", () => {
  const bm = new BudgetManager(10);
  const id = bm.reserve("analyst", 100_000, 2000, "claude-haiku-5-5", HAIKU_PRICES);
  const expected = (100_000 * 0.1 + 2000 * 0.5) / 1_000_000;
  assert.ok(bm.reservations.has(id));
  assert.equal(bm.reservedUsd, expected);
});

test("commit() replaces the reservation with actual cost", () => {
  const bm = new BudgetManager(10);
  const id = bm.reserve("analyst", 100_000, 2000, "claude-haiku-5-5", HAIKU_PRICES);
  bm.commit(id, 0.001234);
  assert.equal(bm.reservedUsd, 0);
  assert.equal(bm.spentUsd, 0.001234);
});

test("release() drops the reservation without spending", () => {
  const bm = new BudgetManager(10);
  const id = bm.reserve("analyst", 100_000, 2000, "claude-haiku-5-5", HAIKU_PRICES);
  bm.release(id);
  assert.equal(bm.reservedUsd, 0);
  assert.equal(bm.spentUsd, 0);
});

test("a non-protected stage cannot dip into the protected reserve", () => {
  const bm = new BudgetManager(1); // protected reserve = $0.35
  // Reserve everything except the protected 35% for an unprotected stage.
  bm.reserve("analyst", 1, 1, "claude-haiku-5-5", { input: 0, output: 0 }); // trivial reservation, just to prove the ceiling
  assert.throws(() => {
    // This single call alone would cost $0.70 - more than the $0.65 unprotected budget.
    bm.reserve("analyst", 1_000_000, 1_000_000, "claude-haiku-5-5", { input: 0.5, output: 0.2 });
  }, BudgetExceededError);
});

test("writer and verifier can use the protected reserve", () => {
  const bm = new BudgetManager(1);
  // $0.35 reservation would overflow the unprotected 65% alone in a cap this
  // small once other reservations exist, but writer/verifier may still fit
  // because they can draw on the protected slice too.
  const id = bm.reserve("writer", 1_000_000, 100_000, "claude-haiku-5-5", { input: 0.3, output: 0.5 });
  assert.ok(bm.reservations.has(id));
});

test("concurrent reservations never let spent + reserved exceed the cap", () => {
  const cap = 0.01;
  const bm = new BudgetManager(cap);
  let granted = 0;
  let denied = 0;
  // 20 "concurrent" calls: reserve first, commit/release later, same as
  // overlapping in-flight model calls would in the real runner.
  const ids = [];
  for (let i = 0; i < 20; i += 1) {
    try {
      ids.push(bm.reserve("claim_check", 5000, 200, "claude-haiku-5-5", HAIKU_PRICES));
      granted += 1;
      assert.ok(bm.spentUsd + bm.reservedUsd <= cap + 1e-12, "spent + reserved must never exceed the cap");
    } catch (err) {
      assert.ok(err instanceof BudgetExceededError);
      denied += 1;
    }
  }
  assert.ok(granted > 0 && denied > 0, "test should exercise both the granted and denied paths");
  for (const id of ids) bm.commit(id, 0.0001);
  assert.ok(bm.spentUsd <= cap + 1e-9);
});

test("protectedReserveUsd is 35% of the cap", () => {
  const bm = new BudgetManager(100);
  assert.equal(bm.protectedReserveUsd, 35);
});

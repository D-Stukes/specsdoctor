import { test } from "node:test";
import assert from "node:assert/strict";
import { callValidated } from "../src/ai/call-validated.js";

const fake = (answers) => {
  const calls = [];
  const fn = async (opts) => {
    calls.push(opts);
    return { parsed: answers[calls.length - 1], usage: null, costUsd: 0.01 };
  };
  return { fn, calls };
};
const isGood = (p) => p.ok === true;

test("a valid first answer is used with a single call", async () => {
  const { fn, calls } = fake([{ ok: true }]);
  const r = await callValidated({ stage: "x" }, isGood, fn);
  assert.equal(calls.length, 1);
  assert.deepEqual(r.parsed, { ok: true });
});

test("an invalid first answer is retried once and the second is returned, with both costs", async () => {
  const { fn, calls } = fake([{ ok: false }, { ok: true }]);
  const r = await callValidated({ stage: "x" }, isGood, fn);
  assert.equal(calls.length, 2);
  assert.deepEqual(r.parsed, { ok: true });
  assert.equal(r.costUsd, 0.02);
});

test("two invalid answers stop after the retry; the caller sees the bad answer and fails the stage", async () => {
  const { fn, calls } = fake([{ ok: false }, { ok: false }, { ok: true }]);
  const r = await callValidated({ stage: "x" }, isGood, fn);
  assert.equal(calls.length, 2);
  assert.deepEqual(r.parsed, { ok: false });
});

test("stub mode never retries", async () => {
  const { fn, calls } = fake([{ ok: false }]);
  await callValidated({ stage: "x", stub: () => ({}) }, isGood, fn);
  assert.equal(calls.length, 1);
});

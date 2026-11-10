// Task 8 / T20. The fixture's own two files already prove the common cases (see
// scanner-fixture.test.js's AT-1/env_vars/flagged_patterns tests, which now cover Python too via
// inventory.json). This file covers what they don't: a syntax error, an async function, an
// undocumented function, and the bridge's own graceful-degrade path when Python is unavailable.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPython, pythonAvailable, resetPythonAvailabilityCache } from "../src/scanner/python-bridge.js";

test("pythonAvailable() finds the real python3 on this machine", () => {
  assert.equal(pythonAvailable(), true);
});

test("a syntax error returns null (not a thrown exception)", () => {
  assert.equal(extractPython("def f(\n"), null);
});

test("an async function is extracted like a regular function", () => {
  const result = extractPython("async def fetch_data():\n    \"\"\"Gets data.\"\"\"\n    return 1\n");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].kind, "function");
  assert.equal(result.items[0].name, "fetch_data");
  assert.equal(result.items[0].doc, "Gets data.");
});

test("an undocumented function has documented: false, doc: null - never guessed", () => {
  const result = extractPython("def f():\n    return 1\n");
  assert.equal(result.items[0].documented, false);
  assert.equal(result.items[0].doc, null);
});

test("a module with no __all__ at all falls back to the underscore convention", () => {
  const result = extractPython("def public_fn():\n    pass\n\n\ndef _private_fn():\n    pass\n");
  const byName = Object.fromEntries(result.items.map((i) => [i.name, i.exported]));
  assert.equal(byName.public_fn, true);
  assert.equal(byName._private_fn, false);
});

test("a fully literal __all__ is resolved with no dynamic_all flag", () => {
  const result = extractPython('__all__ = ["a"]\n\n\ndef a():\n    pass\n\n\ndef b():\n    pass\n');
  const byName = Object.fromEntries(result.items.map((i) => [i.name, i.exported]));
  assert.equal(byName.a, true);
  assert.equal(byName.b, false);
  assert.deepEqual(result.flagged_patterns, []);
});

test("self/cls is dropped from a method's params, but a real param stays", () => {
  const result = extractPython("class C:\n    def m(self, x):\n        pass\n");
  const method = result.items.find((i) => i.name === "C.m");
  assert.deepEqual(method.params.map((p) => p.name), ["x"]);
});

test("extractPython returns null when Python isn't available, without crashing", () => {
  resetPythonAvailabilityCache();
  const result = extractPython("def f():\n    pass\n", { bin: "/nonexistent-python-binary" });
  assert.equal(result, null);
  resetPythonAvailabilityCache(); // leave the real check to re-run for any test after this one
});

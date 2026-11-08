import { test } from "node:test";
import assert from "node:assert/strict";
import { traceSteps } from "../../client/src/map-model.js";
import { fieldsFromEntry, parseWriteChip, replyOutcomes, firstIndexOfKind } from "../../client/src/data-motion.js";
import { buildGraph } from "../src/graph/build-graph.js";
import { scanFixture } from "./helpers/fixture.js";

const graph = buildGraph(scanFixture().index);
const post = graph.nodes.find((n) => n.label === "POST /api/habits");
const user = graph.nodes.find((n) => n.label === "POST /api/users");

test("fieldsFromEntry: the fields a request brings in, from the entry step's chips", () => {
  const steps = traceSteps(graph, post.id);
  assert.deepEqual(fieldsFromEntry(steps.find((s) => s.kind === "entry")), ["title"]);
  assert.deepEqual(fieldsFromEntry(null), []);
  assert.deepEqual(fieldsFromEntry({ chips: [] }), []);
});

test("parseWriteChip: the table and columns a write step saves, straight from its chip text", () => {
  const steps = traceSteps(graph, post.id);
  assert.deepEqual(parseWriteChip(steps.find((s) => s.kind === "write")), { table: "habits", columns: ["user id", "title"] });
  assert.equal(parseWriteChip(null), null);
  assert.equal(parseWriteChip({ chips: [] }), null);
});

test("parseWriteChip: a write with no named columns still gives the table", () => {
  const chip = { chips: [{ kind: "write", text: "saves: habits" }] };
  assert.deepEqual(parseWriteChip(chip), { table: "habits", columns: [] });
});

test("replyOutcomes: splits a reply step's chips into the happy path and the errors", () => {
  const steps = traceSteps(graph, post.id);
  const { good, bad } = replyOutcomes(steps.find((s) => s.kind === "reply"));
  assert.ok(good.some((c) => c.text === "back: id (201)"));
  assert.deepEqual(bad, []);
  assert.deepEqual(replyOutcomes(null), { good: [], bad: [] });
});

test("firstIndexOfKind: finds the first step of a kind, or -1", () => {
  const steps = traceSteps(graph, post.id);
  assert.equal(steps[firstIndexOfKind(steps, "entry")].kind, "entry");
  assert.equal(firstIndexOfKind(steps, "nope"), -1);
  assert.equal(firstIndexOfKind(traceSteps(graph, user.id), "caller"), -1, "this fixture endpoint has no screen calling it");
});

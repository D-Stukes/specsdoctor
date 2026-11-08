import { test } from "node:test";
import assert from "node:assert/strict";
import { traceSteps, endpointChoices, edgeLabel, nodeTitle, functionsSubgraph } from "../../client/src/map-model.js";
import { buildGraph } from "../src/graph/build-graph.js";
import { scanFixture } from "./helpers/fixture.js";

const graph = buildGraph(scanFixture().index);
const post = graph.nodes.find((n) => n.label === "POST /api/habits");

test("follow the data: a request reads as numbered steps from the entry to the answer: checks, then work, then saving", () => {
  const user = graph.nodes.find((n) => n.label === "POST /api/users");
  const steps = traceSteps(graph, user.id);
  assert.deepEqual(steps.map((s) => s.n), steps.map((_, i) => i + 1));
  const kinds = steps.map((s) => s.kind);
  assert.equal(kinds[0], "entry", "this fixture endpoint has no screen calling it");
  assert.equal(traceSteps(graph, post.id).filter((s) => s.kind === "work").map((s) => s.title).join(" / "), "Create habit / Create (habit service)");
  assert.ok(kinds.includes("check") && kinds.includes("work") && kinds.includes("write") && kinds.at(-1) === "reply");
  assert.ok(kinds.indexOf("check") < kinds.indexOf("work") && kinds.indexOf("work") < kinds.indexOf("write"), "checks, then work, then saving");
});

test("follow the data: data chips say what comes in, what is saved with which columns, and what goes back", () => {
  const steps = traceSteps(graph, post.id);
  assert.deepEqual(steps.find((s) => s.kind === "entry").chips.map((c) => c.text), ["in: title"]);
  assert.deepEqual(steps.find((s) => s.kind === "write").chips.map((c) => c.text), ["saves: habits (user id, title)"]);
  assert.deepEqual(traceSteps(graph, post.id, false).find((s) => s.kind === "write").chips.map((c) => c.text), ["saves: habits (user_id, title)"], "code names stay when plain is off");
  assert.ok(steps.find((s) => s.kind === "reply").chips.some((c) => c.text === "back: id (201)"));
});

test("follow the data: the work step names the function that does it, in plain words, with the technical name kept small", () => {
  const work = traceSteps(graph, post.id).filter((s) => s.kind === "work");
  assert.ok(work.some((s) => s.title === "Create habit" && s.technical === "createHabit()"));
  assert.ok(work.some((s) => s.title.toLowerCase().includes("create")), "the class method it calls is a step too");
  assert.ok(traceSteps(graph, post.id, false).every((s) => s.technical === null), "technical name is not repeated when plain mode is off");
});

test("follow the data: a request with a screen behind it starts with who asks", () => {
  const list = graph.nodes.find((n) => n.label === "GET /api/habits");
  const steps = traceSteps(graph, list.id);
  assert.equal(steps[0].kind, "caller");
  assert.ok(steps[0].title.length > 0);
  assert.ok(steps.some((s) => s.kind === "read" && s.chips[0].text === "reads: habits"));
});

test("follow the data: unknown endpoint gives no steps; choices put the busiest endpoint first", () => {
  assert.deepEqual(traceSteps(graph, "ep:nope"), []);
  const choices = endpointChoices(graph);
  assert.ok(choices.length >= 4);
  assert.equal(choices[0].data.writes.length + choices[0].data.reads.length > 0, true);
});

test("labels: plain words by default, technical names when plain is off", () => {
  assert.equal(edgeLabel({ kind: "queries_table", operation: "write" }, true), "saves to");
  assert.equal(edgeLabel({ kind: "queries_table", operation: "read" }, true), "looks up");
  assert.equal(edgeLabel({ kind: "queries_table", operation: "read" }, false), "queries table");
  assert.equal(edgeLabel({ kind: "calls_endpoint" }, true), "asks");
  assert.equal(edgeLabel({ kind: "grouped", label: "3 links" }, true), "3 links");
  assert.equal(nodeTitle(post, true), "Add a habit");
  assert.equal(nodeTitle(post, false), "POST /api/habits");
});

test("functions view: functions, the endpoints they serve or ask, and the calls between them", () => {
  const sub = functionsSubgraph(graph);
  const kinds = new Set(sub.edges.map((e) => e.kind));
  assert.ok(kinds.has("calls") && kinds.has("routes_to"));
  assert.ok(sub.edges.every((e) => ["calls", "routes_to", "calls_endpoint"].includes(e.kind)));
  const ids = new Set(sub.nodes.map((n) => n.id));
  assert.ok(sub.edges.every((e) => ids.has(e.from) && ids.has(e.to)));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDoc } from "@docsync/contracts";
import { buildGraph } from "../src/graph/build-graph.js";
import { applyGroups, groupByFolder } from "../src/graph/groups.js";
import { planTours } from "../src/tours/plan-tours.js";
import { makeTours } from "../src/stages/tour-agent.js";
import { scanFixture } from "./helpers/fixture.js";

const { index } = scanFixture();
const baseGraph = buildGraph(index);
const graph = applyGroups(baseGraph, groupByFolder(baseGraph));
const summaries = index.items.filter((i) => i.kind !== "endpoint").slice(0, 3).map((i) => ({ module_path: i.path, summary: { purpose: `Does the work of ${i.path}.` } }));

test("planner: up to four tours, each 2 to 8 stops, every stop a real node and every via_edge a real edge", () => {
  const plans = planTours(graph, index);
  assert.ok(plans.length >= 3, `got ${plans.map((p) => p.tour_id)}`);
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const edgeKeys = new Set(graph.edges.map((e) => `${e.from}|${e.to}`));
  for (const p of plans) {
    assert.ok(p.stops.length >= 2 && p.stops.length <= 8, p.tour_id);
    assert.equal(new Set(p.stops.map((s) => s.node_id)).size, p.stops.length, "no repeated stops");
    for (const s of p.stops) {
      assert.ok(nodeIds.has(s.node_id), s.node_id);
      if (s.via_edge) assert.ok(edgeKeys.has(s.via_edge.join("|")), `${s.via_edge} is not an edge`);
    }
  }
});

test("planner: 'follow a request' picks the endpoint with the most tables behind it, deterministically", () => {
  const plan = planTours(graph, index).find((p) => p.tour_id === "follow-request");
  const tablesBehind = (epId) => {
    const direct = graph.edges.filter((e) => e.from === epId && e.kind === "queries_table").map((e) => e.to);
    const handlers = graph.edges.filter((e) => e.from === epId && e.kind === "routes_to").map((e) => e.to);
    const viaHandler = graph.edges.filter((e) => handlers.includes(e.from) && e.kind === "queries_table").map((e) => e.to);
    return new Set([...direct, ...viaHandler]).size;
  };
  const chosen = plan.stops.find((s) => s.node_id.startsWith("ep:")).node_id;
  const most = Math.max(...graph.nodes.filter((n) => n.kind === "endpoint").map((n) => tablesBehind(n.id)));
  assert.equal(tablesBehind(chosen), most);
  assert.deepEqual(planTours(graph, index).map((p) => p.stops.map((s) => s.node_id)), planTours(graph, index).map((p) => p.stops.map((s) => s.node_id)));
});

test("planner: a graph with nothing to walk yields no tours", () => {
  assert.deepEqual(planTours({ nodes: [], edges: [], groups: [] }, { items: [], project: { workspaces: [], env_vars: [], tables: [] } }), []);
});

test("stub mode: tours still exist, valid tour/1, every stop narrated from facts by the template", async () => {
  const { tours, findings } = await makeTours({ runId: null, graph, index, summaries, budgetManager: null, stub: true });
  assert.ok(tours.length >= 3);
  assert.deepEqual(findings, []);
  for (const { tour, status } of tours) {
    assert.equal(validateDoc(tour).valid, true, JSON.stringify(validateDoc(tour).errors));
    assert.equal(status, "template_only");
    assert.ok(tour.stops.every((s) => s.narrated_by === "template" && s.narration.length > 10));
  }
});

// --- the model path, with a fake model ---
const fakeModel = (answerFor) => {
  const calls = [];
  const fn = async (opts) => {
    calls.push(opts.userMessage);
    return { parsed: answerFor(calls.length, opts.userMessage), usage: null, costUsd: 0.01 };
  };
  return { fn, calls };
};
const count = (msg) => (msg.match(/^\d+\. /gm) ?? []).length;
const narrate = (msg, text) => ({ schema_version: "tour-narration/1", title: "A tour", stops: Array.from({ length: count(msg) }, (_, i) => ({ index: i + 1, title: `Stop ${i + 1}`, narration: text(i + 1) })) });

test("model path: good narration is used and marked ai", async () => {
  const { fn } = fakeModel((n, msg) => narrate(msg, (i) => `This is stop number ${i} and it does real work.`));
  const { tours, findings } = await makeTours({ runId: null, graph, index, summaries, budgetManager: null, stub: false, callModel: fn });
  assert.deepEqual(findings, []);
  for (const { tour, status } of tours) {
    assert.equal(status, "ready");
    assert.equal(tour.source, "ai");
    assert.ok(tour.stops.every((s) => s.narrated_by === "ai" && s.title.startsWith("Stop")));
  }
});

test("model path: an invented name gets one rewrite; if the rewrite is clean there is no finding", async () => {
  const { fn, calls } = fakeModel((n, msg) => narrate(msg, (i) => (msg.includes("must not appear") ? `Stop ${i} does real work.` : `Stop ${i} calls ghost.run() somewhere.`)));
  const { tours, findings } = await makeTours({ runId: null, graph, index, summaries, budgetManager: null, stub: false, callModel: fn });
  assert.deepEqual(findings, []);
  assert.ok(calls.some((m) => m.includes("must not appear") && m.includes("ghost.run()")));
  assert.ok(tours.every(({ tour }) => tour.stops.every((s) => !s.narration.includes("ghost"))));
});

test("model path: a name that survives the rewrite falls back to the plain description and raises a finding", async () => {
  const { fn } = fakeModel((n, msg) => narrate(msg, (i) => (i === 1 ? "This stop calls ghost.run() for sure." : `Stop ${i} does real work.`)));
  const { tours, findings } = await makeTours({ runId: null, graph, index, summaries, budgetManager: null, stub: false, callModel: fn });
  assert.equal(findings.length, tours.length);
  assert.ok(findings.every((f) => f.stop === 1 && f.mentions.includes("ghost.run()")));
  for (const { tour } of tours) {
    assert.equal(tour.stops[0].narrated_by, "template");
    assert.ok(!tour.stops[0].narration.includes("ghost"));
    assert.equal(tour.stops[1].narrated_by, "ai");
  }
});

test("model path: unusable format twice, or a thrown error, gives template tours instead of nothing", async () => {
  for (const fn of [async () => ({ parsed: { nope: true }, usage: null, costUsd: 0 }), async () => { throw new Error("budget"); }]) {
    const { tours } = await makeTours({ runId: null, graph, index, summaries, budgetManager: null, stub: false, callModel: fn });
    assert.ok(tours.length >= 3);
    assert.ok(tours.every(({ tour, status }) => status === "template_only" && tour.stops.every((s) => s.narrated_by === "template")));
  }
});

test("model path: stops the model skips or numbers out of range are filled by the template, never dropped", async () => {
  const { fn } = fakeModel((n, msg) => ({ schema_version: "tour-narration/1", title: "T", stops: [{ index: 1, title: "First", narration: "Only the first." }, { index: 99, title: "Ghost", narration: "Out of range." }] }));
  const { tours } = await makeTours({ runId: null, graph, index, summaries, budgetManager: null, stub: false, callModel: fn });
  for (const { tour } of tours) {
    assert.equal(tour.stops[0].narrated_by, "ai");
    assert.ok(tour.stops.slice(1).every((s) => s.narrated_by === "template"));
  }
});

test("planner: the big-picture tour walks front to back (layer order never goes backwards)", () => {
  const rank = { frontend: 0, route: 1, middleware: 2, handler: 3, database: 4, module: 5 };
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const plan = planTours(graph, index).find((p) => p.tour_id === "big-picture");
  const ranks = plan.stops.map((s) => rank[nodeById.get(s.node_id).layer] ?? 5);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
});

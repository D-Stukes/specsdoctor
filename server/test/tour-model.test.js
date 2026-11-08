import { test } from "node:test";
import assert from "node:assert/strict";
import { tourSubgraph, walkedEdgeKeys, readingMs, layoutKindFor, stepIndex } from "../../client/src/tour-model.js";

const n = (id, layer = "handler", kind = "function") => ({ id, kind, layer, label: id });
const e = (from, to) => ({ from, to, kind: "routes_to", inferred: false, evidence: [] });
const graph = { nodes: [n("a"), n("b"), n("c"), n("d"), n("x1"), n("x2"), n("x3"), n("far")], edges: [e("a", "b"), e("b", "c"), e("a", "x1"), e("a", "x2"), e("a", "x3"), e("c", "far")] };
const tour = { stops: [{ node_id: "a" }, { node_id: "b", via_edge: ["a", "b"] }, { node_id: "missing" }, { node_id: "c", via_edge: ["b", "c"] }] };

test("tour subgraph: stops plus at most two neighbours each, stops that are not in the graph are ignored, edges only between kept nodes", () => {
  const sub = tourSubgraph(graph, tour);
  const ids = new Set(sub.nodes.map((x) => x.id));
  assert.ok(["a", "b", "c"].every((id) => ids.has(id)));
  assert.ok(!ids.has("missing"));
  assert.ok(!ids.has("x3"), "only two neighbours of a are added (x1, x2), x3 is the third");
  assert.ok(sub.edges.every((x) => ids.has(x.from) && ids.has(x.to)));
  assert.deepEqual([...sub.stopIds].sort(), ["a", "b", "c"]);
});

test("walked edges are exactly the stops' via_edge pairs", () => {
  assert.deepEqual([...walkedEdgeKeys(tour)].sort(), ["a|b", "b|c"]);
});

test("reading time: at least 2.5 s, about 0.38 s a word, faster at higher speed", () => {
  assert.equal(readingMs("short", 1), 2500);
  const long = Array(30).fill("word").join(" ");
  assert.equal(Math.round(readingMs(long, 1)), 11400);
  assert.equal(Math.round(readingMs(long, 1.5)), 7600);
  assert.equal(readingMs("short", 0.75) > readingMs("short", 1.5), true);
});

test("layout kind: layered columns for map layers, free layout for file-level tours", () => {
  assert.equal(layoutKindFor([n("a", "route", "endpoint"), n("b", "handler"), n("c", "database", "table")]), "architecture");
  assert.equal(layoutKindFor([n("m1", "module", "module"), n("m2", "frontend", "module"), n("m3", "module", "module")]), "dependencies");
});

test("stepping clamps to the first and last stop", () => {
  assert.equal(stepIndex(0, -1, 5), 0);
  assert.equal(stepIndex(4, 1, 5), 4);
  assert.equal(stepIndex(2, 1, 5), 3);
});

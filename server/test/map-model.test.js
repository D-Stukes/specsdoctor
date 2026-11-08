import { test } from "node:test";
import assert from "node:assert/strict";
import { subgraphFor, collapseByGroup } from "../../client/src/map-model.js";

const n = (id, layer, group, kind = "function") => ({ id, kind, layer, label: id, group });
const e = (from, to, kind, inferred = false) => ({ from, to, kind, inferred, evidence: [{ path: "a.js", start_line: 1, end_line: 1 }] });
const groups = [{ id: "auth", name: "Auth", summary: "s" }, { id: "todos", name: "Todos", summary: "s" }];

const graph = {
  schema_version: "graph/1",
  groups,
  nodes: [
    n("ui1", "frontend", "todos"), n("ui2", "frontend", "todos"), n("ep1", "route", "todos", "endpoint"), n("ep2", "route", "todos", "endpoint"),
    n("ep3", "route", "auth", "endpoint"), n("mw", "middleware", "auth"), n("tbl", "database", undefined, "table"),
    n("mod:a.js", "module", undefined, "module"), n("mod:b.js", "module", undefined, "module"),
  ],
  edges: [
    e("ui1", "ep1", "calls_endpoint", true), e("ui2", "ep2", "calls_endpoint", true), e("ep1", "tbl", "queries_table", true), e("ep2", "tbl", "queries_table", true),
    e("ep3", "mw", "uses_middleware"), e("ep3", "tbl", "queries_table", true), e("mod:a.js", "mod:b.js", "imports"),
  ],
};

test("collapsing by area replaces members with one node per area and drops edges inside an area", () => {
  const sub = subgraphFor(graph, "architecture", null);
  const c = collapseByGroup(sub, groups);
  assert.deepEqual(c.nodes.map((x) => x.id).sort(), ["group:auth", "group:todos", "tbl"]);
  assert.equal(c.nodes.find((x) => x.id === "group:todos").label, "Todos (4)");
  const todosToTbl = c.edges.find((x) => x.from === "group:todos" && x.to === "tbl");
  assert.equal(todosToTbl.label, "2 links");
  assert.equal(todosToTbl.inferred, true);
  assert.ok(!c.edges.some((x) => x.from === x.to));
  assert.equal(c.edges.length, 2);
});

test("a merged edge is solid if any edge in it is from the code", () => {
  const sub = { nodes: graph.nodes.filter((x) => ["ep3", "mw", "tbl"].includes(x.id)), edges: graph.edges.filter((x) => x.from === "ep3") };
  const c = collapseByGroup(sub, groups);
  const toTbl = c.edges.find((x) => x.to === "tbl");
  assert.equal(toTbl.inferred, true);
  assert.equal(c.edges.length, 1);
});

test("an expanded area keeps its member nodes and their own edges", () => {
  const sub = subgraphFor(graph, "architecture", null);
  const c = collapseByGroup(sub, groups, new Set(["todos"]));
  const ids = c.nodes.map((x) => x.id);
  assert.ok(["ui1", "ui2", "ep1", "ep2", "group:auth", "tbl"].every((id) => ids.includes(id)));
  assert.ok(!ids.includes("group:todos"));
  assert.ok(c.edges.some((x) => x.from === "ui1" && x.to === "ep1"));
});

test("dependencies view keeps only modules and import/mount edges; trace shows one endpoint's neighbourhood", () => {
  const dep = subgraphFor(graph, "dependencies", null);
  assert.deepEqual(dep.nodes.map((x) => x.id).sort(), ["mod:a.js", "mod:b.js"]);
  assert.equal(dep.edges.length, 1);
  const trace = subgraphFor(graph, "trace", "ep1");
  assert.deepEqual(trace.nodes.map((x) => x.id).sort(), ["ep1", "tbl", "ui1"]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDoc } from "@docsync/contracts";
import { buildGraph } from "../src/graph/build-graph.js";
import { scanFixture } from "./helpers/fixture.js";

const { index } = scanFixture();
const graph = buildGraph(index);

test("fixture graph validates against graph/1", () => {
  const { valid, errors } = validateDoc(graph);
  assert.equal(valid, true, JSON.stringify(errors));
});

test("every edge points at nodes that exist, and carries evidence or is marked inferred", () => {
  const ids = new Set(graph.nodes.map((n) => n.id));
  assert.ok(graph.edges.length > 0);
  for (const e of graph.edges) {
    assert.ok(ids.has(e.from) && ids.has(e.to), `dangling edge ${e.from} -> ${e.to}`);
    assert.ok(e.evidence.length > 0 || e.inferred, `edge ${e.kind} ${e.from} -> ${e.to} has neither evidence nor inferred`);
  }
});

test("edge evidence points at real files in the fixture index", () => {
  const filePaths = new Set(index.imports.flatMap((i) => [i.from, i.to]).concat(index.items.map((i) => i.path ?? i.declaration.path)));
  for (const e of graph.edges) for (const ev of e.evidence) assert.ok(filePaths.has(ev.path), `${ev.path} is not a scanned file`);
});

test("every fixture endpoint with a named handler gets a routes_to edge to that handler", () => {
  const expected = index.items.filter((i) => i.kind === "endpoint" && i.handler.symbol_id);
  assert.ok(expected.length > 0);
  for (const ep of expected) {
    assert.ok(graph.edges.some((e) => e.kind === "routes_to" && e.from === ep.id && e.to === ep.handler.symbol_id), ep.id);
  }
});

test("import edges are one per resolved import and cite the import line", () => {
  const importEdges = graph.edges.filter((e) => e.kind === "imports");
  assert.ok(importEdges.length > 0);
  assert.ok(importEdges.every((e) => !e.inferred && e.evidence[0].start_line >= 1));
  const unique = new Set(index.imports.map((i) => `${i.from}|${i.to}`));
  assert.equal(importEdges.length, unique.size);
});

test("tables from the index become database-layer nodes", () => {
  const tableNodes = graph.nodes.filter((n) => n.kind === "table");
  assert.equal(tableNodes.length, index.project.tables.length);
  assert.ok(tableNodes.every((n) => n.layer === "database"));
});

test("an import without a line (older persisted run) is kept but marked inferred", () => {
  const g = buildGraph({ items: [], imports: [{ from: "a.js", to: "b.js", kind: "import" }], project: { workspaces: [], env_vars: [], tables: [] } });
  assert.deepEqual(g.edges.map((e) => [e.kind, e.inferred, e.evidence.length]), [["imports", true, 0]]);
});

// --- T26: inferred edges ---

test("fixture: handlers that run SQL get queries_table edges to the real tables, all inferred with a cited line", () => {
  const edges = graph.edges.filter((e) => e.kind === "queries_table");
  assert.ok(edges.length >= 2);
  const tableIds = new Set(index.project.tables.map((t) => t.id));
  for (const e of edges) {
    assert.ok(tableIds.has(e.to), e.to);
    assert.equal(e.inferred, true);
    assert.ok(e.evidence[0].start_line >= 1);
  }
  assert.ok(edges.some((e) => e.to === "tbl:habits" && e.from.startsWith("sym:server/controllers/habits.js#")));
  assert.ok(edges.some((e) => e.to === "tbl:users"));
});

test("fixture: the frontend fetch of /api/habits becomes a calls_endpoint edge to GET /api/habits only", () => {
  const edges = graph.edges.filter((e) => e.kind === "calls_endpoint");
  assert.equal(edges.length, 1);
  assert.equal(edges[0].inferred, true);
  assert.ok(edges[0].from.includes("client/src/api/fetchHabits.js"));
  assert.ok(edges[0].to.startsWith("ep:GET /api/habits@"));
});

const ep = (method, path) => ({
  id: `ep:${method} ${path}@s.js:1`, kind: "endpoint", method, path, resolved: true,
  declaration: { path: "s.js", start_line: 1, end_line: 1 }, mounts: [], middleware: [], handler: { inline: { path: "s.js", start_line: 1, end_line: 1 } },
});
const mini = (calls, queries = []) => ({
  items: [ep("GET", "/api/users/:id"), ep("DELETE", "/api/users/:id"), ep("GET", "/api/users/:id/ping")],
  imports: [],
  graph_facts: { queries_table: queries, calls_endpoint: calls },
  project: { workspaces: [], env_vars: [], tables: [{ id: "tbl:users" }] },
});

test("calls_endpoint: :param segments match, method must agree, segment count must agree", () => {
  const g = buildGraph(mini([
    { path: "c.js", line: 1, url: "/api/users/:param", method: "GET" },
    { path: "c.js", line: 2, url: "/api/users/7", method: "DELETE" },
    { path: "c.js", line: 3, url: "/api/users", method: "GET" },
    { path: "c.js", line: 4, url: "/api/other", method: "GET" },
  ]));
  const got = g.edges.filter((e) => e.kind === "calls_endpoint").map((e) => `${e.evidence[0].start_line}->${e.to.split("@")[0]}`).sort();
  assert.deepEqual(got, ["1->ep:GET /api/users/:id", "2->ep:DELETE /api/users/:id"]);
});

test("calls_endpoint: an unknown method matches every method on that path", () => {
  const g = buildGraph(mini([{ path: "c.js", line: 1, url: "/api/users/:param", method: null }]));
  assert.equal(g.edges.filter((e) => e.kind === "calls_endpoint").length, 2);
});

test("queries_table: only known tables produce edges; code outside any function attaches to its module", () => {
  const g = buildGraph(mini([], [{ path: "db.js", line: 3, table: "users" }, { path: "db.js", line: 4, table: "ghosts" }]));
  const edges = g.edges.filter((e) => e.kind === "queries_table");
  assert.deepEqual(edges.map((e) => [e.from, e.to]), [["mod:db.js", "tbl:users"]]);
});

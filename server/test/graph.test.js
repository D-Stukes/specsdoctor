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

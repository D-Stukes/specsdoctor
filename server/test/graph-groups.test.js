import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDoc } from "@docsync/contracts";
import { validateGroups, groupByFolder, applyGroups } from "../src/graph/groups.js";
import { makeGraphGroups } from "../src/stages/grouper.js";
import { buildGraph } from "../src/graph/build-graph.js";
import { scanFixture } from "./helpers/fixture.js";

const graph = buildGraph(scanFixture().index);

test("validateGroups drops unknown ids, lets a node belong to one area only, and removes empty areas", () => {
  const [a, b, c] = graph.nodes;
  const { groups, droppedMembers } = validateGroups(
    [
      { id: "One", name: "One", summary: "s", members: [a.id, "sym:invented#thing", b.id] },
      { id: "Two", name: "Two", summary: "s", members: [b.id, c.id] },
      { id: "Ghost", name: "Ghost", summary: "s", members: ["sym:nope#x"] },
    ],
    graph
  );
  assert.deepEqual(groups.map((g) => [g.id, g.members]), [["one", [a.id, b.id]], ["two", [c.id]]]);
  assert.equal(droppedMembers, 3);
});

test("validateGroups makes duplicate area ids unique", () => {
  const [a, b] = graph.nodes;
  const { groups } = validateGroups([{ id: "x", name: "A", summary: "", members: [a.id] }, { id: "x", name: "B", summary: "", members: [b.id] }], graph);
  assert.deepEqual(groups.map((g) => g.id), ["x", "x-2"]);
});

test("groupByFolder puts every node with a file in a folder area and all tables in Database", () => {
  const groups = groupByFolder(graph);
  const placed = new Set(groups.flatMap((g) => g.members));
  assert.ok(graph.nodes.every((n) => placed.has(n.id)));
  const db = groups.find((g) => g.id === "database");
  assert.deepEqual(db.members.sort(), graph.nodes.filter((n) => n.kind === "table").map((n) => n.id).sort());
});

test("applyGroups yields a valid graph/1 whose nodes point at real areas", () => {
  const g = applyGroups(graph, groupByFolder(graph));
  const { valid, errors } = validateDoc(g);
  assert.equal(valid, true, JSON.stringify(errors));
  const ids = new Set(g.groups.map((x) => x.id));
  assert.ok(g.nodes.every((n) => n.group === undefined || ids.has(n.group)));
  assert.ok(g.nodes.some((n) => n.group));
});

test("stub mode makes no model call and returns folder areas", async () => {
  const result = await makeGraphGroups({ runId: null, graph, summaries: [], budgetManager: null, stub: true });
  assert.equal(result.source, "folders");
  assert.ok(result.groups.length > 0);
});

test("an empty graph yields no areas", async () => {
  const result = await makeGraphGroups({ runId: null, graph: { nodes: [], edges: [], groups: [] }, summaries: [], budgetManager: null, stub: false });
  assert.deepEqual(result.groups, []);
});

test("if the model call fails, the areas fall back to folders", async () => {
  // budgetManager null makes reserve() throw inside callStructured: the same path as an exhausted budget.
  const result = await makeGraphGroups({ runId: null, graph, summaries: [], budgetManager: null, stub: false });
  assert.equal(result.source, "folders");
});

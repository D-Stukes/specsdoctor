import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePlain, makePlainLanguage, overlayPlainLanguage } from "../src/stages/plain-language.js";
import { buildGraph } from "../src/graph/build-graph.js";
import { scanFixture } from "./helpers/fixture.js";

const graph = buildGraph(scanFixture().index);
const ep = graph.nodes.find((n) => n.label === "POST /api/habits");
const tbl = graph.nodes.find((n) => n.kind === "table");

test("validator keeps good translations and drops unknown ids, jargon, code-looking text and long labels", () => {
  const { translations, rejected } = validatePlain(
    [
      { id: ep.id, label: "Add a habit", summary: "Saves a new habit that you typed in." },
      { id: "sym:invented#x", label: "Ghost", summary: "Does nothing." },
      { id: tbl.id, label: "Saved habits", summary: "Calls the API endpoint to store JSON." },
      { id: graph.nodes[0].id, label: "Show the habits page", summary: "Renders `HabitsPage` with createHabit()." },
      { id: graph.nodes[1].id, label: "One two three four five six seven", summary: "Fine sentence." },
    ],
    graph
  );
  assert.deepEqual([...translations.keys()], [ep.id]);
  assert.equal(rejected.length, 4);
});

test("a duplicate id is only accepted once", () => {
  const { translations } = validatePlain([{ id: ep.id, label: "Add a habit", summary: "Saves a habit." }, { id: ep.id, label: "Another", summary: "Other." }], graph);
  assert.equal(translations.get(ep.id).label, "Add a habit");
});

test("stub mode and an empty graph make no call and return nothing", async () => {
  assert.deepEqual(await makePlainLanguage({ runId: null, graph, budgetManager: null, stub: true }), { nodes: [] });
  assert.deepEqual(await makePlainLanguage({ runId: null, graph: { nodes: [], edges: [], groups: [] }, budgetManager: null, stub: false }), { nodes: [] });
});

test("a failing model call leaves the parser-built plain labels in place", async () => {
  // budgetManager null makes the reservation throw inside callStructured, the same path as an exhausted budget
  assert.deepEqual(await makePlainLanguage({ runId: null, graph, budgetManager: null, stub: false }), { nodes: [] });
});

test("overlay replaces only the nodes that were translated", () => {
  const g = overlayPlainLanguage(graph, [{ id: ep.id, label: "Add a habit", summary: "Saves a new habit." }]);
  assert.equal(g.nodes.find((n) => n.id === ep.id).plain_summary, "Saves a new habit.");
  assert.equal(g.nodes.find((n) => n.id === tbl.id).plain_label, graph.nodes.find((n) => n.id === tbl.id).plain_label);
});

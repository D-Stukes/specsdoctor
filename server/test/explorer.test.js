import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { validateDoc } from "@docsync/contracts";
import { migrate } from "../src/db/migrate.js";
import { closePool } from "../src/db/pool.js";
import { makeToolbox } from "../src/chat/tools.js";
import { exploreRepo } from "../src/chat/explorer.js";
import { buildGraph } from "../src/graph/build-graph.js";
import { applyGroups, groupByFolder } from "../src/graph/groups.js";
import { scanFixture } from "./helpers/fixture.js";

process.env.DATABASE_URL ??= "postgres://localhost:5432/docsync_test";

before(async () => {
  await migrate();
});
after(async () => {
  await closePool();
});

const { index } = scanFixture();
const graph = applyGroups(buildGraph(index), groupByFolder(buildGraph(index)));
const toolbox = makeToolbox({ graph, index, pages: [] });
const run = (name, input) => JSON.parse(toolbox.run(name, input));

const text = (t) => ({ response: { stop_reason: "end_turn", content: [{ type: "text", text: t }] }, costUsd: 0.01 });
const useTool = (name, input, id = `tu_${name}`) => ({ response: { stop_reason: "tool_use", content: [{ type: "text", text: "Checking." }, { type: "tool_use", id, name, input }] }, costUsd: 0.01 });
const finishTool = (input, id = "tu_finish") => ({ response: { stop_reason: "tool_use", content: [{ type: "text", text: "Done looking." }, { type: "tool_use", id, name: "finish_exploration", input }] }, costUsd: 0.01 });
const scripted = (steps) => {
  const seen = [];
  return { seen, fn: async (params) => { seen.push(JSON.parse(JSON.stringify(params.messages))); return steps[Math.min(seen.length - 1, steps.length - 1)]; } };
};
const explore = (extra = {}) => exploreRepo({ runId: crypto.randomUUID(), graph, index, toolbox, stub: false, ...extra });

function fiveRealStops() {
  const actions = run("list", { kind: "actions" }).actions;
  const tables = run("list", { kind: "tables" }).tables;
  const picks = [...actions.slice(0, 3), ...tables.slice(0, 2)];
  assert.equal(picks.length, 5, "fixture needs at least 3 actions and 2 tables for this test");
  return picks.map((p) => ({ node_id: p.id, thought: `Let's see ${p.name}.`, title: p.name, narration: `This is ${p.name}, a part of the app.` }));
}

// ---- stub mode: always produces a valid, deterministic walk ----

test("stub mode: no model call, a valid explorer/1 walk from the deterministic planner", async () => {
  let called = false;
  const r = await exploreRepo({ runId: crypto.randomUUID(), graph, index, toolbox, stub: true, callModel: async () => { called = true; } });
  assert.equal(called, false);
  assert.equal(r.cost_usd, 0);
  assert.equal(r.explorer.source, "template");
  assert.equal(validateDoc(r.explorer).valid, true, JSON.stringify(validateDoc(r.explorer).errors));
  assert.ok(r.explorer.stops.length >= 2);
  assert.ok(r.explorer.stops.every((s) => s.narrated_by === "template" && s.thought.length > 0));
});

// ---- the agent loop, with a fake model ----

test("agent loop: explores with real tools, finishes, and every stop is grounded in what it looked up", async () => {
  const stops = fiveRealStops();
  const m = scripted([useTool("overview", {}), useTool("list", { kind: "actions" }), useTool("list", { kind: "tables" }), finishTool({ title: "A quick tour", stops, closing: "That's the shape of this app." })]);
  const r = await explore({ callModel: m.fn });
  assert.equal(r.explorer.source, "ai");
  assert.equal(validateDoc(r.explorer).valid, true, JSON.stringify(validateDoc(r.explorer).errors));
  assert.deepEqual(r.explorer.stops.map((s) => s.node_id), stops.map((s) => s.node_id));
  assert.ok(r.explorer.stops.every((s) => s.narrated_by === "ai" && Array.isArray(s.evidence)));
  assert.equal(r.explorer.title, "A quick tour");
  assert.equal(r.explorer.closing, "That's the shape of this app.");
});

test("agent loop: a node id never looked up with a tool is rejected, and a bad retry falls back to the deterministic walk", async () => {
  const badStops = Array.from({ length: 5 }, (_, i) => ({ node_id: `sym:invented#${i}`, thought: "Checking.", title: "Invented", narration: "Not real." }));
  const m = scripted([useTool("overview", {}), finishTool({ title: "t", stops: badStops, closing: "c" }), finishTool({ title: "t", stops: badStops, closing: "c" })]);
  const r = await explore({ callModel: m.fn });
  assert.equal(r.explorer.source, "template");
  assert.equal(validateDoc(r.explorer).valid, true);
  assert.equal(m.seen.length, 3);
});

test("agent loop: a grounded first attempt that gets rejected can still succeed on the retry", async () => {
  const stops = fiveRealStops();
  const bad = stops.map((s, i) => (i === 0 ? { ...s, node_id: "sym:invented#x" } : s));
  const m = scripted([useTool("overview", {}), useTool("list", { kind: "actions" }), useTool("list", { kind: "tables" }), finishTool({ title: "t", stops: bad, closing: "c" }), finishTool({ title: "t", stops, closing: "c" })]);
  const r = await explore({ callModel: m.fn });
  assert.equal(r.explorer.source, "ai");
  assert.deepEqual(r.explorer.stops.map((s) => s.node_id), stops.map((s) => s.node_id));
});

test("agent loop: names the model invents in a stop's words are treated the same as a bad finish", async () => {
  const stops = fiveRealStops();
  stops[0].narration = "It then calls sendWelcomeEmail() to finish.";
  const m = scripted([useTool("overview", {}), useTool("list", { kind: "actions" }), useTool("list", { kind: "tables" }), finishTool({ title: "t", stops, closing: "c" }), finishTool({ title: "t", stops, closing: "c" })]);
  const r = await explore({ callModel: m.fn });
  assert.equal(r.explorer.source, "template"); // second attempt repeats the same bad mention, so it falls back
});

test("agent loop: stops after the iteration cap without ever finishing, and falls back to the deterministic walk", async () => {
  const m = scripted([useTool("overview", {})]);
  const r = await explore({ callModel: m.fn });
  assert.equal(m.seen.length, 10);
  assert.equal(r.explorer.source, "template");
});

test("agent loop: a walk that burns the run budget before finishing falls back instead of erroring", async () => {
  const pricey = async () => ({ ...useTool("overview", {}), costUsd: 0.31 });
  const r = await explore({ callModel: pricey });
  assert.equal(r.explorer.source, "template");
});

test("agent loop: a stop count outside 5-9 is rejected and falls back after a bad retry", async () => {
  const tooFew = fiveRealStops().slice(0, 3);
  const m = scripted([useTool("overview", {}), finishTool({ title: "t", stops: tooFew, closing: "c" }), finishTool({ title: "t", stops: tooFew, closing: "c" })]);
  const r = await explore({ callModel: m.fn });
  assert.equal(r.explorer.source, "template");
});

// Task 12 / T34: the optional AI polish pass over the deterministic drafts. Every test here
// confirms the graceful-degrade posture - a guide must be usable even when this stage can't help.
import { test } from "node:test";
import assert from "node:assert/strict";
import { polishUserGuidePages } from "../src/stages/user-guide-writer.js";

function page(steps) {
  return {
    schema_version: "page/1",
    slug: "guide-follow-request",
    title: "Guide: Follow a request",
    sections: [{ heading: "Steps", blocks: [{ type: "prose", text: steps[0] }, { type: "evidence_link", path: "y.js", start_line: 1, end_line: 1 }, { type: "prose", text: steps[1] }] }],
  };
}

test("stub mode: steps pass through unchanged, no network call", async () => {
  const pages = [page(["Start here.", "The app does the work."])];
  const result = await polishUserGuidePages({ runId: null, pages, budgetManager: null, stub: true });
  assert.deepEqual(
    result[0].sections[0].blocks.filter((b) => b.type === "prose").map((b) => b.text),
    ["Start here.", "The app does the work."]
  );
});

test("a good rewrite replaces the steps, in order, keeping non-prose blocks untouched", async () => {
  const pages = [page(["Start here.", "The app does the work."])];
  const callModel = async () => ({ parsed: { steps: ["Begin on the home screen.", "The app handles it for you."] }, usage: null, costUsd: 0.001 });
  const result = await polishUserGuidePages({ runId: null, pages, budgetManager: null, stub: false, callModel });
  const blocks = result[0].sections[0].blocks;
  assert.deepEqual(blocks.map((b) => b.type), ["prose", "evidence_link", "prose"]);
  assert.equal(blocks[0].text, "Begin on the home screen.");
  assert.equal(blocks[2].text, "The app handles it for you.");
  assert.equal(blocks[1].path, "y.js");
});

test("a rewrite with the wrong number of steps is rejected - the deterministic draft ships", async () => {
  const pages = [page(["Start here.", "The app does the work."])];
  const callModel = async () => ({ parsed: { steps: ["Only one step."] }, usage: null, costUsd: 0.001 });
  const result = await polishUserGuidePages({ runId: null, pages, budgetManager: null, stub: false, callModel });
  assert.deepEqual(
    result[0].sections[0].blocks.filter((b) => b.type === "prose").map((b) => b.text),
    ["Start here.", "The app does the work."]
  );
});

test("a rewrite that reintroduces jargon is rejected - the deterministic draft ships", async () => {
  const pages = [page(["Start here.", "The app does the work."])];
  const callModel = async () => ({ parsed: { steps: ["Call the endpoint.", "The handler runs."] }, usage: null, costUsd: 0.001 });
  const result = await polishUserGuidePages({ runId: null, pages, budgetManager: null, stub: false, callModel });
  assert.deepEqual(
    result[0].sections[0].blocks.filter((b) => b.type === "prose").map((b) => b.text),
    ["Start here.", "The app does the work."]
  );
});

test("a thrown error (e.g. budget exceeded) is swallowed - the deterministic draft ships", async () => {
  const pages = [page(["Start here.", "The app does the work."])];
  const callModel = async () => {
    throw new Error("budget exceeded");
  };
  const result = await polishUserGuidePages({ runId: null, pages, budgetManager: null, stub: false, callModel });
  assert.deepEqual(
    result[0].sections[0].blocks.filter((b) => b.type === "prose").map((b) => b.text),
    ["Start here.", "The app does the work."]
  );
});

test("a page with no prose steps (shouldn't happen, but) is returned unchanged with no call at all", async () => {
  const empty = { schema_version: "page/1", slug: "guide-empty", title: "Guide: Empty", sections: [{ heading: "Steps", blocks: [] }] };
  let called = false;
  const callModel = async () => {
    called = true;
    return { parsed: { steps: [] }, usage: null, costUsd: 0 };
  };
  const result = await polishUserGuidePages({ runId: null, pages: [empty], budgetManager: null, stub: false, callModel });
  assert.equal(called, false);
  assert.deepEqual(result[0], empty);
});

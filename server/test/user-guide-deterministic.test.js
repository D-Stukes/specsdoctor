// Task 12 / T33-T35: plain-language user guides. The required, no-AI baseline - every flow
// planTours() already finds, rendered as a numbered guide instead of an animated tour.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDoc } from "@docsync/contracts";
import { buildGraph } from "../src/graph/build-graph.js";
import { applyGroups, groupByFolder } from "../src/graph/groups.js";
import { planTours } from "../src/tours/plan-tours.js";
import { buildUserGuidePages, guidePagesContainJargon } from "../src/stages/user-guide-deterministic.js";
import { scanFixture } from "./helpers/fixture.js";

const { index } = scanFixture();
const baseGraph = buildGraph(index);
const graph = applyGroups(baseGraph, groupByFolder(baseGraph));

test("buildUserGuidePages produces one valid page/1 per planTours() plan", () => {
  const plans = planTours(graph, index);
  const pages = buildUserGuidePages(graph, index);
  assert.equal(pages.length, plans.length);
  assert.deepEqual(
    pages.map((p) => p.slug).sort(),
    plans.map((p) => `guide-${p.tour_id}`).sort()
  );
  for (const page of pages) {
    const { valid, errors } = validateDoc(page);
    assert.equal(valid, true, JSON.stringify(errors));
  }
});

test("every guide step with evidence gets a bare evidence_link, never a developer ref block", () => {
  const plans = planTours(graph, index);
  const pages = buildUserGuidePages(graph, index);
  for (const page of pages) {
    const plan = plans.find((p) => `guide-${p.tour_id}` === page.slug);
    const blocks = page.sections[0].blocks;
    const expectedLinks = plan.stops.filter((s) => s.evidence?.[0]).length;
    const evidenceLinks = blocks.filter((b) => b.type === "evidence_link");
    assert.equal(evidenceLinks.length, expectedLinks);
    for (const b of evidenceLinks) {
      assert.ok(b.path && b.start_line && b.end_line, "evidence_link missing path/line");
    }
    // Never the developer-reference block types - those render signatures, param tables and
    // "Middleware:"/"Handler:" labels, exactly the jargon this page exists to avoid.
    assert.ok(blocks.every((b) => !["symbol_ref", "endpoint_ref", "table_ref", "route_ref"].includes(b.type)));
  }
});

test("no guide step contains developer jargon, even without the AI plain-language overlay having run", () => {
  const pages = buildUserGuidePages(graph, index);
  assert.equal(guidePagesContainJargon(pages), false);
});

// T25 / EV-5: the stale-README demo repo. The code was renamed, the README was not. DocSync's pages
// come from the code, so they must not repeat the README's stale names, and the check below shows
// exactly which README statements no longer match.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanDirectory } from "../scripts/lib/scan-dir.mjs";
import { readmeStaleNames } from "../scripts/lib/readme-check.mjs";
import { buildTechStackPage, buildDataModelPage, buildArchitecturePage, buildApiEndpointsPage, buildGettingStartedPage, buildConfigurationPage } from "../src/stages/architect-deterministic.js";
import { renderPage } from "../src/renderer/render-page.js";
import { buildGraph } from "../src/graph/build-graph.js";
import { planTours } from "../src/tours/plan-tours.js";

const builder = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "build-demo-repo.sh");
function build(version) {
  const dir = path.join(mkdtempSync(path.join(tmpdir(), "demo-habit-")), version);
  execFileSync(builder, ["--flat", version, dir]);
  return scanDirectory(dir, { owner: "demo", name: "habit-tracker" });
}
const v1 = build("v1");
const v2 = build("v2");
const repo = { owner: "demo", name: "habit-tracker", sha: "0".repeat(40) };

const allPages = (index) =>
  [buildTechStackPage, buildDataModelPage, buildArchitecturePage, buildApiEndpointsPage, buildGettingStartedPage, buildConfigurationPage].map((build) => renderPage(build(index), index, repo).markdown);

test("before the rename the README matches the code (nothing stale)", () => {
  assert.deepEqual(readmeStaleNames(v1.readme, { index: v1.index, files: v1.snapshot.files }), []);
});

test("after the rename the Scanner sees the new names and none of the old ones", () => {
  const names = v2.index.items.map((i) => i.name);
  assert.ok(names.includes("addHabit"));
  assert.ok(!names.includes("createHabit"));
  assert.ok(v2.index.project.env_vars.some((e) => e.id === "env:DATABASE_URL"));
  assert.ok(!v2.index.project.env_vars.some((e) => e.id === "env:DB_URL"));
  const scripts = v2.index.project.workspaces.flatMap((w) => Object.keys(w.scripts));
  assert.ok(scripts.includes("start") && !scripts.includes("dev"));
});

test("the README check names exactly the three stale statements", () => {
  const stale = readmeStaleNames(v2.readme, { index: v2.index, files: v2.snapshot.files });
  assert.deepEqual(stale.map((s) => [s.kind, s.text]).sort(), [["env_var", "DB_URL"], ["name", "createHabit()"], ["npm_script", "npm run dev"]]);
  assert.ok(stale.every((s) => s.line >= 1 && s.why.length > 10));
});

test("EV-5: no generated page repeats a stale README name, and the setup pages give the real command and variable", () => {
  const pages = allPages(v2.index).join("\n");
  for (const staleText of ["createHabit", "DB_URL", "npm run dev"]) assert.ok(!pages.includes(staleText), `a page repeats "${staleText}"`);
  assert.ok(pages.includes("DATABASE_URL"), "configuration should name DATABASE_URL");
  assert.ok(/npm (run )?start/.test(pages), "getting started should give the start command");
  assert.ok(pages.includes("addHabit") || pages.includes("/api/habits"));
});

test("the demo repo has the routes, tables and calls the map and tours need", () => {
  const graph = buildGraph(v2.index);
  assert.ok(graph.nodes.some((n) => n.kind === "endpoint" && n.label === "POST /api/habits"));
  assert.ok(graph.nodes.filter((n) => n.kind === "table").length === 2);
  assert.ok(graph.edges.some((e) => e.kind === "queries_table"));
  assert.ok(graph.edges.some((e) => e.kind === "calls_endpoint"));
  const plans = planTours(graph, v2.index);
  assert.ok(plans.some((p) => p.tour_id === "follow-request"), "a request tour exists for the demo repo");
});

test("the injected-defect demo flags the four checkable defects and honestly lets the wrong-behaviour one through", () => {
  const out = execFileSync(process.execPath, [path.join(path.dirname(builder), "demo-inject-defects.mjs")]).toString();
  assert.match(out, /4 of 4 checkable defects caught/);
  assert.equal((out.match(/FLAGGED/g) ?? []).length, 4);
  assert.match(out, /5\. A real function, wrong behaviour\s+passes the structural check/);
  assert.match(out, /Task 7, not built yet/);
});

// AT-1 (Scanner recall vs. independent inventory), AT-2 (route resolution),
// AT-3 (unsupported-pattern reporting) against fixture-pern-mini. Technical
// Design §7. The fellowship-repo half of AT-1/AT-2 can't run yet - PRD §8's
// open decision on which two repos is still unresolved.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { validateDoc } from "@docsync/contracts";
import { scan } from "../src/scanner/index.js";
import { buildFrontendPage } from "../src/stages/architect-deterministic.js";
import { renderPage } from "../src/renderer/render-page.js";

import { loadFixtureSnapshot, fixtureRoot } from "./helpers/fixture.js";

const { snapshot, contentByPath } = loadFixtureSnapshot();
const { index, updatedFiles } = scan(snapshot, contentByPath);
const inventory = JSON.parse(readFileSync(path.join(fixtureRoot, "inventory.json"), "utf8"));

function recall(expected, found) {
  const foundSet = new Set(found);
  const missing = expected.filter((id) => !foundSet.has(id));
  return { pct: expected.length === 0 ? 100 : (100 * (expected.length - missing.length)) / expected.length, missing };
}

test("Scanner output validates against the index/1 schema", () => {
  const { valid, errors } = validateDoc(index);
  assert.equal(valid, true, JSON.stringify(errors));
});

test("AT-1: code item recall on fixture-pern-mini is >= 95%", () => {
  const expected = inventory.code_items.map((i) => i.id);
  const found = index.items.filter((i) => i.kind !== "endpoint").map((i) => i.id);
  const { pct, missing } = recall(expected, found);
  assert.ok(pct >= 95, `recall was ${pct.toFixed(1)}%, missing: ${missing.join(", ")}`);
});

test("AT-2: every fixture endpoint resolves to the expected method + path", () => {
  const expected = inventory.endpoints.filter((e) => e.id).map((e) => `${e.method} ${e.resolved_path}`);
  const found = index.items.filter((i) => i.kind === "endpoint").map((i) => `${i.method} ${i.path}`);
  const { pct, missing } = recall(expected, found);
  assert.equal(pct, 100, `missing endpoints: ${missing.join(", ")}`);
});

test("AT-2: the dynamic mount prefix and the route resolution it gates are both reported", () => {
  assert.ok(index.coverage.flagged_patterns.some((f) => f.pattern === "dynamic_mount_prefix" && f.path === "server/index.js"));
  const usersCreate = index.items.find((i) => i.id.startsWith("ep:POST /api/users@"));
  assert.ok(usersCreate, "expected the resolved POST /api/users endpoint to exist");
  assert.equal(usersCreate.resolved, true);
});

test("AT-3: every expected flagged pattern is reported, with path and line", () => {
  const expected = new Set(inventory.flagged_patterns.map((f) => `${f.pattern}@${f.path}:${f.line}`));
  const found = new Set(index.coverage.flagged_patterns.map((f) => `${f.pattern}@${f.path}:${f.line}`));
  const missing = [...expected].filter((e) => !found.has(e));
  assert.deepEqual(missing, []);
});

test("file status counts match the hand-checked inventory exactly", () => {
  assert.deepEqual(index.coverage.files, inventory.files.counts);
});

test("the intentionally broken fixture file is marked failed, not scanned", () => {
  const broken = updatedFiles.find((f) => f.path === "server/broken/parse-error.js");
  assert.equal(broken.status, "failed");
});

test("env_vars and tables match the inventory exactly", () => {
  const envExpected = inventory.env_vars.map((e) => e.id).sort();
  const envFound = index.project.env_vars.map((e) => e.id).sort();
  assert.deepEqual(envFound, envExpected);

  const tablesExpected = inventory.tables.map((t) => t.id).sort();
  const tablesFound = index.project.tables.map((t) => t.id).sort();
  assert.deepEqual(tablesFound, tablesExpected);
});

test("workspaces report frontend:true only for the client package", () => {
  const client = index.project.workspaces.find((w) => w.dir === "client");
  const server = index.project.workspaces.find((w) => w.dir === "server");
  assert.equal(client.frontend, true);
  assert.equal(server.frontend, false);
});

// Task 9 / T21: react-router routes and top-level component props, against the hand-written
// ground truth in inventory.json's gated.frontend_route_props - written for this exact task.
test("T21: react-router routes match the fixture's expected_routes exactly", () => {
  const expected = inventory.gated.frontend_route_props.expected_routes
    .map((r) => `${r.path}|${r.element_component}|${r.source.path}:${r.source.line}|${r.via}`)
    .sort();
  const found = index.project.routes
    .map((r) => `${r.path}|${r.element_component}|${r.source.path}:${r.source.start_line}|${r.via}`)
    .sort();
  assert.deepEqual(found, expected);
});

test("T21: component props match the fixture's expected_props exactly", () => {
  for (const expected of inventory.gated.frontend_route_props.expected_props) {
    const item = index.items.find((i) => i.id === expected.component);
    assert.ok(item, `expected component item ${expected.component} to exist`);
    const found = [...item.params].sort((a, b) => a.name.localeCompare(b.name));
    const want = [...expected.props].sort((a, b) => a.name.localeCompare(b.name));
    assert.deepEqual(
      found.map((p) => [p.name, p.type]),
      want.map((p) => [p.name, p.type]),
      `props for ${expected.component}`
    );
  }
});

test("T21: buildFrontendPage renders a valid, source-linked frontend.md from the fixture", () => {
  const page = buildFrontendPage(index);
  assert.ok(page, "expected a frontend page - the fixture has routes and typed/untyped component props");
  const { valid, errors } = validateDoc(page);
  assert.equal(valid, true, JSON.stringify(errors));

  const repo = { owner: "AndrewJBateman", name: "fixture-pern-mini", sha: "a".repeat(40) };
  const { markdown, warnings } = renderPage(page, index, repo);
  assert.deepEqual(warnings, []);
  for (const route of inventory.gated.frontend_route_props.expected_routes) {
    assert.ok(markdown.includes(`\`${route.path}\``), `missing route ${route.path}`);
    assert.ok(markdown.includes(route.element_component), `missing element component ${route.element_component}`);
  }
  for (const prop of ["title", "streak", "userName", "onSignOut"]) {
    assert.ok(markdown.includes(`\`${prop}\``), `missing prop ${prop}`);
  }
  assert.ok(markdown.includes(`blob/${repo.sha}/client/src/App.jsx`), "expected a commit-pinned source link for a route");
});

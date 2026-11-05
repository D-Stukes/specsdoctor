// AT-1 (Scanner recall vs. independent inventory), AT-2 (route resolution),
// AT-3 (unsupported-pattern reporting) against fixture-pern-mini. Technical
// Design §7. The fellowship-repo half of AT-1/AT-2 can't run yet - PRD §8's
// open decision on which two repos is still unresolved.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateDoc } from "@docsync/contracts";
import { classifyFile, isMinified } from "../src/reader/classify-file.js";
import { scan } from "../src/scanner/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(__dirname, "..", "..", "fixtures", "fixture-pern-mini");

function walk(dir, base, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(full, rel, out);
    else out.push({ rel, full });
  }
}

function loadFixtureSnapshot() {
  const allFiles = [];
  walk(fixtureRoot, "", allFiles);

  const files = [];
  const contentByPath = {};
  for (const { rel, full } of allFiles) {
    if (rel === "inventory.json" || rel === "README.md") continue;
    const size = statSync(full).size;
    // server/env.example.txt stands in for .env.example - see the fixture's README.
    const classifyPath = rel === "server/env.example.txt" ? "server/.env.example" : rel;
    let classification = classifyFile(classifyPath, size);
    if (classification.status === "scanned") {
      const content = readFileSync(full, "utf8");
      if (isMinified(content)) {
        classification = { status: "skipped", reason: "minified" };
      } else {
        contentByPath[rel] = content;
      }
    }
    files.push({ path: rel, size, status: classification.status, reason: classification.reason });
  }

  const snapshot = {
    schema_version: "snapshot/1",
    repo: { owner: "fixture", name: "pern-mini" },
    requested_ref: null,
    resolved_sha: "0".repeat(40),
    files,
    limits_hit: [],
  };
  return { snapshot, contentByPath };
}

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

// Manual iteration harness: not part of the test suite (it's slow to read
// right, not to run). Walks fixtures/fixture-pern-mini/ from disk, runs it
// through the Scanner exactly like a real snapshot would, and prints a
// recall report against inventory.json. Run with:
//   node server/scripts/run-scanner-on-fixture.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyFile, isMinified } from "../src/reader/classify-file.js";
import { scan } from "../src/scanner/index.js";
import { validateDoc } from "@docsync/contracts";

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

const allFiles = [];
walk(fixtureRoot, "", allFiles);

const files = [];
const contentByPath = {};
for (const { rel, full } of allFiles) {
  if (rel === "inventory.json" || rel === "README.md") continue;
  const size = statSync(full).size;
  // server/env.example.txt stands in for .env.example - see fixture README.
  const classifyPath = rel === "server/env.example.txt" ? "server/.env.example" : rel;
  let classification = classifyFile(classifyPath, size);
  let content;
  if (classification.status === "scanned") {
    content = readFileSync(full, "utf8");
    if (isMinified(content)) {
      classification = { status: "skipped", reason: "minified" };
      content = undefined;
    } else {
      contentByPath[rel] = content;
    }
  }
  files.push({ path: rel, size, status: classification.status, reason: classification.reason, language: classification.language });
}

const snapshot = {
  schema_version: "snapshot/1",
  repo: { owner: "fixture", name: "pern-mini" },
  requested_ref: null,
  resolved_sha: "0".repeat(40),
  files: files.map(({ path: p, size, status, reason }) => ({ path: p, size, status, reason })),
  limits_hit: [],
};

const { index, updatedFiles } = scan(snapshot, contentByPath);

const { valid, errors } = validateDoc(index);
console.log("index/1 schema valid:", valid, errors ? JSON.stringify(errors, null, 2) : "");

const inventory = JSON.parse(readFileSync(path.join(fixtureRoot, "inventory.json"), "utf8"));

function recall(expectedIds, foundIds, label) {
  const found = new Set(foundIds);
  const missing = expectedIds.filter((id) => !found.has(id));
  const pct = expectedIds.length === 0 ? 100 : (100 * (expectedIds.length - missing.length)) / expectedIds.length;
  console.log(`\n${label}: ${expectedIds.length - missing.length}/${expectedIds.length} (${pct.toFixed(1)}%)`);
  if (missing.length) console.log("  missing:", missing.join(", "));
  return pct;
}

const foundItemIds = index.items.filter((i) => i.kind !== "endpoint").map((i) => i.id);
const expectedItemIds = inventory.code_items.map((i) => i.id);
recall(expectedItemIds, foundItemIds, "code_items");

const foundEndpointIds = index.items.filter((i) => i.kind === "endpoint").map((i) => `${i.method} ${i.path}`);
const expectedEndpointIds = inventory.endpoints.filter((e) => e.id).map((e) => `${e.method} ${e.resolved_path}`);
recall(expectedEndpointIds, foundEndpointIds, "endpoints (method+resolved_path)");

const foundEnvIds = index.project.env_vars.map((e) => e.id);
const expectedEnvIds = inventory.env_vars.map((e) => e.id);
recall(expectedEnvIds, foundEnvIds, "env_vars");

const foundTableIds = index.project.tables.map((t) => t.id);
const expectedTableIds = inventory.tables.map((t) => t.id);
recall(expectedTableIds, foundTableIds, "tables");

console.log("\nfile status counts:", JSON.stringify(index.coverage.files));
console.log("expected counts:", JSON.stringify(inventory.files.counts));

console.log("\nflagged_patterns found:", index.coverage.flagged_patterns.map((f) => `${f.pattern}@${f.path}:${f.line}`).join(", "));
console.log("expected flagged_patterns:", inventory.flagged_patterns.map((f) => `${f.pattern}@${f.path}:${f.line}`).join(", "));

console.log("\nparse failures:", updatedFiles.filter((f) => f.status === "failed").map((f) => f.path));

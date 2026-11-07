import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyFile, isMinified } from "../../src/reader/classify-file.js";
import { scan } from "../../src/scanner/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const fixtureRoot = path.join(__dirname, "..", "..", "..", "fixtures", "fixture-pern-mini");

function walk(dir, base, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(full, rel, out);
    else out.push({ rel, full });
  }
}

export function loadFixtureSnapshot() {
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


export function scanFixture() {
  const { snapshot, contentByPath } = loadFixtureSnapshot();
  return { ...scan(snapshot, contentByPath), contentByPath };
}

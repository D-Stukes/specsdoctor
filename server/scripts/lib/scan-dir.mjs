// Runs the real Reader-side classification and the Scanner over a directory on disk, the same way
// a GitHub snapshot would go through them. Demo and test tooling only.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { classifyFile, isMinified } from "../../src/reader/classify-file.js";
import { scan } from "../../src/scanner/index.js";

function walk(dir, base, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(full, rel, out);
    else out.push({ rel, full });
  }
}

export function scanDirectory(root, { owner = "demo", name = path.basename(root) } = {}) {
  const found = [];
  walk(root, "", found);
  const files = [];
  const contentByPath = {};
  for (const { rel, full } of found) {
    const size = statSync(full).size;
    let c = classifyFile(rel, size);
    if (rel.toLowerCase() === "readme.md") c = { status: "unsupported", reason: "extension_not_supported" };
    if (c.status === "scanned") {
      const content = readFileSync(full, "utf8");
      if (isMinified(content)) c = { status: "skipped", reason: "minified" };
      else contentByPath[rel] = content;
    }
    files.push({ path: rel, size, status: c.status, reason: c.reason });
  }
  const snapshot = { schema_version: "snapshot/1", repo: { owner, name }, requested_ref: null, resolved_sha: "0".repeat(40), files, limits_hit: [] };
  const { index } = scan(snapshot, contentByPath);
  const readmeFile = found.find((f) => f.rel.toLowerCase() === "readme.md");
  return { snapshot, index, contentByPath, readme: readmeFile ? readFileSync(readmeFile.full, "utf8") : null };
}

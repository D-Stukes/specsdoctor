// T25 demo: which statements in a README no longer match the code.
// Usage: node scripts/demo-readme-check.mjs [<directory>]   (default: the demo repo after the rename)
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanDirectory } from "./lib/scan-dir.mjs";
import { readmeStaleNames } from "./lib/readme-check.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
let dir = process.argv[2];
if (!dir) {
  dir = path.join(mkdtempSync(path.join(tmpdir(), "demo-readme-")), "habit-tracker");
  execFileSync(path.join(here, "build-demo-repo.sh"), ["--flat", "v2", dir]);
}
const { index, snapshot, readme } = scanDirectory(dir);
if (!readme) throw new Error(`No README.md in ${dir}`);

const stale = readmeStaleNames(readme, { index, files: snapshot.files });
if (stale.length === 0) {
  console.log("README matches the code: every name, variable, path and script it mentions exists.");
} else {
  console.log(`README.md says ${stale.length} thing(s) the code no longer does:\n`);
  for (const s of stale) console.log(`  line ${String(s.line).padEnd(3)} ${s.text.padEnd(18)} ${s.why}`);
  console.log("\nDocSync's pages are built from the code, so none of these appear in them.");
}

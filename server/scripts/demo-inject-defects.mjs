// T25 demo: injects defects into a documentation page and shows what the Verifier says about each.
// Usage: node scripts/demo-inject-defects.mjs   (uses the habit-tracker demo repo after the rename)
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanDirectory } from "./lib/scan-dir.mjs";
import { verifyPage } from "../src/stages/verifier.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(mkdtempSync(path.join(tmpdir(), "demo-defects-")), "habit-tracker");
execFileSync(path.join(here, "build-demo-repo.sh"), ["--flat", "v2", dir]);
const { index, contentByPath } = scanDirectory(dir, { owner: "demo", name: "habit-tracker" });

const real = "sym:server/controllers/habits.js#addHabit";
const file = "server/controllers/habits.js";
const defects = [
  { label: "1. A function that does not exist", claim: { text: "sendWelcomeEmail() emails new users.", kind: "behavior", symbols: ["sym:server/controllers/habits.js#sendWelcomeEmail"], evidence: [{ path: file, start_line: 4, end_line: 5 }] } },
  { label: "2. A line range past the end of the file", claim: { text: "addHabit() validates the name.", kind: "behavior", symbols: [real], evidence: [{ path: file, start_line: 400, end_line: 410 }] } },
  { label: "3. A file that does not exist", claim: { text: "Payments are handled in payments.js.", kind: "behavior", symbols: [real], evidence: [{ path: "server/controllers/payments.js", start_line: 1, end_line: 9 }] } },
  { label: "4. An endpoint that does not exist", claim: { text: "DELETE /api/habits/:id removes a habit.", kind: "behavior", symbols: [], evidence: [{ path: "server/routes/habits.js", start_line: 5, end_line: 5, symbol_id: "ep:DELETE /api/habits/:id@server/routes/habits.js:7" }] } },
  { label: "5. A real function, wrong behaviour", claim: { text: "addHabit() returns 204 with no body.", kind: "behavior", symbols: [real], evidence: [{ path: file, start_line: 10, end_line: 16 }] } },
];

const page = { schema_version: "page/1", slug: "demo-defects", title: "Demo: injected defects", sections: defects.map((d) => ({ heading: d.label, blocks: [{ type: "claim", claim: d.claim }] })) };
const { verifyResult, findings } = verifyPage({ page, rev: 1, index, contentByPath, renderWarnings: [] });

let caught = 0;
console.log("Injected defect".padEnd(46), "Verifier says");
console.log("-".repeat(46), "-".repeat(40));
verifyResult.claims.forEach((c, i) => {
  const failed = c.structural.status === "fail";
  if (failed) caught += 1;
  const verdict = failed ? `FLAGGED  ${c.structural.failures.join(", ")}` : "passes the structural check";
  console.log(defects[i].label.padEnd(46), verdict);
});
console.log(`\n${caught} of 4 checkable defects caught; ${findings.length} review item(s) raised.`);
console.log("Defect 5 passes because every name and line it cites is real. Only the AI claim check (Task 7, not built yet) could tell it is wrong.");
console.log('A wrong signature cannot be injected: signatures are copied from the code index by the renderer, never written by the model.');

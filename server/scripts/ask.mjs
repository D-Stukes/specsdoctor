// Ask a finished run a question from the terminal (real model when AI_STUB_MODE is "false", else closest matches).
// Usage: node --env-file=.env scripts/ask.mjs <run-id|latest> "question"
import { getPool, closePool } from "../src/db/pool.js";
import { loadGraphForRun } from "../src/db/load-graph.js";
import { loadIndexForRun } from "../src/db/load-index.js";
import { makeToolbox } from "../src/chat/tools.js";
import { askRepo } from "../src/chat/agent.js";

const [runArg, ...rest] = process.argv.slice(2);
const question = rest.join(" ");
const pool = getPool();
const runId =
  runArg === "latest"
    ? (await pool.query(`SELECT id FROM runs WHERE status IN ('complete','complete_with_errors') AND cost_usd > 0 ORDER BY created_at DESC LIMIT 1`)).rows[0].id
    : runArg;
const [graph, index, pages] = await Promise.all([
  loadGraphForRun(runId),
  loadIndexForRun(runId),
  pool.query(
    `SELECT p.slug, p.title, pr.markdown FROM pages p JOIN page_revisions pr ON pr.page_id = p.id AND pr.rev = p.current_rev WHERE p.run_id = $1 AND p.status = 'generated'`,
    [runId]
  ),
]);
const toolbox = makeToolbox({ graph, index, pages: pages.rows });
const started = Date.now();
const r = await askRepo({ runId, question, toolbox, index, stub: process.env.AI_STUB_MODE !== "false" });
console.log(`Q: ${question}\n\n${r.answer}\n`);
console.log(`sources: ${r.sources.map((s) => `${s.label}${s.where ? ` (${s.where})` : ""}`).join("; ") || "none"}`);
if (r.warnings.length) console.log(`names not in the code: ${r.warnings.join(", ")}`);
console.log(`mode: ${r.mode} · $${r.cost_usd} · ${((Date.now() - started) / 1000).toFixed(1)}s`);
await closePool();

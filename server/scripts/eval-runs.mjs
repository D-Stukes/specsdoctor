// T24 / EV-2: run real generations on named repos and record time, cost and
// findings. Usage: node --env-file=.env scripts/eval-runs.mjs <repo-url> [...]
// Needs AI_STUB_MODE=false. Stops launching runs once EVAL_TOTAL_CAP_USD
// (default 4) is spent; each run is also capped by RUN_BUDGET_CAP_USD.
import { writeFileSync, mkdirSync } from "node:fs";
import { createApp } from "../src/index.js";
import { migrate } from "../src/db/migrate.js";
import { getPool, closePool } from "../src/db/pool.js";

const urls = process.argv.slice(2);
const totalCap = Number(process.env.EVAL_TOTAL_CAP_USD) || 4;
if (process.env.AI_STUB_MODE !== "false") throw new Error("Set AI_STUB_MODE=false for an evaluation run");
if (urls.length === 0) throw new Error("Pass at least one repo URL");

await migrate();
const server = createApp().listen(0);
const base = `http://localhost:${server.address().port}`;
const login = await fetch(`${base}/api/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: process.env.ACCESS_CODE }) });
const headers = { cookie: login.headers.get("set-cookie").split(";")[0], "content-type": "application/json" };
const get = async (p) => (await fetch(`${base}${p}`, { headers })).json();

const results = [];
let spent = 0;
for (const url of urls) {
  if (spent >= totalCap) { console.log(`Total cap $${totalCap} reached, skipping ${url}`); break; }
  const started = await (await fetch(`${base}/api/runs`, { method: "POST", headers, body: JSON.stringify({ repo_url: url }) })).json();
  if (!started.run_id) { results.push({ url, error: started }); continue; }
  let run;
  do {
    await new Promise((r) => setTimeout(r, 2000));
    run = await get(`/api/runs/${started.run_id}`);
  } while (["queued", "running"].includes(run.status));

  const { pages } = await get(`/api/runs/${started.run_id}/pages`);
  const { findings } = await get(`/api/runs/${started.run_id}/findings`);
  const { rows: calls } = await getPool().query(
    `SELECT model, count(*)::int AS calls, sum(input_tokens)::int AS input_tokens, sum(output_tokens)::int AS output_tokens,
            count(*) FILTER (WHERE status <> 'success')::int AS failed
     FROM model_calls WHERE run_id = $1 GROUP BY model`, [started.run_id]);
  spent += run.cost_usd;
  results.push({
    url, run_id: started.run_id, status: run.status, resolved_sha: run.resolved_sha,
    duration_s: run.duration_ms == null ? null : Math.round(run.duration_ms / 100) / 10,
    cost_usd: run.cost_usd, budget_cap_usd: run.budget_cap_usd, coverage: run.coverage,
    failed_stages: run.stages.filter((s) => s.status === "failed" || s.status === "partial").map((s) => s.stage),
    pages: pages.map((p) => `${p.slug}:${p.status}`), page_count: pages.length,
    findings: findings.map((f) => ({ page: f.page_slug, reason: f.reason, severity: f.severity, message: f.message })),
    model_calls: calls,
  });
  console.log(`${url}: ${run.status}, ${run.duration_ms / 1000}s, $${run.cost_usd}, ${findings.length} finding(s); total spent $${spent.toFixed(4)}`);
}

mkdirSync("../docs/evaluation", { recursive: true });
const out = `../docs/evaluation/ev2-${new Date().toISOString().slice(0, 10)}-${Date.now()}.json`;
writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), total_cap_usd: totalCap, spent_usd: spent, models: process.env.MODELS_NOTE ?? "see src/ai/models.js", results }, null, 2));
console.log("wrote", out);
server.close();
await closePool();

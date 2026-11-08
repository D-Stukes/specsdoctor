// EV-2 summary: median time and cost per repo from an eval-runs JSON file.
// Usage: node scripts/eval-summary.mjs ../docs/evaluation/<file>.json
import { readFileSync } from "node:fs";

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const data = JSON.parse(readFileSync(process.argv[2], "utf8"));
const byRepo = new Map();
for (const r of data.results) {
  if (!r.run_id) continue;
  const list = byRepo.get(r.url) ?? [];
  list.push(r);
  byRepo.set(r.url, list);
}
console.log("| Repo | Runs | Statuses | Median time | Median cost | Findings per run |");
console.log("| --- | --- | --- | --- | --- | --- |");
for (const [url, runs] of byRepo) {
  const statuses = [...new Set(runs.map((r) => r.status))].join(", ");
  console.log(`| ${url.split("/").slice(-1)[0]} | ${runs.length} | ${statuses} | ${median(runs.map((r) => r.duration_s)).toFixed(1)} s | $${median(runs.map((r) => r.cost_usd)).toFixed(4)} | ${runs.map((r) => r.findings.length).join(", ")} |`);
}
console.log(`\nTotal spent: $${data.spent_usd.toFixed(4)} of $${data.total_cap_usd} cap`);

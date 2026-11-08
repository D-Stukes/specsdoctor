// T24 / EV-1: draws the 50-statement accuracy sample, 10 per page type, from
// finished runs and writes a rating sheet (CSV) for two independent raters.
// Usage: node --env-file=.env scripts/sample-claims.mjs <run-id> [<run-id> ...] [--seed=N]
// With no run ids it uses the most recent finished run that cost money
// (a real run, not stub) for each repo.
import { writeFileSync, mkdirSync } from "node:fs";
import { getPool, closePool } from "../src/db/pool.js";

const args = process.argv.slice(2);
const seed = Number((args.find((a) => a.startsWith("--seed=")) ?? "--seed=1").split("=")[1]);
let runIds = args.filter((a) => !a.startsWith("--"));

const TYPES = ["reference", "api-endpoints", "getting-started/configuration", "architecture", "data-model/other"];
const PER_TYPE = 10;

function typeOf(slug) {
  if (slug === "api-endpoints") return "api-endpoints";
  if (slug === "getting-started" || slug === "configuration") return "getting-started/configuration";
  if (slug === "architecture" || slug === "overview") return "architecture";
  if (slug === "data-model" || slug === "tech-stack") return "data-model/other";
  return "reference";
}

// Small seeded PRNG so the same seed gives the same sample.
function rng(s) {
  let t = s >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Statements a reviewer can mark right or wrong: prose/claim text on AI pages, paragraphs and blocks on rendered pages. */
function statementsOf(page) {
  const out = [];
  if (page.structured) {
    for (const section of page.structured.sections ?? []) {
      for (const block of section.blocks) {
        if (block.type === "prose" && block.text.trim().length > 25) out.push(block.text.trim());
        if (block.type === "claim") out.push(block.claim.text.trim());
      }
    }
  }
  // Deterministic parts (signatures, endpoints, tables, commands) only exist in the rendered Markdown.
  const chunks = page.markdown.split(/\n{2,}/).map((c) => c.trim()).filter((c) => c.length > 25 && !c.startsWith("# ") && !c.startsWith("## "));
  const deterministic = out.length === 0 ? chunks : chunks.filter((c) => !out.some((s) => c.includes(s.slice(0, 40))));
  return [...out.map((text) => ({ text, source: "ai" })), ...deterministic.map((text) => ({ text, source: "rendered" }))];
}

const pool = getPool();
if (runIds.length === 0) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (r.repo_id) r.id FROM runs r WHERE r.status IN ('complete','complete_with_errors') AND r.cost_usd > 0 ORDER BY r.repo_id, r.created_at DESC`
  );
  runIds = rows.map((r) => r.id);
}
if (runIds.length === 0) throw new Error("No finished real runs found; pass run ids");

const pools = new Map(TYPES.map((t) => [t, []]));
for (const runId of runIds) {
  const { rows: meta } = await pool.query(`SELECT rp.owner, rp.name, r.resolved_sha FROM runs r JOIN repos rp ON rp.id = r.repo_id WHERE r.id = $1`, [runId]);
  const repo = `${meta[0].owner}/${meta[0].name}`;
  const { rows: pages } = await pool.query(
    `SELECT p.slug, pr.markdown, pr.structured FROM pages p JOIN page_revisions pr ON pr.page_id = p.id AND pr.rev = p.current_rev WHERE p.run_id = $1 AND p.status = 'generated' ORDER BY p.slug`,
    [runId]
  );
  for (const page of pages) {
    for (const st of statementsOf(page)) pools.get(typeOf(page.slug)).push({ repo, sha: meta[0].resolved_sha.slice(0, 7), page: page.slug, ...st });
  }
}

const rand = rng(seed);
const sample = [];
const shortfalls = [];
for (const type of TYPES) {
  const picked = shuffle(pools.get(type), rand).slice(0, PER_TYPE);
  if (picked.length < PER_TYPE) shortfalls.push(`${type}: only ${picked.length} available`);
  sample.push(...picked.map((s) => ({ type, ...s })));
}

const csvCell = (v) => `"${String(v).replace(/"/g, '""').replace(/\n/g, " ")}"`;
const header = ["id", "type", "repo", "commit", "page", "source", "statement", "rater_a (accurate / inaccurate / critical)", "rater_b (accurate / inaccurate / critical)", "notes"];
const rows = sample.map((s, i) => [i + 1, s.type, s.repo, s.sha, s.page, s.source, s.text, "", "", ""]);
mkdirSync("../docs/evaluation", { recursive: true });
const out = `../docs/evaluation/ev1-sample-${new Date().toISOString().slice(0, 10)}-seed${seed}.csv`;
writeFileSync(out, [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n");
console.log(`wrote ${out}: ${sample.length} statements from ${runIds.length} run(s), seed ${seed}`);
for (const t of TYPES) console.log(`  ${t}: ${sample.filter((s) => s.type === t).length} of ${pools.get(t).length} available`);
if (shortfalls.length) console.log("Shortfalls:", shortfalls.join("; "));
await closePool();

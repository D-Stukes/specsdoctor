import express from "express";
import { getPool } from "../db/pool.js";
import { parseRepoUrl } from "../repo-url.js";
import { startRun } from "../runner/start-run.js";
import { tryStartNext } from "../runner/queue.js";
import { QueueFullError, RateLimitedError } from "../runner/limits.js";
import { loadIndexForRun } from "../db/load-index.js";
import { scanRenderedPageForUnknownMentions } from "../stages/verifier.js";
import { buildMkdocsYml, buildExportReadme } from "../export/mkdocs-config.js";
import { buildProvenanceMarkdown } from "../export/provenance.js";
import { loadGraphForRun } from "../db/load-graph.js";
import { loadTours } from "../db/tours.js";
import { askRepo, ChatLimitError } from "../chat/agent.js";
import { makeToolbox } from "../chat/tools.js";
import { buildExportZip } from "../export/build-zip.js";
import { appendInlineFindings, buildReviewMarkdown } from "../export/review.js";
import crypto from "node:crypto";

export const runsRouter = express.Router();

// POST /api/runs - start a run. Real Repo Reader + Scanner + Analyst +
// Writer + Renderer + Verifier (Task 1-3, Task 5's structural half), run
// through the queue (T04: active-run, queue-size and runs-per-hour limits,
// §4a). AI_STUB_MODE defaults to true (canned Analyst/Writer responses,
// zero cost) so this never spends money by accident - set AI_STUB_MODE=
// false with a real ANTHROPIC_API_KEY to call Claude for real. Architect's
// narrative pages are deterministic-only beyond overview.md; the AI claim
// check and repair loop (Task 7, T16) aren't built.
runsRouter.post("/runs", async (req, res) => {
  const { repo_url, ref } = req.body ?? {};
  const parsed = parseRepoUrl(repo_url);
  if (!parsed) {
    return res.status(400).json({ error: { code: "invalid_url", message: "Expected https://github.com/<owner>/<repo>" } });
  }

  const resolvedRef = ref ?? parsed.ref;
  let runId, duplicateOf;
  try {
    ({ runId, duplicateOf } = await startRun({ owner: parsed.owner, name: parsed.name, ref: resolvedRef }));
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return res.status(429).json({ error: { code: "rate_limited", message: err.message } });
    }
    if (err instanceof QueueFullError) {
      return res.status(503).json({ error: { code: "queue_full", message: err.message } });
    }
    throw err;
  }

  if (!duplicateOf) {
    tryStartNext().catch((err) => console.error("tryStartNext failed:", err));
  }
  res.status(202).json({ run_id: runId, status: "queued", duplicate_of: duplicateOf });
});

// GET /api/runs/:id/pages - sidebar list, with real check/review status (T17).
runsRouter.get("/runs/:id/pages", async (req, res) => {
  const { rows } = await getPool().query(
    `SELECT p.slug, p.title, p.status, p.current_rev,
            pr.checks_fresh, pr.reviewed_at,
            COALESCE(f.open_findings, 0)::int AS open_findings
     FROM pages p
     JOIN page_revisions pr ON pr.page_id = p.id AND pr.rev = p.current_rev
     LEFT JOIN (
       SELECT page_id, count(*) AS open_findings FROM review_items WHERE status = 'open' GROUP BY page_id
     ) f ON f.page_id = p.id
     WHERE p.run_id = $1 ORDER BY p.slug`,
    [req.params.id]
  );
  res.json({
    pages: rows.map((p) => ({
      slug: p.slug,
      title: p.title,
      status: p.status,
      current_rev: p.current_rev,
      checks_fresh: p.checks_fresh,
      reviewed: p.reviewed_at != null,
      open_findings: p.open_findings,
    })),
  });
});

// GET /api/runs/:id/pages/:slug - one page, current revision, with real claim_checks (T17).
runsRouter.get("/runs/:id/pages/:slug", async (req, res) => {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT p.id AS page_id, p.status, pr.rev, pr.origin, pr.markdown, pr.checks_fresh, pr.reviewed_at
     FROM pages p JOIN page_revisions pr ON pr.page_id = p.id AND pr.rev = p.current_rev
     WHERE p.run_id = $1 AND p.slug = $2`,
    [req.params.id, req.params.slug]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: { code: "page_not_found", message: "No such page" } });
  }
  const page = rows[0];

  const { rows: checks } = await pool.query(
    `SELECT structural, ai_assessment FROM claim_checks WHERE page_id = $1 AND rev = $2`,
    [page.page_id, page.rev]
  );
  const ai = { supported: 0, contradicted: 0, insufficient_evidence: 0, not_assessed: 0 };
  for (const c of checks) ai[c.ai_assessment] = (ai[c.ai_assessment] ?? 0) + 1;

  res.json({
    slug: req.params.slug,
    rev: page.rev,
    origin: page.origin,
    markdown: page.markdown,
    status: page.status,
    checks: { fresh: page.checks_fresh, structural_fail: checks.some((c) => c.structural === "fail"), ai },
    reviewed_at: page.reviewed_at,
  });
});

// PUT /api/runs/:id/pages/:slug - save an explicit edit (T17, no autosave).
// Inserts a new revision; re-runs the one deterministic check we can run on
// free text alone (the unknown-mention scan, §4b "unknown project symbols").
// Source-link bounds aren't rechecked here: that needs the pinned file
// content, which isn't persisted per revision yet - a known gap (see LOG.md).
runsRouter.put("/runs/:id/pages/:slug", async (req, res) => {
  const pool = getPool();
  const { base_rev, markdown } = req.body ?? {};
  if (typeof base_rev !== "number" || typeof markdown !== "string") {
    return res.status(400).json({ error: { code: "invalid_body", message: "base_rev (number) and markdown (string) are required" } });
  }

  const { rows: pageRows } = await pool.query(`SELECT id, current_rev FROM pages WHERE run_id = $1 AND slug = $2`, [req.params.id, req.params.slug]);
  if (pageRows.length === 0) {
    return res.status(404).json({ error: { code: "page_not_found", message: "No such page" } });
  }
  const page = pageRows[0];
  if (base_rev !== page.current_rev) {
    return res.status(409).json({ error: { code: "rev_conflict", message: `base_rev ${base_rev} is not current (current is ${page.current_rev})` } });
  }

  const newRev = page.current_rev + 1;
  await pool.query(
    `INSERT INTO page_revisions (page_id, rev, origin, structured, markdown, checks_fresh) VALUES ($1, $2, 'user', NULL, $3, true)`,
    [page.id, newRev, markdown]
  );
  await pool.query(`UPDATE pages SET current_rev = $2 WHERE id = $1`, [page.id, newRev]);

  // Recheck: unknown-mention scan against the run's index, same rule as the
  // Verifier's rule 3. A user edit has no structured claims to re-check
  // structurally - there's no page/1 JSON for free text.
  const index = await loadIndexForRun(req.params.id);
  const mentions = scanRenderedPageForUnknownMentions(markdown, index);
  for (const m of mentions) {
    const fingerprint = crypto.createHash("sha256").update(`${req.params.slug}:mention:${m.text}:unknown_symbol`).digest("hex");
    await pool.query(
      `INSERT INTO review_items (run_id, page_id, claim_id, fingerprint, reason, severity, message, evidence)
       VALUES ($1, $2, NULL, $3, 'unknown_symbol', 'warning', $4, $5)
       ON CONFLICT (run_id, fingerprint) DO UPDATE SET message = EXCLUDED.message, status = 'open'::review_status, resolved_at = NULL`,
      [req.params.id, page.id, fingerprint, `Unmatched mention in edited text: \`${m.text}\``, JSON.stringify({ text: m.text })]
    );
  }

  res.json({ rev: newRev, checks_fresh: true });
});

// POST /api/runs/:id/pages/:slug/review - mark a revision reviewed (T17).
runsRouter.post("/runs/:id/pages/:slug/review", async (req, res) => {
  const pool = getPool();
  const { rev, note } = req.body ?? {};
  const { rows: pageRows } = await pool.query(`SELECT id, current_rev FROM pages WHERE run_id = $1 AND slug = $2`, [req.params.id, req.params.slug]);
  if (pageRows.length === 0) {
    return res.status(404).json({ error: { code: "page_not_found", message: "No such page" } });
  }
  const page = pageRows[0];
  if (rev !== page.current_rev) {
    return res.status(409).json({ error: { code: "rev_conflict", message: `rev ${rev} is not current (current is ${page.current_rev})` } });
  }
  await pool.query(`UPDATE page_revisions SET reviewed_at = now(), reviewed_note = $3 WHERE page_id = $1 AND rev = $2`, [page.id, rev, note ?? null]);
  res.status(200).json({});
});

// GET /api/runs/:id/findings?status=open - review panel (T17).
runsRouter.get("/runs/:id/findings", async (req, res) => {
  const pool = getPool();
  const status = req.query.status;
  // Built conditionally rather than "($2::text IS NULL OR ri.status = $2)":
  // with status.id a review_status enum, a single parameter doing double
  // duty (cast to text in one branch, compared to the enum in the other)
  // left Postgres unable to pin down $2's type and the query never
  // returned via the pg driver, even though the same SQL with a literal
  // value ran instantly in psql.
  const params = [req.params.id];
  let whereClause = "ri.run_id = $1";
  if (status) {
    params.push(status);
    whereClause += ` AND ri.status = $${params.length}::review_status`;
  }
  const { rows } = await pool.query(
    `SELECT ri.id, p.slug AS page_slug, ri.claim_id, ri.reason, ri.severity, ri.message, ri.evidence, ri.status, ri.resolution_note, ri.resolved_at
     FROM review_items ri LEFT JOIN pages p ON p.id = ri.page_id
     WHERE ${whereClause}
     ORDER BY ri.created_at DESC`,
    params
  );
  res.json({
    findings: rows.map((r) => ({
      id: r.id,
      page_slug: r.page_slug,
      claim_id: r.claim_id,
      reason: r.reason,
      severity: r.severity,
      message: r.message,
      evidence: r.evidence,
      status: r.status,
      resolution_note: r.resolution_note,
      resolved_at: r.resolved_at,
    })),
  });
});

// GET /api/runs/:id/export.zip?include_review=true - mkdocs-ready ZIP (T18).
// Open findings always stay inline as admonitions; include_review adds the
// standalone docs/review.md as well.
runsRouter.get("/runs/:id/export.zip", async (req, res) => {
  const pool = getPool();
  const { rows: runRows } = await pool.query(
    `SELECT r.status, r.resolved_sha, r.config, r.created_at, rp.owner, rp.name
     FROM runs r JOIN repos rp ON rp.id = r.repo_id WHERE r.id = $1`,
    [req.params.id]
  );
  if (runRows.length === 0) {
    return res.status(404).json({ error: { code: "run_not_found", message: "No such run" } });
  }
  const run = runRows[0];
  if (run.status !== "complete" && run.status !== "complete_with_errors") {
    return res.status(409).json({ error: { code: "run_not_ready", message: `Run is ${run.status}; export needs a finished run` } });
  }

  const { rows: pages } = await pool.query(
    `SELECT p.id, p.slug, p.title, p.status, pr.markdown, pr.reviewed_at
     FROM pages p JOIN page_revisions pr ON pr.page_id = p.id AND pr.rev = p.current_rev
     WHERE p.run_id = $1 ORDER BY p.slug`,
    [req.params.id]
  );
  const { rows: findings } = await pool.query(
    `SELECT ri.page_id, p.slug AS page_slug, ri.reason, ri.severity, ri.message
     FROM review_items ri LEFT JOIN pages p ON p.id = ri.page_id
     WHERE ri.run_id = $1 AND ri.status = 'open'::review_status
     ORDER BY ri.created_at`,
    [req.params.id]
  );

  const bySeverity = {};
  const byPageId = new Map();
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    if (!byPageId.has(f.page_id)) byPageId.set(f.page_id, []);
    byPageId.get(f.page_id).push(f);
  }

  const zip = await buildExportZip({
    mkdocsYml: buildMkdocsYml(run),
    readme: buildExportReadme(),
    provenanceMd: buildProvenanceMarkdown({ run, pages, openFindingsBySeverity: bySeverity }),
    pages: pages.map((p) => ({ slug: p.slug, markdown: appendInlineFindings(p.markdown, byPageId.get(p.id) ?? []) })),
    reviewMd: req.query.include_review === "true" ? buildReviewMarkdown(findings) : null,
    graphJson: JSON.stringify(await loadGraphForRun(req.params.id), null, 2),
    toursJson: JSON.stringify({ tours: await loadTours(req.params.id) }, null, 2),
  });

  res.set({
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${run.owner}-${run.name}-docs.zip"`,
  });
  res.send(zip);
});

// GET /api/runs/:id/graph - repo map data (graph/1), straight from parser facts.
runsRouter.get("/runs/:id/graph", async (req, res) => {
  const { rows } = await getPool().query(`SELECT status FROM runs WHERE id = $1`, [req.params.id]);
  if (rows.length === 0) {
    return res.status(404).json({ error: { code: "run_not_found", message: "No such run" } });
  }
  if (rows[0].status !== "complete" && rows[0].status !== "complete_with_errors") {
    return res.status(409).json({ error: { code: "run_not_ready", message: `Run is ${rows[0].status}; the map needs a finished run` } });
  }
  res.json(await loadGraphForRun(req.params.id));
});

// GET /api/runs/:id/tours - the guided tours (tour/1) for a finished run.
runsRouter.get("/runs/:id/tours", async (req, res) => {
  const { rows } = await getPool().query(`SELECT status FROM runs WHERE id = $1`, [req.params.id]);
  if (rows.length === 0) {
    return res.status(404).json({ error: { code: "run_not_found", message: "No such run" } });
  }
  if (rows[0].status !== "complete" && rows[0].status !== "complete_with_errors") {
    return res.status(409).json({ error: { code: "run_not_ready", message: `Run is ${rows[0].status}; tours need a finished run` } });
  }
  res.json({ tours: await loadTours(req.params.id) });
});

// POST /api/runs/:id/ask - "Ask this repo": a question answered from the run's parsed facts, map and pages,
// with the sources it used. AI_STUB_MODE gives closest matches instead of a model call.
const toolboxCache = new Map(); // runId -> { at, toolbox, index }
async function toolboxFor(runId) {
  const hit = toolboxCache.get(runId);
  if (hit && Date.now() - hit.at < 120_000) return hit;
  const [graph, index, pages] = await Promise.all([
    loadGraphForRun(runId),
    loadIndexForRun(runId),
    getPool().query(`SELECT p.slug, p.title, pr.markdown FROM pages p JOIN page_revisions pr ON pr.page_id = p.id AND pr.rev = p.current_rev WHERE p.run_id = $1 AND p.status = 'generated'`, [runId]),
  ]);
  const entry = { at: Date.now(), index, toolbox: makeToolbox({ graph, index, pages: pages.rows }) };
  toolboxCache.set(runId, entry);
  return entry;
}

runsRouter.post("/runs/:id/ask", async (req, res) => {
  const { question, history } = req.body ?? {};
  if (typeof question !== "string" || (history !== undefined && !Array.isArray(history))) {
    return res.status(400).json({ error: { code: "invalid_body", message: "question (string) is required; history, if given, must be a list" } });
  }
  const { rows } = await getPool().query(`SELECT status FROM runs WHERE id = $1`, [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: { code: "run_not_found", message: "No such run" } });
  if (rows[0].status !== "complete" && rows[0].status !== "complete_with_errors") {
    return res.status(409).json({ error: { code: "run_not_ready", message: `Run is ${rows[0].status}; questions need a finished run` } });
  }
  try {
    const { toolbox, index } = await toolboxFor(req.params.id);
    const result = await askRepo({ runId: req.params.id, question, history: history ?? [], toolbox, index, stub: process.env.AI_STUB_MODE !== "false" });
    res.json(result);
  } catch (err) {
    if (err instanceof ChatLimitError) {
      const status = err.code === "chat_rate_limited" || err.code === "chat_budget_used" ? 429 : 400;
      return res.status(status).json({ error: { code: err.code, message: err.message } });
    }
    console.error("ask failed:", err?.status ?? "", String(err?.message ?? err).slice(0, 200));
    res.status(502).json({ error: { code: "ask_failed", message: "The assistant could not answer right now. Try again in a moment." } });
  }
});

// GET /api/runs/:id - progress, polled every 2s by the client.
runsRouter.get("/runs/:id", async (req, res) => {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT r.id, r.status, r.resolved_sha, r.cost_usd, r.budget_cap_usd, r.failure_code, r.failure_detail,
            r.started_at, r.finished_at, rp.owner, rp.name
     FROM runs r JOIN repos rp ON rp.id = r.repo_id
     WHERE r.id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: { code: "run_not_found", message: "No such run" } });
  }
  const run = rows[0];

  const { rows: stages } = await pool.query(
    `SELECT stage, status, items_total, items_done, items_failed, message FROM run_stages WHERE run_id = $1 ORDER BY stage`,
    [req.params.id]
  );
  const { rows: artifactRows } = await pool.query(`SELECT coverage FROM run_artifacts WHERE run_id = $1`, [req.params.id]);

  res.json({
    run_id: run.id,
    status: run.status,
    repo: { owner: run.owner, name: run.name },
    resolved_sha: run.resolved_sha,
    stages: stages.map((s) => ({
      stage: s.stage,
      status: s.status,
      items_total: s.items_total,
      items_done: s.items_done,
      items_failed: s.items_failed,
      message: s.message,
    })),
    cost_usd: Number(run.cost_usd),
    budget_cap_usd: Number(run.budget_cap_usd),
    coverage: artifactRows[0]?.coverage ?? null,
    failure: run.failure_code ? { code: run.failure_code, detail: run.failure_detail } : null,
    started_at: run.started_at,
    finished_at: run.finished_at,
    // M4 "time ... measured": wall-clock duration once the run has a start
    // and an end. null while still running/queued, or if it never started.
    duration_ms: run.started_at && run.finished_at ? new Date(run.finished_at).getTime() - new Date(run.started_at).getTime() : null,
  });
});

// GET /api/runs?limit=20&before=<ts> - saved docs sets and recent runs.
runsRouter.get("/runs", async (req, res) => {
  const pool = getPool();
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const before = req.query.before ? new Date(String(req.query.before)) : new Date();

  const { rows } = await pool.query(
    `SELECT r.id, r.status, r.resolved_sha, r.cost_usd, r.created_at, r.started_at, r.finished_at, rp.owner, rp.name,
            COALESCE(f.open_findings, 0)::int AS open_findings
     FROM runs r
     JOIN repos rp ON rp.id = r.repo_id
     LEFT JOIN (
       SELECT run_id, count(*) AS open_findings FROM review_items WHERE status = 'open' GROUP BY run_id
     ) f ON f.run_id = r.id
     WHERE r.created_at < $1
     ORDER BY r.created_at DESC
     LIMIT $2`,
    [before, limit]
  );

  res.json({
    runs: rows.map((r) => ({
      run_id: r.id,
      repo: { owner: r.owner, name: r.name },
      resolved_sha: r.resolved_sha,
      status: r.status,
      created_at: r.created_at,
      cost_usd: Number(r.cost_usd),
      open_findings: r.open_findings,
      duration_ms: r.started_at && r.finished_at ? new Date(r.finished_at).getTime() - new Date(r.started_at).getTime() : null,
    })),
  });
});

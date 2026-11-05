import express from "express";
import { getPool } from "../db/pool.js";
import { parseRepoUrl } from "../repo-url.js";
import { startRun } from "../runner/start-run.js";
import { runPipeline } from "../runner/pipeline.js";

export const runsRouter = express.Router();

// POST /api/runs - start a run. Real Repo Reader + Scanner + Analyst +
// Writer + Renderer (Task 1-3). AI_STUB_MODE defaults to true (canned
// Analyst/Writer responses, zero cost) so this never spends money by
// accident - set AI_STUB_MODE=false with a real ANTHROPIC_API_KEY to call
// Claude for real. Architect and Verifier (Task 4-5) aren't built yet.
runsRouter.post("/runs", async (req, res) => {
  const { repo_url, ref } = req.body ?? {};
  const parsed = parseRepoUrl(repo_url);
  if (!parsed) {
    return res.status(400).json({ error: { code: "invalid_url", message: "Expected https://github.com/<owner>/<repo>" } });
  }

  const resolvedRef = ref ?? parsed.ref;
  const { runId, duplicateOf } = await startRun({ owner: parsed.owner, name: parsed.name, ref: resolvedRef });
  if (!duplicateOf) {
    const aiStub = process.env.AI_STUB_MODE !== "false";
    runPipeline(runId, { owner: parsed.owner, name: parsed.name, ref: resolvedRef }, { aiStub }).catch((err) => {
      console.error(`run ${runId} pipeline crashed:`, err);
    });
  }
  res.status(202).json({ run_id: runId, status: "queued", duplicate_of: duplicateOf });
});

// GET /api/runs/:id/pages - sidebar list.
runsRouter.get("/runs/:id/pages", async (req, res) => {
  const { rows } = await getPool().query(
    `SELECT slug, title, status, current_rev FROM pages WHERE run_id = $1 ORDER BY slug`,
    [req.params.id]
  );
  res.json({ pages: rows.map((p) => ({ slug: p.slug, title: p.title, status: p.status, current_rev: p.current_rev, checks_fresh: false, reviewed: false, open_findings: 0 })) });
});

// GET /api/runs/:id/pages/:slug - one page, current revision.
runsRouter.get("/runs/:id/pages/:slug", async (req, res) => {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT p.status, pr.rev, pr.origin, pr.markdown, pr.reviewed_at
     FROM pages p JOIN page_revisions pr ON pr.page_id = p.id AND pr.rev = p.current_rev
     WHERE p.run_id = $1 AND p.slug = $2`,
    [req.params.id, req.params.slug]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: { code: "page_not_found", message: "No such page" } });
  }
  const page = rows[0];
  res.json({
    slug: req.params.slug,
    rev: page.rev,
    origin: page.origin,
    markdown: page.markdown,
    status: page.status,
    checks: { fresh: false, structural_fail: false, ai: { supported: 0, contradicted: 0, insufficient: 0, not_assessed: 0 } },
    reviewed_at: page.reviewed_at,
  });
});

// GET /api/runs/:id - progress, polled every 2s by the client.
runsRouter.get("/runs/:id", async (req, res) => {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT r.id, r.status, r.resolved_sha, r.cost_usd, r.budget_cap_usd, r.failure_code, r.failure_detail,
            rp.owner, rp.name
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
  });
});

// GET /api/runs?limit=20&before=<ts> - saved docs sets and recent runs.
runsRouter.get("/runs", async (req, res) => {
  const pool = getPool();
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const before = req.query.before ? new Date(String(req.query.before)) : new Date();

  const { rows } = await pool.query(
    `SELECT r.id, r.status, r.resolved_sha, r.cost_usd, r.created_at, rp.owner, rp.name
     FROM runs r JOIN repos rp ON rp.id = r.repo_id
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
      open_findings: 0,
    })),
  });
});

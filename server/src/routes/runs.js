import express from "express";
import { getPool } from "../db/pool.js";
import { parseRepoUrl } from "../repo-url.js";
import { startStubRun } from "../stub/runner.js";

export const runsRouter = express.Router();

// POST /api/runs - start a run. Stub mode only in Task 1 (no Repo Reader,
// Scanner or model calls exist yet); the real runner lands in Task 3 (T04).
runsRouter.post("/runs", async (req, res) => {
  const { repo_url, ref } = req.body ?? {};
  const parsed = parseRepoUrl(repo_url);
  if (!parsed) {
    return res.status(400).json({ error: { code: "invalid_url", message: "Expected https://github.com/<owner>/<repo>" } });
  }

  const { runId, duplicateOf } = await startStubRun({ owner: parsed.owner, name: parsed.name, ref: ref ?? parsed.ref });
  res.status(202).json({ run_id: runId, status: "queued", duplicate_of: duplicateOf });
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
    coverage: null,
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

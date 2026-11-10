import express from "express";
import { getPool } from "../db/pool.js";
import { loadGraphForRun } from "../db/load-graph.js";
import { loadTours } from "../db/tours.js";

// Idea 5 (LOG.md's "wow factor" brainstorm): a public, unauthenticated share link for one run's
// already-saved tour(s) - a portfolio piece you can hand to someone with no access code needed.
//
// This is the one deliberate exception to "every /api route needs the session cookie" (SEC-8,
// enforced in server/src/index.js). It is safe because:
//   - it is gated by a per-run, unguessable token (crypto.randomBytes(24), generated in
//     POST /api/runs/:id/share), never the shared ACCESS_CODE - one run's link can never expose
//     any other run;
//   - it only returns already-generated, read-only data (the graph and saved tours) - no file
//     contents beyond what the graph's evidence already cites, no review findings, no cost or
//     model-call data, no run list;
//   - it never reaches Ask or Explorer, both AI-metered per the budget manager - a public link
//     must never be a way to spend someone else's API budget.
// server/src/index.js mounts this router BEFORE the requireSession chain, at a distinct prefix,
// so requireSession is never even reached for these requests.
export const publicRouter = express.Router();

publicRouter.get("/runs/:token", async (req, res) => {
  const { rows } = await getPool().query(
    `SELECT r.id, r.status, r.resolved_sha, rp.owner, rp.name
     FROM runs r JOIN repos rp ON rp.id = r.repo_id
     WHERE r.share_token = $1`,
    [req.params.token]
  );
  // 404, not 401/403: an unknown, revoked, or almost-right token should look the same from the
  // outside as a token that was never issued.
  if (rows.length === 0 || (rows[0].status !== "complete" && rows[0].status !== "complete_with_errors")) {
    return res.status(404).json({ error: { code: "not_found", message: "This link is no longer available." } });
  }
  const run = rows[0];
  const [graph, tours] = await Promise.all([loadGraphForRun(run.id), loadTours(run.id)]);
  res.json({ repo: { owner: run.owner, name: run.name }, resolved_sha: run.resolved_sha, graph, tours });
});

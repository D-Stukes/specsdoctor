import express from "express";
import { getPool } from "../db/pool.js";

export const findingsRouter = express.Router();

const VALID_STATUSES = ["open", "corrected", "dismissed", "accepted_uncertain"];

// PATCH /api/findings/:id - resolve a finding (T17). Note is required
// unless reopening (status "open"), per §4d.
findingsRouter.patch("/findings/:id", async (req, res) => {
  const { status, note } = req.body ?? {};
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: { code: "invalid_status", message: `status must be one of ${VALID_STATUSES.join(", ")}` } });
  }
  if (status !== "open" && !note) {
    return res.status(400).json({ error: { code: "note_required", message: "note is required unless reopening a finding" } });
  }

  // resolved_at computed in JS, not SQL: reusing $2 both as the enum
  // assignment (status = $2::review_status) and in a text comparison
  // (CASE WHEN $2 = 'open') left Postgres unable to pin down its type and
  // the query never returned via the pg driver - same issue as the
  // findings-list route, see its comment.
  const resolvedAt = status === "open" ? null : new Date();
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE review_items
     SET status = $2::review_status, resolution_note = $3, resolved_at = $4
     WHERE id = $1
     RETURNING id, page_id, claim_id, reason, severity, message, evidence, status, resolution_note, resolved_at`,
    [req.params.id, status, note ?? null, resolvedAt]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: { code: "finding_not_found", message: "No such finding" } });
  }
  res.json(rows[0]);
});

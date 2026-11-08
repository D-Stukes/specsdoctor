import { getPool } from "./pool.js";

/** Upserts one page revision's claim_checks rows from a verify/1 result (§4b). */
export async function saveClaimChecks({ pageId, rev, verifyResult }) {
  const pool = getPool();
  for (const claim of verifyResult.claims) {
    await pool.query(
      `INSERT INTO claim_checks (page_id, rev, claim_id, structural, ai_assessment, explanation)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (page_id, rev, claim_id) DO UPDATE SET structural = EXCLUDED.structural, ai_assessment = EXCLUDED.ai_assessment, explanation = EXCLUDED.explanation`,
      [pageId, rev, claim.claim_id, claim.structural.status, claim.ai.assessment, claim.ai.explanation]
    );
  }
}

/**
 * Upserts findings as review_items, keyed on (run_id, fingerprint) so a
 * recheck of the same underlying issue updates the row instead of
 * duplicating it (§4b "Review items keep their fingerprint").
 */
export async function saveFindings({ runId, pageId, findings }) {
  const pool = getPool();
  for (const f of findings) {
    await pool.query(
      `INSERT INTO review_items (run_id, page_id, claim_id, fingerprint, reason, severity, message, evidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (run_id, fingerprint) DO UPDATE SET message = EXCLUDED.message, evidence = EXCLUDED.evidence`,
      [runId, pageId, f.claim_id, f.fingerprint, f.reason, f.severity, f.message, f.evidence]
    );
  }
}

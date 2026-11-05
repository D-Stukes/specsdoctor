import { getPool } from "./pool.js";

/**
 * Upserts a generated page and its first revision. Technical Design §4b:
 * `pages` tracks `current_rev`, `page_revisions` holds the actual content
 * per revision (one row per rev, never overwritten once past rev 1 - but
 * Task 3 only ever produces rev 1, so this keeps it simple and lets a
 * re-run of the same run_id refresh that one revision in place).
 */
export async function savePageRevision({ runId, page, markdown, status = "generated", ownerStage = "writer" }) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO pages (run_id, slug, title, status, owner_stage) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (run_id, slug) DO UPDATE SET status = EXCLUDED.status, title = EXCLUDED.title`,
    [runId, page.slug, page.title, status, ownerStage]
  );
  const { rows } = await pool.query(`SELECT id, current_rev FROM pages WHERE run_id = $1 AND slug = $2`, [runId, page.slug]);
  const { id: pageId, current_rev: rev } = rows[0];

  await pool.query(
    `INSERT INTO page_revisions (page_id, rev, origin, structured, markdown, checks_fresh)
     VALUES ($1, $2, 'generated', $3, $4, false)
     ON CONFLICT (page_id, rev) DO UPDATE SET structured = EXCLUDED.structured, markdown = EXCLUDED.markdown`,
    [pageId, rev, page, markdown]
  );

  return { pageId, rev };
}

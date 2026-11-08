import { getPool } from "./pool.js";
import { tourFindingFingerprint } from "../stages/tour-agent.js";

export async function saveTours(runId, tours, findings) {
  const pool = getPool();
  for (const { tour, status } of tours) {
    await pool.query(
      `INSERT INTO tours (run_id, tour_id, tour, status) VALUES ($1, $2, $3, $4)
       ON CONFLICT (run_id, tour_id) DO UPDATE SET tour = EXCLUDED.tour, status = EXCLUDED.status`,
      [runId, tour.tour_id, JSON.stringify(tour), status]
    );
  }
  for (const f of findings) {
    const message = `Tour "${f.tourId}", stop ${f.stop} (${f.title}): the narration mentioned ${f.mentions.map((m) => `\`${m}\``).join(", ")}, which is not in the code, so a plain description was used instead.`;
    await pool.query(
      `INSERT INTO review_items (run_id, page_id, claim_id, fingerprint, reason, severity, message, evidence)
       VALUES ($1, NULL, NULL, $2, 'unknown_symbol', 'warning', $3, $4)
       ON CONFLICT (run_id, fingerprint) DO NOTHING`,
      [runId, tourFindingFingerprint(f), message, JSON.stringify({ tour_id: f.tourId, stop: f.stop, mentions: f.mentions })]
    );
  }
}

export async function loadTours(runId) {
  const { rows } = await getPool().query(`SELECT tour_id, tour, status FROM tours WHERE run_id = $1`, [runId]);
  const order = ["big-picture", "follow-request", "data-storage", "start-here"];
  return rows.sort((a, b) => order.indexOf(a.tour_id) - order.indexOf(b.tour_id)).map((r) => ({ ...r.tour, status: r.status }));
}

import { getPool } from "./pool.js";

/**
 * Reconstructs a minimal index/1-shaped object for a finished run, from
 * what pipeline.js persisted (index_items + run_artifacts.project_facts) -
 * enough for a post-run recheck (T17), without re-scanning the repo.
 */
export async function loadIndexForRun(runId) {
  const pool = getPool();
  const { rows: itemRows } = await pool.query(`SELECT data FROM index_items WHERE run_id = $1`, [runId]);
  const { rows: artifactRows } = await pool.query(`SELECT project_facts, import_graph FROM run_artifacts WHERE run_id = $1`, [runId]);
  return {
    items: itemRows.map((r) => r.data),
    imports: artifactRows[0]?.import_graph?.imports ?? [],
    graph_facts: artifactRows[0]?.import_graph?.graph_facts,
    project: artifactRows[0]?.project_facts ?? { workspaces: [], env_vars: [], tables: [] },
  };
}

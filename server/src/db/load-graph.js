import { getPool } from "./pool.js";
import { loadIndexForRun } from "./load-index.js";
import { buildGraph } from "../graph/build-graph.js";
import { applyGroups } from "../graph/groups.js";

/** The run's repo-map graph (graph/1): parser facts plus the saved areas, if any. */
export async function loadGraphForRun(runId) {
  const graph = buildGraph(await loadIndexForRun(runId));
  const { rows } = await getPool().query(`SELECT architect_output FROM run_artifacts WHERE run_id = $1`, [runId]);
  const saved = rows[0]?.architect_output?.graph_groups;
  return saved?.groups?.length ? applyGroups(graph, saved.groups) : graph;
}

export async function saveGraphGroups(runId, grouping) {
  await getPool().query(
    `UPDATE run_artifacts SET architect_output = COALESCE(architect_output, '{}'::jsonb) || $2::jsonb WHERE run_id = $1`,
    [runId, JSON.stringify({ graph_groups: grouping })]
  );
}

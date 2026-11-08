// Needs the database and a low threshold, so it lives in its own process (env is read at import time).
process.env.EXPLORER_RUN_BUDGET_USD = "0.05";
process.env.DATABASE_URL ??= "postgres://localhost:5432/docsync_test";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { migrate } from "../src/db/migrate.js";
import { getPool, closePool } from "../src/db/pool.js";
import { makeToolbox } from "../src/chat/tools.js";
import { buildGraph } from "../src/graph/build-graph.js";
import { scanFixture } from "./helpers/fixture.js";

// Imports are hoisted above the env lines at the top, so the module (which reads its budget at load) is imported here.
const { exploreRepo, ExplorerLimitError } = await import("../src/chat/explorer.js");

const { index } = scanFixture();
const toolbox = makeToolbox({ graph: buildGraph(index), index, pages: [] });
const graph = buildGraph(index);

let repoId;
before(async () => {
  await migrate();
  const { rows } = await getPool().query(`INSERT INTO repos (owner, name) VALUES ('explorer-limits', $1) RETURNING id`, [crypto.randomUUID()]);
  repoId = rows[0].id;
});
after(async () => {
  await getPool().query(`DELETE FROM repos WHERE id = $1`, [repoId]).catch(() => {});
  await closePool();
});

const newRun = async () => (await getPool().query(`INSERT INTO runs (repo_id, status, config, budget_cap_usd) VALUES ($1, 'complete', '{}'::jsonb, 1) RETURNING id`, [repoId])).rows[0].id;

test("once a run's exploring spend reaches its cap, further attempts are refused without calling the model", async () => {
  const runId = await newRun();
  await getPool().query(`INSERT INTO model_calls (run_id, stage, model, attempt, est_cost_usd, status) VALUES ($1, 'explorer', 'claude-sonnet-5-5', 1, 0.06, 'success')`, [runId]);
  let called = false;
  await assert.rejects(
    () => exploreRepo({ runId, graph, index, toolbox, stub: false, callModel: async () => { called = true; } }),
    (e) => e instanceof ExplorerLimitError && e.code === "explorer_budget_used"
  );
  assert.equal(called, false);
});

// Limits that need the database and low thresholds, so they live in their own process (env is read at import time).
process.env.CHAT_QUESTIONS_PER_HOUR = "3";
process.env.CHAT_RUN_BUDGET_USD = "0.05";
process.env.DATABASE_URL ??= "postgres://localhost:5432/docsync_test";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { migrate } from "../src/db/migrate.js";
import { getPool, closePool } from "../src/db/pool.js";
import { makeToolbox } from "../src/chat/tools.js";
import { buildGraph } from "../src/graph/build-graph.js";
import { scanFixture } from "./helpers/fixture.js";

// Imports are hoisted above the env lines at the top, so the agent (which reads its limits at load) is imported here.
const { askRepo } = await import("../src/chat/agent.js");

const { index } = scanFixture();
const toolbox = makeToolbox({ graph: buildGraph(index), index, pages: [] });
const answer = async () => ({ response: { stop_reason: "end_turn", content: [{ type: "text", text: "Ok.\nSOURCES: none" }] }, costUsd: 0.001 });

let repoId;
before(async () => {
  await migrate();
  const { rows } = await getPool().query(`INSERT INTO repos (owner, name) VALUES ('chat-limits', $1) RETURNING id`, [crypto.randomUUID()]);
  repoId = rows[0].id;
});
after(async () => {
  await getPool().query(`DELETE FROM repos WHERE id = $1`, [repoId]).catch(() => {});
  await closePool();
});

const newRun = async () => (await getPool().query(`INSERT INTO runs (repo_id, status, config, budget_cap_usd) VALUES ($1, 'complete', '{}'::jsonb, 1) RETURNING id`, [repoId])).rows[0].id;

test("a run allows only so many questions an hour, then says to wait", async () => {
  const runId = await newRun();
  for (let i = 0; i < 3; i += 1) await askRepo({ runId, question: "q?", toolbox, index, stub: false, callModel: answer });
  await assert.rejects(() => askRepo({ runId, question: "q?", toolbox, index, stub: false, callModel: answer }), (e) => e.code === "chat_rate_limited");
});

test("once a run's chat spending reaches its cap, further questions are refused", async () => {
  const runId = await newRun();
  await getPool().query(`INSERT INTO model_calls (run_id, stage, model, attempt, est_cost_usd, status) VALUES ($1, 'chat', 'claude-sonnet-5-5', 1, 0.06, 'success')`, [runId]);
  await assert.rejects(() => askRepo({ runId, question: "q?", toolbox, index, stub: false, callModel: answer }), (e) => e.code === "chat_budget_used");
});

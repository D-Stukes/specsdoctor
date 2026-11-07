import Anthropic from "@anthropic-ai/sdk";
import { getPool } from "../db/pool.js";
import { PRICES, estimateCostUsd } from "./models.js";
import { redactSecrets } from "./redact.js";

// maxRetries: 0 - we implement the single retry ourselves (§4a "retries a
// model call once on 429, 5xx, or timeout"), so we can record each attempt
// in model_calls and release/commit the budget reservation precisely.
let anthropicClient;
function getClient() {
  if (!anthropicClient) anthropicClient = new Anthropic({ maxRetries: 0 });
  return anthropicClient;
}

function isRetryable(err) {
  if (err instanceof Anthropic.RateLimitError) return true;
  if (err instanceof Anthropic.APIConnectionError) return true;
  if (err instanceof Anthropic.APIError && typeof err.status === "number" && err.status >= 500) return true;
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function recordModelCall(runId, { stage, model, attempt, usage, costUsd, status, latencyMs }) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO model_calls (run_id, stage, model, attempt, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, est_cost_usd, status, latency_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      runId,
      stage,
      model,
      attempt,
      usage?.input_tokens ?? null,
      usage?.output_tokens ?? null,
      usage?.cache_read_input_tokens ?? null,
      usage?.cache_creation_input_tokens ?? null,
      costUsd,
      status,
      latencyMs,
    ]
  );
}

/**
 * Calls Claude with structured outputs (output_config.format, a raw JSON
 * Schema - Technical Design §4c), going through the budget manager first.
 * `stub` (a function returning a canned parsed_output) skips the network
 * call entirely and costs nothing - AT-15 "stub mode."
 *
 * Returns { parsed, usage, costUsd }. Throws BudgetExceededError if the
 * reservation can't be made, or the underlying API error after one retry.
 */
let promptCapture = null;
/** Test hook (SEC-T): receives every outgoing prompt, post-redaction. */
export function setPromptCapture(fn) {
  promptCapture = fn;
}

export async function callStructured({ runId, stage, model, system, userMessage: rawUserMessage, jsonSchema, maxOutputTokens, estimatedInputTokens, budgetManager, stub }) {
  const userMessage = redactSecrets(rawUserMessage);
  promptCapture?.({ stage, system, userMessage });
  if (stub) {
    const parsed = await stub();
    return { parsed, usage: null, costUsd: 0 };
  }

  const prices = PRICES[model];
  const reservationId = budgetManager.reserve(stage, estimatedInputTokens, maxOutputTokens, model, prices);

  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const startedAt = Date.now();
    try {
      const response = await getClient().messages.parse({
        model,
        max_tokens: maxOutputTokens,
        system,
        messages: [{ role: "user", content: userMessage }],
        output_config: { format: { type: "json_schema", schema: jsonSchema } },
      });
      const latencyMs = Date.now() - startedAt;
      const costUsd = estimateCostUsd(model, response.usage.input_tokens, response.usage.output_tokens);
      budgetManager.commit(reservationId, costUsd);
      await recordModelCall(runId, { stage, model, attempt, usage: response.usage, costUsd, status: "success", latencyMs });
      return { parsed: response.parsed_output, usage: response.usage, costUsd };
    } catch (err) {
      lastErr = err;
      const latencyMs = Date.now() - startedAt;
      await recordModelCall(runId, { stage, model, attempt, usage: null, costUsd: 0, status: "failed", latencyMs });
      if (attempt === 1 && isRetryable(err)) {
        await sleep(1000 * attempt); // exponential backoff
        continue;
      }
      break;
    }
  }

  budgetManager.release(reservationId);
  throw lastErr;
}

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { callValidated } from "../ai/call-validated.js";
import { getPool } from "../db/pool.js";
import { MODELS, MAX_OUTPUT_TOKENS } from "../ai/models.js";
import { getValidator } from "@docsync/contracts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const WRITER_PROMPT_VERSION = "writer-reference/1";

// §2: "Reference page prose: Claude Haiku 5.5 - Signatures and links are
// rendered deterministically; prose is short." The model only ever writes
// prose and claim text; symbol_ref/endpoint_ref blocks (the signatures and
// links themselves) are assembled by this stage's own code from the index,
// never by the model - matching §4c "AI stages never emit Markdown,
// signatures or URLs."
const SYSTEM_PROMPT = `You are the Writer stage of SpecsDoctor, generating one reference documentation page for a single source module.

You will be given the module's purpose and per-item descriptions (already written by an earlier stage from the real code), plus the exact symbol IDs for every item in this module. Write ONLY short prose and claim blocks - one or two sentences of narrative framing for the module, plus, for each item whose behavior depends on another symbol (e.g. middleware, a called helper), a short "claim" block describing that relationship with evidence.

Rules:
- Do not write signatures, parameter lists, return types, or source links - a separate renderer adds those deterministically from the parser's index. Writing them yourself would duplicate or contradict the real ones.
- Every claim must cite real symbol_ids from the list you're given, with evidence pointing at real line ranges from the module summary you're given. Never invent a symbol_id or a line number.
- If nothing beyond the per-item description is worth saying, it's fine to return zero claim blocks and just the prose block.
- Keep it short - this is a reference page, not a narrative essay.`;

function buildUserMessage(modulePath, summary, items) {
  const itemList = items.map((i) => `- ${i.id}: ${i.signature ?? i.name} (lines ${i.start_line}-${i.end_line})`).join("\n");
  return [
    `Module: ${modulePath}`,
    `Purpose (from the Code Analyst stage): ${summary.purpose}`,
    "",
    "Per-item descriptions:",
    summary.items.map((i) => `- ${i.symbol_id}: ${i.what_it_does}`).join("\n"),
    "",
    "Valid symbol_ids and their line ranges for evidence:",
    itemList,
  ].join("\n");
}

function pageSchemaForModel() {
  const schemaPath = path.join(__dirname, "..", "..", "..", "contracts", "schemas", "page.schema.json");
  return JSON.parse(readFileSync(schemaPath, "utf8"));
}

function stubProsePage(modulePath, items) {
  return {
    schema_version: "page/1",
    slug: slugFor(modulePath),
    title: modulePath,
    sections: [{ heading: modulePath, blocks: [{ type: "prose", text: `(stub) No model call made for ${modulePath}.` }] }],
  };
}

function slugFor(modulePath) {
  return modulePath.replace(/\//g, "-").replace(/\.[a-z]+$/i, "");
}

/**
 * T12 Writer (reference pages only - narrative pages are Task 4/T15's
 * Architect). Builds the deterministic symbol_ref blocks itself, asks the
 * model only for short prose/claims, validates the model's page/1 output
 * and strips any block type it shouldn't have produced (belt and braces -
 * the schema already forbids claim evidence pointing outside what it was
 * given, but not that the cited symbol_id is one of THIS module's items).
 * Returns null on validation failure so the caller can fall back to a
 * signature-only page with no prose (§4a "Writer fails for a page -> page
 * status generation_failed" only applies when even that isn't possible;
 * here we still have the deterministic refs, so the caller decides).
 */
export async function writeReferencePage({ runId, modulePath, items, summary, budgetManager, stub }) {
  const validate = getValidator("page/1");
  const knownIds = new Set(items.map((i) => i.id));

  const deterministicBlocks = items.map((i) => ({ type: "symbol_ref", symbol_id: i.id }));

  const { parsed } = await callValidated({
    runId,
    stage: "writer",
    model: MODELS.referenceProse,
    system: SYSTEM_PROMPT,
    userMessage: buildUserMessage(modulePath, summary, items),
    jsonSchema: pageSchemaForModel(),
    maxOutputTokens: MAX_OUTPUT_TOKENS.writer,
    estimatedInputTokens: Math.ceil((SYSTEM_PROMPT.length + JSON.stringify(summary).length) / 4),
    budgetManager,
    stub: stub ? () => stubProsePage(modulePath, items) : null,
  }, validate);

  let aiBlocks = [];
  if (validate(parsed)) {
    aiBlocks = (parsed.sections[0]?.blocks ?? []).filter((b) => {
      if (b.type !== "prose" && b.type !== "claim") return false; // the model may only write these two
      if (b.type === "claim") return b.claim.symbols.every((s) => knownIds.has(s));
      return true;
    });
  } else {
    await recordEvent(runId, "writer", "warn", "page_generation_failed", { modulePath, errors: validate.errors });
  }

  return {
    schema_version: "page/1",
    slug: slugFor(modulePath),
    title: modulePath,
    sections: [{ heading: modulePath, blocks: [...aiBlocks, ...deterministicBlocks] }],
  };
}

async function recordEvent(runId, stage, level, code, detail) {
  await getPool().query(`INSERT INTO run_events (run_id, stage, level, code, detail) VALUES ($1, $2, $3, $4, $5)`, [runId, stage, level, code, detail]);
}

export { slugFor };

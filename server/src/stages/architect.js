import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { callValidated } from "../ai/call-validated.js";
import { getPool } from "../db/pool.js";
import { MODELS, MAX_OUTPUT_TOKENS } from "../ai/models.js";
import { getValidator } from "@docsync/contracts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ARCHITECT_PROMPT_VERSION = "architect-overview/1";

// §2: narrative pages use Claude Sonnet 5.5 ("synthesis across modules").
// Same discipline as the Writer: only prose and claims, only real symbol_ids.
const SYSTEM_PROMPT = `You are the Architect stage of DocSync, writing the project overview page for a repository.

You will be given every module's purpose (written by an earlier stage from the real code) and basic project facts (workspaces, dependency counts, module count). Write a short overview: what the project is, its main pieces, and how they relate - grounded only in what you're given.

Rules:
- Write only "prose" and "claim" blocks. A separate renderer adds signatures and links deterministically - do not write them yourself.
- Any claim must cite real symbol_ids from the list you're given, with evidence line ranges from the module summaries you're given. Never invent one.
- Stay brief: 3-6 short paragraphs. This is an orientation page, not full documentation.
- If the modules don't clearly suggest an overall purpose, say so rather than guessing one.`;

function buildUserMessage(projectFacts, summaries, symbolList) {
  return [
    `Workspaces: ${JSON.stringify(projectFacts.workspaces.map((w) => ({ dir: w.dir, frontend: w.frontend, deps: Object.keys(w.dependencies) })))}`,
    `Module count: ${summaries.length}`,
    "",
    "Module purposes:",
    summaries.map((s) => `- ${s.module_path}: ${s.summary.purpose}`).join("\n"),
    "",
    "Valid symbol_ids available for claims (symbol_id: signature or name):",
    symbolList.join("\n"),
  ].join("\n");
}

function pageSchemaForModel() {
  return JSON.parse(readFileSync(path.join(__dirname, "..", "..", "..", "contracts", "schemas", "page.schema.json"), "utf8"));
}

function stubOverviewPage(summaries) {
  return {
    schema_version: "page/1",
    slug: "overview",
    title: "Overview",
    sections: [{ heading: "Overview", blocks: [{ type: "prose", text: `(stub) No model call made. ${summaries.length} module(s) summarized.` }] }],
  };
}

/**
 * T15 Architect: the overview.md narrative page. Unlike tech-stack/data-
 * model/architecture (architect-deterministic.js), there's no deterministic
 * fallback defined for this one (§2) - if it fails, the page status is
 * `generation_failed`, not a degraded-but-present page.
 */
export async function writeOverviewPage({ runId, index, summaries, budgetManager, stub }) {
  if (summaries.length === 0) return null; // nothing to synthesize from

  const validate = getValidator("page/1");
  const codeItems = index.items.filter((i) => i.kind !== "endpoint");
  const knownIds = new Set(codeItems.map((i) => i.id));
  const symbolList = codeItems.map((i) => `${i.id}: ${i.signature ?? i.name}`);

  const { parsed } = await callValidated({
    runId,
    stage: "architect",
    model: MODELS.narrative,
    system: SYSTEM_PROMPT,
    userMessage: buildUserMessage(index.project, summaries, symbolList),
    jsonSchema: pageSchemaForModel(),
    maxOutputTokens: MAX_OUTPUT_TOKENS.architect,
    estimatedInputTokens: Math.ceil((SYSTEM_PROMPT.length + symbolList.join("\n").length + summaries.map((s) => s.summary.purpose).join("").length) / 4),
    budgetManager,
    stub: stub ? () => stubOverviewPage(summaries) : null,
  }, validate);

  if (!validate(parsed)) {
    await recordEvent(runId, "architect", "warn", "page_generation_failed", { slug: "overview", errors: validate.errors });
    return null;
  }

  const blocks = (parsed.sections[0]?.blocks ?? []).filter((b) => {
    if (b.type !== "prose" && b.type !== "claim") return false;
    if (b.type === "claim") return b.claim.symbols.every((s) => knownIds.has(s));
    return true;
  });
  if (blocks.length === 0) {
    await recordEvent(runId, "architect", "warn", "page_generation_failed", { slug: "overview", reason: "no usable blocks after filtering" });
    return null;
  }

  return { schema_version: "page/1", slug: "overview", title: "Overview", sections: [{ heading: "Overview", blocks }] };
}

async function recordEvent(runId, stage, level, code, detail) {
  await getPool().query(`INSERT INTO run_events (run_id, stage, level, code, detail) VALUES ($1, $2, $3, $4, $5)`, [runId, stage, level, code, detail]);
}

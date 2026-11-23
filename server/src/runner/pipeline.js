import { draftFromSource } from "../stages/source-fallback.js";
import { forEachConcurrent, AI_CONCURRENCY } from "./concurrency.js";
import { buildGraph } from "../graph/build-graph.js";
import { makeGraphGroups } from "../stages/grouper.js";
import { saveGraphGroups, savePlainLanguage } from "../db/load-graph.js";
import { makePlainLanguage, overlayPlainLanguage } from "../stages/plain-language.js";
import { applyGroups } from "../graph/groups.js";
import { makeTours } from "../stages/tour-agent.js";
import { saveTours } from "../db/tours.js";
import { buildUserGuidePages } from "../stages/user-guide-deterministic.js";
import { polishUserGuidePages } from "../stages/user-guide-writer.js";
import { getPool } from "../db/pool.js";
import { fetchRepo } from "../reader/fetch-repo.js";
import { scan } from "../scanner/index.js";
import { BudgetManager, BudgetExceededError } from "../ai/budget-manager.js";
import { analyzeModule } from "../stages/analyst.js";
import { writeReferencePage } from "../stages/writer.js";
import { writeOverviewPage } from "../stages/architect.js";
import {
  buildTechStackPage,
  buildDataModelPage,
  buildArchitecturePage,
  buildApiEndpointsPage,
  buildGettingStartedPage,
  buildConfigurationPage,
  buildFrontendPage,
} from "../stages/architect-deterministic.js";
import { renderPage } from "../renderer/render-page.js";
import { verifyPage, scanRenderedPageForUnknownMentions } from "../stages/verifier.js";
import { checkClaims } from "../stages/claim-check.js";
import { savePageRevision } from "../db/pages.js";
import { saveClaimChecks, saveFindings } from "../db/verification.js";
import { initStages, startStage, finishStage, recordEvent } from "./stage-tracking.js";

const STAGES = ["reader", "scanner", "analyst", "architect", "writer", "verifier", "render"];

/**
 * Task 3's real pipeline: Repo Reader -> Scanner -> (Code Analyst -> Writer
 * -> Renderer) per module. Architect and Verifier don't exist yet (Task 4,
 * Task 5) - their stages are marked skipped, not run. Runs entirely
 * server-side after POST /api/runs returns; the caller doesn't await this.
 *
 * `aiStub: true` (the default - see routes/runs.js) makes the Analyst and
 * Writer return canned responses with zero network calls and zero cost
 * (AT-15 "stub mode"). Pass `aiStub: false` only with a real
 * ANTHROPIC_API_KEY and the user's go-ahead - it spends real money.
 */
export async function runPipeline(runId, { owner, name, ref }, { aiStub = true } = {}) {
  const pool = getPool();
  await initStages(runId, STAGES);

  const { rows } = await pool.query(`SELECT budget_cap_usd, write_for FROM runs WHERE id = $1`, [runId]);
  const budgetManager = new BudgetManager(Number(rows[0].budget_cap_usd));
  const writeFor = rows[0].write_for;

  let snapshot, contentByPath, fallbackByPath, resolvedSha;
  try {
    await startStage(runId, "reader");
    ({ snapshot, contentByPath, fallbackByPath } = await fetchRepo({ owner, name, ref }));
    resolvedSha = snapshot.resolved_sha;
    await pool.query(`UPDATE runs SET resolved_sha = $2 WHERE id = $1`, [runId, resolvedSha]);
    await saveFiles(runId, snapshot.files);
    await finishStage(runId, "reader", "done", { itemsDone: snapshot.files.length });
  } catch (err) {
    await finishStage(runId, "reader", "failed", { message: err.message });
    await recordEvent(runId, "reader", "error", "reader_failed", { message: err.message });
    await failRun(runId, "reader_failed", err.message);
    return;
  }

  // Size check before any AI spending: on a host with a time limit (Vercel's free plan stops a
  // run at 5 minutes), a repo over the code-file limit can't finish, so stop now with a clear
  // message and the real count. MAX_CODE_FILES overrides; 0 means no limit (default locally).
  const maxCodeFiles = Number(process.env.MAX_CODE_FILES ?? (process.env.VERCEL ? 100 : 0));
  const codeFileCount = snapshot.files.filter((f) => f.status === "scanned" && /\.(jsx?|tsx?|mjs|cjs|py)$/i.test(f.path)).length;
  if (maxCodeFiles > 0 && codeFileCount > maxCodeFiles) {
    await failRun(
      runId,
      "repo_too_large",
      `This repo has ${codeFileCount} code files, which is over SpecsDoctor's limit of ${maxCodeFiles}. Please try a smaller repo, or select a branch with fewer files within your repo.`
    );
    return;
  }

  await startStage(runId, "scanner");
  let scanned;
  let scannerFailed = false;
  try {
    scanned = scan(snapshot, contentByPath);
  } catch (err) {
    scannerFailed = true;
    await finishStage(runId, "scanner", "failed", { message: err.message });
    await recordEvent(runId, "scanner", "error", "scanner_failed", { message: err.message });
    if (aiStub) {
      await failRun(runId, "scanner_failed", err.message);
      return;
    }
    // Preserve the fetched inventory but build an empty index for source review.
    scanned = scan({ ...snapshot, files: [] }, {});
  }
  const { index } = scanned;
  await saveIndex(runId, index);
  if (!scannerFailed) await finishStage(runId, "scanner", "done", { itemsDone: index.items.length });

  const modules = groupItemsByModule(index.items);
  const repo = { owner, name, sha: resolvedSha };

  await startStage(runId, "analyst", modules.length);
  const summaries = new Map();
  let analystFailed = 0;
  let analystFirstError = null;
  let budgetExhausted = false;
  await forEachConcurrent(modules, AI_CONCURRENCY, async (mod) => {
    if (budgetExhausted) {
      await recordEvent(runId, "analyst", "warn", "budget_skipped", { modulePath: mod.path });
      analystFailed += 1;
      return;
    }
    try {
      const summary = await analyzeModule({ runId, modulePath: mod.path, items: mod.items, source: contentByPath[mod.path] ?? "", budgetManager, stub: aiStub });
      if (summary) summaries.set(mod.path, summary);
      else analystFailed += 1;
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        budgetExhausted = true;
        await recordEvent(runId, "analyst", "warn", "budget_skipped", { modulePath: mod.path });
      } else {
        await recordEvent(runId, "analyst", "error", "module_failed", { modulePath: mod.path, message: err.message });
        analystFirstError ??= err.message;
      }
      analystFailed += 1;
    }
  });
  await finishStage(runId, "analyst", analystFailed === 0 ? "done" : analystFailed === modules.length ? "failed" : "partial", { itemsDone: summaries.size, itemsFailed: analystFailed, message: analystFirstError });

  // T15 Architect: tech-stack/data-model/architecture are always built (no
  // AI, no fallback needed - they *are* the fallback, per §2); overview is
  // the one AI-narrative page in Task 4's scope and has no deterministic
  // substitute, so it's simply absent (not a degraded page) if it fails.
  // 6 deterministic pages always, +frontend (Task 9 / T21) only when the repo actually has
  // react-router routes or components with props, +overview (AI) only when there's at least one
  // module summary to synthesize from - total isn't fixed up front.
  await startStage(runId, "architect");
  const architectPages = [
    buildTechStackPage(index),
    buildDataModelPage(index),
    buildArchitecturePage(index),
    buildApiEndpointsPage(index),
    buildGettingStartedPage(index),
    buildConfigurationPage(index),
    buildFrontendPage(index),
  ].filter(Boolean);
  const hasDocumentedSubject = index.items.some((item) => item.kind === "endpoint" || item.documented);
  let fallbackPage = null;
  let aiAuthenticationFailed = false;
  let architectFailed = 0;
  try {
    const overviewInput = [...summaries.entries()].map(([modulePath, summary]) => ({ module_path: modulePath, summary }));
    if (!hasDocumentedSubject && !aiStub) {
      const sources = { ...fallbackByPath, ...contentByPath };
      for (const path of Object.keys(sources)) {
        if (!/\.(html?|vue|svelte|astro|rb|php|go|rs|java|kt|cs|swift|cpp|c|h|hpp|scala|lua|exs?|clj|dart|sh|[cm]?js|jsx|tsx?|py)$/i.test(path)) delete sources[path];
      }
      fallbackPage = await draftFromSource({ runId, sources, budgetManager });
      if (fallbackPage) {
        architectPages.push(fallbackPage);
        Object.assign(contentByPath, sources);
      }
    }
    const overview = fallbackPage ?? await writeOverviewPage({ runId, index, summaries: overviewInput, budgetManager, stub: aiStub });
    if (overview && !fallbackPage) architectPages.push(overview);
    else if (!overview) architectFailed += 1;
  } catch (err) {
    architectFailed += 1;
    aiAuthenticationFailed = err.status === 401;
    await recordEvent(runId, "architect", "error", "page_generation_failed", { slug: "overview", message: err.message });
  }
  await finishStage(runId, "architect", architectFailed === 0 ? "done" : "partial", { itemsDone: architectPages.length, itemsFailed: architectFailed });

  // Repo map areas, then the guided tours that play on that map. Neither can fail the run.
  const summaryList = [...summaries.entries()].map(([modulePath, summary]) => ({ module_path: modulePath, summary }));
  const itemSummaries = new Map();
  for (const sm of summaries.values()) for (const it of sm.items ?? []) if (it.symbol_id && it.what_it_does) itemSummaries.set(it.symbol_id, it.what_it_does);
  let groupedGraph = buildGraph(index, { summaries: itemSummaries });
  try {
    const grouping = await makeGraphGroups({ runId, graph: groupedGraph, summaries: summaryList, budgetManager, stub: aiStub });
    await saveGraphGroups(runId, grouping);
    groupedGraph = applyGroups(groupedGraph, grouping.groups);
  } catch (err) {
    await recordEvent(runId, "architect", "warn", "graph_groups_failed", { message: err.message });
  }
  try {
    const plain = await makePlainLanguage({ runId, graph: groupedGraph, budgetManager, stub: aiStub });
    await savePlainLanguage(runId, plain);
    groupedGraph = overlayPlainLanguage(groupedGraph, plain.nodes);
  } catch (err) {
    await recordEvent(runId, "architect", "warn", "plain_language_failed", { message: err.message });
  }
  try {
    const { tours, findings } = await makeTours({ runId, graph: groupedGraph, index, summaries: summaryList, budgetManager, stub: aiStub });
    await saveTours(runId, tours, findings);
  } catch (err) {
    await recordEvent(runId, "architect", "warn", "tours_failed", { message: err.message });
  }

  // Task 12 (T33-T35): plain-language user guides, only when actually asked for - skips the
  // extra pages and cost entirely for the "developers" default, same budget-consciousness as
  // every other optional stage here.
  if (writeFor === "everyday" || writeFor === "both") {
    try {
      const deterministicGuides = buildUserGuidePages(groupedGraph, index);
      const guides = await polishUserGuidePages({ runId, pages: deterministicGuides, budgetManager, stub: aiStub });
      architectPages.push(...guides);
    } catch (err) {
      await recordEvent(runId, "architect", "warn", "user_guides_failed", { message: err.message });
    }
  }

  await startStage(runId, "writer", modules.length);
  await startStage(runId, "render", modules.length + architectPages.length);
  await startStage(runId, "verifier", modules.length + architectPages.length);
  let modulePagesSaved = 0;
  let writerFailed = 0;
  let writerFirstError = null;
  let totalFindings = 0;
  let pagesWithFailedClaims = 0;

  for (const page of architectPages) {
    const result = await saveAndVerifyPage({ runId, page, index, contentByPath, repo, ownerStage: page.slug === "overview" ? "architect" : "renderer", budgetManager, aiStub });
    totalFindings += result.findings.length;
    if (result.hasFailedClaim) pagesWithFailedClaims += 1;
  }
  await forEachConcurrent(modules, AI_CONCURRENCY, async (mod) => {
    try {
      const summary = summaries.get(mod.path);
      const page = summary
        ? await writeReferencePage({ runId, modulePath: mod.path, items: mod.items, summary, budgetManager, stub: aiStub })
        : deterministicOnlyPage(mod);
      const result = await saveAndVerifyPage({ runId, page, index, contentByPath, repo, budgetManager, aiStub });
      totalFindings += result.findings.length;
      if (result.hasFailedClaim) pagesWithFailedClaims += 1;
      modulePagesSaved += 1;
    } catch (err) {
      writerFailed += 1;
      await recordEvent(runId, "writer", "error", "page_generation_failed", { modulePath: mod.path, message: err.message });
      writerFirstError ??= err.message;
    }
  });
  const pagesSaved = architectPages.length + modulePagesSaved;
  await finishStage(runId, "writer", writerFailed === 0 ? "done" : writerFailed === modules.length ? "failed" : "partial", { itemsDone: modulePagesSaved, itemsFailed: writerFailed, message: writerFirstError });
  await finishStage(runId, "render", "done", { itemsDone: pagesSaved });
  await finishStage(runId, "verifier", pagesWithFailedClaims === 0 ? "done" : "partial", { itemsDone: pagesSaved, itemsFailed: pagesWithFailedClaims, message: `${totalFindings} finding(s)` });

  const usable = (hasDocumentedSubject || fallbackPage !== null) && pagesSaved > 0;
  const status = !usable
    ? "failed"
    : scannerFailed || writerFailed > 0 || analystFailed > 0 || architectFailed > 0 || pagesWithFailedClaims > 0
      ? "complete_with_errors"
      : "complete";

  await pool.query(`UPDATE runs SET status = $2, cost_usd = $3, finished_at = now() WHERE id = $1`, [runId, status, budgetManager.spentUsd]);
  if (!usable) {
    await pool.query(`UPDATE runs SET failure_code = $2, failure_detail = $3 WHERE id = $1`, [
      runId,
      aiAuthenticationFailed ? "ai_authentication_failed" : "no_usable_output",
      aiAuthenticationFailed ? "Anthropic rejected the configured API key. Update the key and retry." : null,
    ]);
  }
}

/**
 * Renders, saves, and verifies one page in one place - every page in this
 * pipeline goes through the same render -> save -> verify sequence, so this
 * is the single definition of what "a saved page" means here (T13/T17).
 */
async function saveAndVerifyPage({ runId, page, index, contentByPath, repo, ownerStage, budgetManager, aiStub }) {
  const { markdown, warnings } = renderPage(page, index, repo);
  const { pageId, rev } = await savePageRevision({ runId, page, markdown, ownerStage });

  const unknownMentions = scanRenderedPageForUnknownMentions(markdown, index);
  const { verifyResult, findings } = verifyPage({ page, rev, index, contentByPath, renderWarnings: warnings, unknownMentions });
  verifyResult.claims = await checkClaims({ runId, page, claimChecks: verifyResult.claims, contentByPath, budgetManager, stub: aiStub });

  await saveClaimChecks({ pageId, rev, verifyResult });
  await saveFindings({ runId, pageId, findings });
  await getPool().query(`UPDATE page_revisions SET checks_fresh = true WHERE page_id = $1 AND rev = $2`, [pageId, rev]);

  return { findings, hasFailedClaim: verifyResult.claims.some((c) => c.structural.status === "fail") };
}

function groupItemsByModule(items) {
  const byPath = new Map();
  for (const item of items) {
    if (item.kind === "endpoint") continue; // endpoints aren't owned by one module's reference page
    if (!byPath.has(item.path)) byPath.set(item.path, []);
    byPath.get(item.path).push(item);
  }
  return [...byPath.entries()].map(([path, moduleItems]) => ({ path, items: moduleItems }));
}

function deterministicOnlyPage(mod) {
  return {
    schema_version: "page/1",
    slug: mod.path.replace(/\//g, "-").replace(/\.[a-z]+$/i, ""),
    title: mod.path,
    sections: [{ heading: mod.path, blocks: mod.items.map((i) => ({ type: "symbol_ref", symbol_id: i.id })) }],
  };
}

async function saveFiles(runId, files) {
  const pool = getPool();
  for (const f of files) {
    await pool.query(
      `INSERT INTO files (run_id, path, size_bytes, status, reason) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (run_id, path) DO NOTHING`,
      [runId, f.path, f.size, f.status, f.reason ?? null]
    );
  }
}

async function saveIndex(runId, index) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO run_artifacts (run_id, coverage, project_facts, import_graph) VALUES ($1, $2, $3, $4)
     ON CONFLICT (run_id) DO UPDATE SET coverage = EXCLUDED.coverage, project_facts = EXCLUDED.project_facts, import_graph = EXCLUDED.import_graph`,
    [runId, index.coverage, index.project, { imports: index.imports, unresolved_imports: index.unresolved_imports, graph_facts: index.graph_facts }]
  );
  for (const item of index.items) {
    await pool.query(
      `INSERT INTO index_items (run_id, id, kind, name, path, start_line, end_line, documented, data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (run_id, id) DO NOTHING`,
      [runId, item.id, item.kind, item.name ?? item.method, item.kind === "endpoint" ? item.declaration.path : item.path, item.kind === "endpoint" ? item.declaration.start_line : item.start_line, item.kind === "endpoint" ? item.declaration.end_line : item.end_line, item.kind === "endpoint" ? true : Boolean(item.documented), item]
    );
  }
}

async function failRun(runId, code, detail) {
  await getPool().query(`UPDATE runs SET status = 'failed', failure_code = $2, failure_detail = $3, finished_at = now() WHERE id = $1`, [runId, code, detail]);
}

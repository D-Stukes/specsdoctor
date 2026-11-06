import { getPool } from "../db/pool.js";
import { fetchRepo } from "../reader/fetch-repo.js";
import { scan } from "../scanner/index.js";
import { BudgetManager, BudgetExceededError } from "../ai/budget-manager.js";
import { analyzeModule } from "../stages/analyst.js";
import { writeReferencePage } from "../stages/writer.js";
import { writeOverviewPage } from "../stages/architect.js";
import { buildTechStackPage, buildDataModelPage, buildArchitecturePage, buildApiEndpointsPage } from "../stages/architect-deterministic.js";
import { renderPage } from "../renderer/render-page.js";
import { savePageRevision } from "../db/pages.js";
import { initStages, startStage, finishStage, skipStage, recordEvent } from "./stage-tracking.js";

const STAGES = ["reader", "scanner", "analyst", "architect", "writer", "verifier", "render"];
const MODULE_LIMIT = 100; // §4a

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

  const { rows } = await pool.query(`SELECT budget_cap_usd FROM runs WHERE id = $1`, [runId]);
  const budgetManager = new BudgetManager(Number(rows[0].budget_cap_usd));

  let snapshot, contentByPath, resolvedSha;
  try {
    await startStage(runId, "reader");
    ({ snapshot, contentByPath } = await fetchRepo({ owner, name, ref }));
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

  let index;
  try {
    await startStage(runId, "scanner");
    const scanned = scan(snapshot, contentByPath);
    index = scanned.index;
    await saveIndex(runId, index);
    await finishStage(runId, "scanner", "done", { itemsDone: index.items.length });
  } catch (err) {
    await finishStage(runId, "scanner", "failed", { message: err.message });
    await recordEvent(runId, "scanner", "error", "scanner_failed", { message: err.message });
    await failRun(runId, "scanner_failed", err.message);
    return;
  }

  await skipStage(runId, "verifier", "Task 5 (not built yet)");

  const modules = groupItemsByModule(index.items).slice(0, MODULE_LIMIT);
  const repo = { owner, name, sha: resolvedSha };

  await startStage(runId, "analyst", modules.length);
  const summaries = new Map();
  let analystFailed = 0;
  let budgetExhausted = false;
  for (const mod of modules) {
    if (budgetExhausted) {
      await recordEvent(runId, "analyst", "warn", "budget_skipped", { modulePath: mod.path });
      analystFailed += 1;
      continue;
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
      }
      analystFailed += 1;
    }
  }
  await finishStage(runId, "analyst", analystFailed === 0 ? "done" : analystFailed === modules.length ? "failed" : "partial", { itemsDone: summaries.size, itemsFailed: analystFailed });

  // T15 Architect: tech-stack/data-model/architecture are always built (no
  // AI, no fallback needed - they *are* the fallback, per §2); overview is
  // the one AI-narrative page in Task 4's scope and has no deterministic
  // substitute, so it's simply absent (not a degraded page) if it fails.
  await startStage(runId, "architect", 4);
  const architectPages = [buildTechStackPage(index), buildDataModelPage(index), buildArchitecturePage(index), buildApiEndpointsPage(index)];
  let architectFailed = 0;
  try {
    const overviewInput = [...summaries.entries()].map(([modulePath, summary]) => ({ module_path: modulePath, summary }));
    const overview = await writeOverviewPage({ runId, index, summaries: overviewInput, budgetManager, stub: aiStub });
    if (overview) architectPages.push(overview);
    else architectFailed += 1;
  } catch (err) {
    architectFailed += 1;
    await recordEvent(runId, "architect", "error", "page_generation_failed", { slug: "overview", message: err.message });
  }
  await finishStage(runId, "architect", architectFailed === 0 ? "done" : "partial", { itemsDone: architectPages.length, itemsFailed: architectFailed });

  await startStage(runId, "writer", modules.length);
  await startStage(runId, "render", modules.length + architectPages.length);
  let modulePagesSaved = 0;
  let writerFailed = 0;

  for (const page of architectPages) {
    const { markdown } = renderPage(page, index, repo);
    await savePageRevision({ runId, page, markdown, ownerStage: page.slug === "overview" ? "architect" : "renderer" });
  }
  for (const mod of modules) {
    try {
      const summary = summaries.get(mod.path);
      const page = summary
        ? await writeReferencePage({ runId, modulePath: mod.path, items: mod.items, summary, budgetManager, stub: aiStub })
        : deterministicOnlyPage(mod);
      const { markdown } = renderPage(page, index, repo);
      await savePageRevision({ runId, page, markdown });
      modulePagesSaved += 1;
    } catch (err) {
      writerFailed += 1;
      await recordEvent(runId, "writer", "error", "page_generation_failed", { modulePath: mod.path, message: err.message });
    }
  }
  const pagesSaved = architectPages.length + modulePagesSaved;
  await finishStage(runId, "writer", writerFailed === 0 ? "done" : writerFailed === modules.length ? "failed" : "partial", { itemsDone: modulePagesSaved, itemsFailed: writerFailed });
  await finishStage(runId, "render", "done", { itemsDone: pagesSaved });

  const hasDocumentedSubject = index.items.some((i) => i.kind === "endpoint" || i.documented);
  const usable = hasDocumentedSubject && pagesSaved > 0;
  const status = !usable ? "failed" : writerFailed > 0 || analystFailed > 0 || architectFailed > 0 ? "complete_with_errors" : "complete";

  await pool.query(`UPDATE runs SET status = $2, cost_usd = $3, finished_at = now() WHERE id = $1`, [runId, status, budgetManager.spentUsd]);
  if (!usable) {
    await pool.query(`UPDATE runs SET failure_code = 'no_usable_output' WHERE id = $1`, [runId]);
  }
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
    [runId, index.coverage, index.project, { imports: index.imports, unresolved_imports: index.unresolved_imports }]
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

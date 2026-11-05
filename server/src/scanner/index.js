import { parseFile } from "./babel.js";
import { extractItemsAndExports } from "./extract-items-exports.js";
import { extractImportsAndEnv } from "./extract-imports-env.js";
import { extractRoutes } from "./extract-routes.js";
import { parseSqlTables, parsePrismaTables } from "./extract-schemas.js";
import { resolveModuleSpecifier, looksLikeNonModuleAsset, isAliasedSpecifier } from "./resolve-module.js";
import { buildRouteGraph } from "./route-graph.js";

const PARSER_VERSION = "js-0.1.0";

function dirnameOf(path) {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

/**
 * Runs the full JS/TS Scanner (T06-T08) over a snapshot's scanned files.
 * `snapshot` is a snapshot/1 document (from the Repo Reader); `contentByPath`
 * maps each scanned file's path to its text. Mutates nothing - returns a
 * fresh { index, updatedFiles } where `updatedFiles` is `snapshot.files`
 * with parse-failed entries flipped to status "failed" (the only status
 * change the Scanner itself makes; everything else was Reader's call).
 */
export function scan(snapshot, contentByPath) {
  const scannedPaths = new Set(snapshot.files.filter((f) => f.status === "scanned").map((f) => f.path));
  const updatedFiles = snapshot.files.map((f) => ({ ...f }));
  const flaggedPatterns = [];
  const allItems = [];
  const envVarRefs = new Map(); // name -> [{path,line}]
  const importsEdges = [];
  const unresolvedImports = [];
  const tables = [];
  const workspaces = [];
  const envExampleNames = new Set();
  const routesByFile = new Map();
  const perFileItemsByName = new Map(); // path -> Map(localName -> item draft)
  const perFileRequireBindings = new Map(); // path -> Map(localName -> spec)

  for (const file of updatedFiles) {
    if (file.status !== "scanned") continue;
    const content = contentByPath[file.path];
    if (content === undefined) continue;

    if (file.path.endsWith("package.json")) {
      workspaces.push(parseManifest(file.path, content));
      continue;
    }
    if (file.path.endsWith(".sql")) {
      const { tables: t, flaggedPatterns: fp } = parseSqlTables(file.path, content);
      tables.push(...t);
      flaggedPatterns.push(...fp);
      continue;
    }
    if (file.path.endsWith("schema.prisma")) {
      const { tables: t } = parsePrismaTables(file.path, content);
      tables.push(...t);
      continue;
    }
    if (/(^|\/)\.env\.example$|env\.example\.txt$/.test(file.path)) {
      for (const line of content.split("\n")) {
        const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
        if (m) envExampleNames.add(m[1]);
      }
      continue;
    }

    // Knex/Sequelize migrations: file listed and flagged, not parsed for
    // table facts (§2 "Schemas" row) - generic JS extraction below still
    // runs over it, which is harmless and occasionally useful.
    if (/(^|\/)migrations\//.test(file.path)) {
      flaggedPatterns.push({ path: file.path, line: 1, pattern: "knex_migration" });
    }

    // JS/TS/JSX/TSX source.
    let ast;
    try {
      ast = parseFile(file.path, content);
    } catch {
      const idx = updatedFiles.findIndex((f) => f.path === file.path);
      updatedFiles[idx] = { ...updatedFiles[idx], status: "failed", reason: "parse_error" };
      continue;
    }

    const { items, flaggedPatterns: fp1 } = extractItemsAndExports(ast, { language: "javascript" });
    const { staticSpecifiers, dynamicUnresolved, envRefs, flaggedPatterns: fp2 } = extractImportsAndEnv(ast);
    const routeFacts = extractRoutes(ast);

    flaggedPatterns.push(...fp1.map((f) => ({ ...f, path: file.path })));
    flaggedPatterns.push(...fp2.map((f) => ({ ...f, path: file.path })));
    flaggedPatterns.push(...routeFacts.flaggedPatterns.map((f) => ({ ...f, path: file.path })));

    const nameToItem = new Map(items.map((it) => [it.name, it]));
    perFileItemsByName.set(file.path, nameToItem);
    for (const item of items) {
      allItems.push({ ...item, id: `sym:${file.path}#${item.name}`, path: file.path, language: "javascript" });
    }

    for (const ref of envRefs) {
      if (!envVarRefs.has(ref.name)) envVarRefs.set(ref.name, []);
      envVarRefs.get(ref.name).push({ path: file.path, line: ref.line });
    }

    for (const spec of staticSpecifiers) {
      if (isAliasedSpecifier(spec.spec)) {
        unresolvedImports.push({ from: file.path, spec: spec.spec, line: spec.line, reason: "aliased_path" });
        continue;
      }
      if (!spec.spec.startsWith(".") && !spec.spec.startsWith("/")) continue; // external dependency, not a local edge
      const resolved = resolveModuleSpecifier(file.path, spec.spec, scannedPaths);
      if (resolved) {
        importsEdges.push({ from: file.path, to: resolved, kind: spec.kind === "require" ? "require" : "import" });
      } else if (!looksLikeNonModuleAsset(spec.spec)) {
        unresolvedImports.push({ from: file.path, spec: spec.spec, line: spec.line, reason: "unresolved_relative" });
      }
    }
    for (const d of dynamicUnresolved) {
      unresolvedImports.push({ from: file.path, spec: "<dynamic>", line: d.line, reason: d.reason });
    }

    routesByFile.set(file.path, routeFacts);
    const requireBindingsMap = new Map(routeFacts.requireBindings);
    perFileRequireBindings.set(file.path, requireBindingsMap);
  }

  // T07: resolve every endpoint's full path via the cross-file mount graph.
  const { resolveEndpointPath } = buildRouteGraph(routesByFile, scannedPaths);

  function resolveHandlerOrMiddleware(filePath, name) {
    const local = perFileItemsByName.get(filePath)?.get(name);
    if (local) return `sym:${filePath}#${name}`;
    const spec = perFileRequireBindings.get(filePath)?.get(name);
    if (!spec) return null;
    const [modulePath, exportedName] = spec.split("#");
    const resolved = resolveModuleSpecifier(filePath, modulePath, scannedPaths);
    if (!resolved) return null;
    return `sym:${resolved}#${exportedName ?? name}`;
  }

  for (const [filePath, facts] of routesByFile) {
    for (const ep of facts.endpoints) {
      const { fullPath, resolved, mountSteps } = resolveEndpointPath(filePath, ep.ownerVar, ep.pathLiteral, ep.pathResolved);
      const handler =
        ep.handler.kind === "inline"
          ? { inline: { path: filePath, start_line: ep.handler.start_line, end_line: ep.handler.end_line } }
          : ep.handler.kind === "identifier"
            ? { symbol_id: resolveHandlerOrMiddleware(filePath, ep.handler.name) ?? `sym:${filePath}#${ep.handler.name}` }
            : { inline: { path: filePath, start_line: ep.declLine, end_line: ep.declEndLine } };

      allItems.push({
        id: `ep:${ep.method} ${fullPath}@${filePath}:${ep.declLine}`,
        kind: "endpoint",
        method: ep.method,
        path: fullPath,
        resolved,
        declaration: { path: filePath, start_line: ep.declLine, end_line: ep.declEndLine },
        mounts: mountSteps,
        middleware: ep.middleware.map((m) => resolveHandlerOrMiddleware(filePath, m)).filter(Boolean),
        handler,
      });
    }
  }

  // Cross-reference env_vars against the .env.example-equivalent file, if any.
  const envVars = [...envVarRefs.entries()].map(([name, refs]) => ({
    id: `env:${name}`,
    refs,
    in_env_example: envExampleNames.has(name),
  }));

  const index = {
    schema_version: "index/1",
    parser_version: PARSER_VERSION,
    items: allItems,
    project: { workspaces, env_vars: envVars, tables },
    imports: importsEdges,
    unresolved_imports: unresolvedImports,
    coverage: {
      files: countByStatus(updatedFiles),
      flagged_patterns: flaggedPatterns.map((f) => ({ path: f.path, line: f.line, pattern: f.pattern })),
    },
  };

  return { index, updatedFiles };
}

function countByStatus(files) {
  const counts = { scanned: 0, skipped: 0, unsupported: 0, failed: 0 };
  for (const f of files) counts[f.status] = (counts[f.status] ?? 0) + 1;
  return counts;
}

function parseManifest(path, content) {
  let pkg;
  try {
    pkg = JSON.parse(content);
  } catch {
    return { dir: dirnameOf(path), scripts: {}, dependencies: {}, engines: null, frontend: false };
  }
  const dependencies = { ...pkg.dependencies };
  return {
    dir: dirnameOf(path),
    scripts: pkg.scripts ?? {},
    dependencies,
    engines: pkg.engines ?? null,
    frontend: Boolean(dependencies.react),
  };
}

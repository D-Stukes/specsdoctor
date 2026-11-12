import { buildSourceLink } from "./source-link.js";

/**
 * Deterministic renderer (T11): page/1 JSON -> Markdown. Every signature,
 * link and warning a reader sees comes from here, built from the index -
 * never from the model (Technical Design §3, §4c). Returns the Markdown
 * string; `warnings` collects anything the page referenced that the index
 * doesn't have (an id that doesn't resolve), the renderer's own evidence
 * for the Verifier (T13) to turn into review items.
 */
function middlewareName(item, fallbackId) {
  if (!item) return fallbackId;
  if (item.name !== "default") return item.name;
  return item.path.split("/").pop().replace(/\.[^.]+$/, ""); // anonymous default export: the file name identifies it
}

export function renderPage(page, index, repo) {
  const itemsById = new Map(index.items.map((i) => [i.id, i]));
  const envById = new Map(index.project.env_vars.map((e) => [e.id, e]));
  const tableById = new Map(index.project.tables.map((t) => [t.id, t]));
  const routeById = new Map(index.project.routes.map((r) => [r.id, r]));
  const warnings = [];

  const lines = [`# ${page.title}`, ""];

  for (const section of page.sections) {
    lines.push(`## ${section.heading}`, "");
    const list = page.slug === "overview" && ["What users can do", "How it fits together"].includes(section.heading);
    for (const block of section.blocks) {
      const ctx = { itemsById, envById, tableById, routeById, repo, warnings };
      if (list && block.type === "prose") lines.push(`- ${block.text.replace(/\s+/g, " ").trim()}`);
      else if (list && block.type === "claim") lines.push(...renderClaim(block.claim, ctx, true));
      else lines.push(...renderBlock(block, ctx));
      lines.push("");
    }
  }

  return { markdown: lines.join("\n").trimEnd() + "\n", warnings };
}

function renderBlock(block, ctx) {
  switch (block.type) {
    case "prose":
      return [block.text];
    case "claim":
      return renderClaim(block.claim, ctx);
    case "symbol_ref":
      return renderSymbolRef(block.symbol_id, ctx);
    case "endpoint_ref":
      return renderEndpointRef(block.endpoint_id, ctx);
    case "route_ref":
      return renderRouteRef(block.route_id, ctx);
    case "evidence_link":
      return renderEvidenceLink(block, ctx);
    case "env_ref":
      return renderEnvRef(block.env_id, ctx);
    case "table_ref":
      return renderTableRef(block.table_id, ctx);
    case "code":
      return renderCode(block);
    case "mermaid":
      return ["```mermaid", block.text, "```"];
    default:
      return [];
  }
}

function renderSymbolRef(symbolId, ctx) {
  const item = ctx.itemsById.get(symbolId);
  if (!item) {
    ctx.warnings.push({ reason: "unknown_symbol", detail: symbolId });
    return [`> _Unknown symbol: \`${symbolId}\`_`];
  }
  const link = buildSourceLink(ctx.repo, item.path, item.start_line, item.end_line);
  const heading = item.signature ? `\`${item.signature}\`` : `\`${item.name}\` (${item.kind})`;
  const out = [`#### ${heading}`, "", `[${item.path}:${item.start_line}](${link})`];
  if (item.doc) out.push("", item.doc);
  if (item.params?.length) {
    out.push("", "| Param | Type |", "| --- | --- |");
    for (const p of item.params) out.push(`| \`${p.name}\` | ${p.type ? `\`${p.type}\`` : "_unknown_"} |`);
  }
  if (item.returns) out.push("", `Returns: \`${item.returns}\``);
  return out;
}

function renderEndpointRef(endpointId, ctx) {
  const item = ctx.itemsById.get(endpointId);
  if (!item) {
    ctx.warnings.push({ reason: "unknown_symbol", detail: endpointId });
    return [`> _Unknown endpoint: \`${endpointId}\`_`];
  }
  const link = buildSourceLink(ctx.repo, item.declaration.path, item.declaration.start_line, item.declaration.end_line);
  const out = [`#### \`${item.method} ${item.path}\``, "", `[${item.declaration.path}:${item.declaration.start_line}](${link})`];
  if (!item.resolved) out.push("", "_Route prefix could not be fully resolved statically._");
  if (item.middleware.length) {
    out.push("", `Middleware: ${item.middleware.map((m) => `\`${middlewareName(ctx.itemsById.get(m), m)}\``).join(", ")}`);
  }
  const handlerName = item.handler.symbol_id ? ctx.itemsById.get(item.handler.symbol_id)?.name ?? item.handler.symbol_id : "(inline handler)";
  out.push("", `Handler: \`${handlerName}\``);
  return out;
}

function renderRouteRef(routeId, ctx) {
  const route = ctx.routeById.get(routeId);
  if (!route) {
    ctx.warnings.push({ reason: "unknown_symbol", detail: routeId });
    return [`> _Unknown route: \`${routeId}\`_`];
  }
  const link = buildSourceLink(ctx.repo, route.source.path, route.source.start_line, route.source.end_line);
  const out = [`#### \`${route.path}\``, "", `[${route.source.path}:${route.source.start_line}](${link})`];
  out.push("", route.element_component ? `Renders: \`${route.element_component}\`` : "_Renders a computed element - not a plain JSX tag._");
  return out;
}

function renderEvidenceLink(block, ctx) {
  const link = buildSourceLink(ctx.repo, block.path, block.start_line, block.end_line);
  return [`[See the code for this step](${link})`];
}

function renderEnvRef(envId, ctx) {
  const env = ctx.envById.get(envId);
  if (!env) {
    ctx.warnings.push({ reason: "unknown_symbol", detail: envId });
    return [`> _Unknown env var: \`${envId}\`_`];
  }
  const name = envId.slice("env:".length);
  const refs = env.refs.map((r) => `${r.path}:${r.line}`).join(", ");
  return [`- \`${name}\` ${env.in_env_example ? "(documented in .env.example)" : "(no .env.example entry)"} — referenced at ${refs}`];
}

function renderTableRef(tableId, ctx) {
  const table = ctx.tableById.get(tableId);
  if (!table) {
    ctx.warnings.push({ reason: "unknown_symbol", detail: tableId });
    return [`> _Unknown table: \`${tableId}\`_`];
  }
  const link = buildSourceLink(ctx.repo, table.source.path, table.source.start_line, table.source.end_line);
  const name = tableId.slice("tbl:".length);
  const out = [`#### \`${name}\``, "", `[${table.source.path}:${table.source.start_line}](${link})`, "", "| Column | Type | Nullable |", "| --- | --- | --- |"];
  for (const c of table.columns) out.push(`| \`${c.name}\` | ${c.type ? `\`${c.type}\`` : "_unknown_"} | ${c.nullable ? "yes" : "no"} |`);
  return out;
}

function renderClaim(claim, ctx, list = false) {
  const out = [list ? `- ${claim.text.replace(/\s+/g, " ").trim()}` : `> ${claim.text}`];
  if (claim.evidence?.length) {
    const links = claim.evidence.map((e) => {
      const link = buildSourceLink(ctx.repo, e.path, e.start_line, e.end_line);
      return `[${e.path}:${e.start_line}](${link})`;
    });
    if (list) out.push(`  Evidence: ${links.join(", ")}`);
    else out.push(">", `> Evidence: ${links.join(", ")}`);
  }
  return out;
}

function renderCode(block) {
  const out = ["```" + block.lang, block.text, "```"];
  if (block.kind === "known_command" && block.source) {
    out.push(`_From \`${block.source.path}\` script \`${block.source.script}\`._`);
  } else if (block.kind === "inferred_command") {
    out.push("_Inferred step — not copied from the repository; please verify._");
  }
  return out;
}

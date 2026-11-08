// Deterministic Architect pages (§2 "If the Architect is cut or fails" -
// tech-stack.md and data-model.md as tables, architecture.md as a Mermaid
// import graph). Built this way unconditionally in Task 4, not only as a
// fallback: they need no AI call, never fail, and are the honest baseline
// the AI-narrative overview page (architect.js) sits on top of.

const MAX_GRAPH_EDGES = 150; // keep huge repos' diagrams renderable

export function buildTechStackPage(index) {
  const lines = [];
  for (const ws of index.project.workspaces) {
    const dir = ws.dir || "(root)";
    lines.push(`**${dir}**${ws.frontend ? " (frontend)" : ""}`, "");
    const scripts = Object.entries(ws.scripts);
    if (scripts.length) {
      lines.push("| Script | Command |", "| --- | --- |");
      for (const [name, cmd] of scripts) lines.push(`| \`${name}\` | \`${cmd}\` |`);
      lines.push("");
    }
    const deps = Object.entries(ws.dependencies);
    if (deps.length) {
      lines.push("| Dependency | Version |", "| --- | --- |");
      for (const [name, version] of deps) lines.push(`| \`${name}\` | \`${version}\` |`);
      lines.push("");
    }
    if (ws.engines) lines.push(`Engines: \`${JSON.stringify(ws.engines)}\``, "");
  }
  return {
    schema_version: "page/1",
    slug: "tech-stack",
    title: "Tech stack",
    sections: [{ heading: "Workspaces", blocks: [{ type: "prose", text: lines.join("\n") || "No package manifests found." }] }],
  };
}

export function buildDataModelPage(index) {
  const tables = index.project.tables;
  return {
    schema_version: "page/1",
    slug: "data-model",
    title: "Data model",
    sections: [
      {
        heading: "Tables",
        blocks: tables.length
          ? tables.map((t) => ({ type: "table_ref", table_id: t.id }))
          : [{ type: "prose", text: "No SQL `CREATE TABLE` or Prisma model definitions were found." }],
      },
    ],
  };
}

export function buildArchitecturePage(index) {
  const edges = index.imports.slice(0, MAX_GRAPH_EDGES);
  const lines = ["flowchart LR"];
  const seen = new Set();
  for (const imp of edges) {
    const from = nodeId(imp.from);
    const to = nodeId(imp.to);
    seen.add(`${from}["${imp.from}"]`);
    seen.add(`${to}["${imp.to}"]`);
    lines.push(`  ${from} --> ${to}`);
  }
  for (const decl of seen) lines.splice(1, 0, `  ${decl}`);
  const truncated = index.imports.length > MAX_GRAPH_EDGES;

  const blocks = [{ type: "mermaid", text: lines.join("\n") }];
  if (truncated) blocks.push({ type: "prose", text: `Showing the first ${MAX_GRAPH_EDGES} of ${index.imports.length} import edges.` });
  if (index.imports.length === 0) blocks[0] = { type: "prose", text: "No local import/require edges were found between scanned files." };

  return { schema_version: "page/1", slug: "architecture", title: "Architecture", sections: [{ heading: "Import graph", blocks }] };
}

function nodeId(path) {
  return `n${Math.abs(hashCode(path))}`;
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h;
}

export function buildApiEndpointsPage(index) {
  const endpoints = index.items.filter((i) => i.kind === "endpoint");
  return {
    schema_version: "page/1",
    slug: "api-endpoints",
    title: "API endpoints",
    sections: [
      {
        heading: "Endpoints",
        blocks: endpoints.length ? endpoints.map((e) => ({ type: "endpoint_ref", endpoint_id: e.id })) : [{ type: "prose", text: "No Express routes were found." }],
      },
    ],
  };
}

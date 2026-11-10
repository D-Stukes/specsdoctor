// Deterministic Architect pages: tech-stack.md and data-model.md as tables,
// architecture.md as a Mermaid import graph (§2 "If the Architect is cut or
// fails" names these three as the fallback) - plus api-endpoints.md,
// getting-started.md and configuration.md, which have no AI-authored
// equivalent in this build at all. Built unconditionally in Task 4: they
// need no AI call, never fail, and are the honest baseline the one
// AI-narrative page (overview.md, architect.js) sits on top of.

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

const PREFERRED_SCRIPTS = ["dev", "start", "build", "test"];

// §2 "Known vs inferred setup": only commands copied from package.json
// scripts or manifests belong here - no inferred steps ("create a database
// first"), since those need a review item (Task 5's Verifier) to flag them,
// which doesn't exist yet. `npm install` is attributed generically (no
// `source`) since it's a convention from the manifest's existence, not a
// named script; the scripts below cite their real script name.
export function buildGettingStartedPage(index) {
  const workspaces = index.project.workspaces;
  const blocks = [];
  if (workspaces.length === 0) {
    blocks.push({ type: "prose", text: "No package manifests were found, so no known setup commands could be extracted." });
  }
  for (const ws of workspaces) {
    const dir = ws.dir || "(root)";
    const manifestPath = ws.dir ? `${ws.dir}/package.json` : "package.json";
    blocks.push({ type: "prose", text: `**${dir}**` });
    blocks.push({ type: "code", kind: "known_command", lang: "bash", text: ws.dir ? `cd ${ws.dir} && npm install` : "npm install" });
    for (const name of PREFERRED_SCRIPTS) {
      if (ws.scripts[name]) {
        blocks.push({ type: "code", kind: "known_command", lang: "bash", text: `npm run ${name}`, source: { path: manifestPath, script: name } });
      }
    }
  }

  const envExampleVars = index.project.env_vars.filter((e) => e.in_env_example);
  if (envExampleVars.length) {
    blocks.push({ type: "prose", text: "Environment variables documented in `.env.example`:" });
    for (const e of envExampleVars) blocks.push({ type: "env_ref", env_id: e.id });
  }

  return { schema_version: "page/1", slug: "getting-started", title: "Getting started", sections: [{ heading: "Setup", blocks }] };
}

export function buildConfigurationPage(index) {
  const envVars = index.project.env_vars;
  return {
    schema_version: "page/1",
    slug: "configuration",
    title: "Configuration",
    sections: [
      {
        heading: "Environment variables",
        blocks: envVars.length ? envVars.map((e) => ({ type: "env_ref", env_id: e.id })) : [{ type: "prose", text: "No environment variables were found referenced in the code." }],
      },
    ],
  };
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

// A top-level function whose single parameter is a destructured object (`{ title, streak }`,
// typed or not) reads as a React component receiving props - buildParams() in
// extract-items-exports.js already flattens that pattern into one params entry per prop.
function looksLikeComponentWithProps(item) {
  return item.kind === "function" && /^[A-Z]/.test(item.name) && item.params.length > 0 && (item.signature ?? "").includes("({ ");
}

// Task 9 / T21 ("Should, gated" - built for real here, not a stub): react-router routes and
// top-level component props, the one page this scope boundary (C7) allows - no per-component
// reference pages. Skipped entirely for a backend-only repo: an empty "Frontend" page would be
// noise, not a finding.
export function buildFrontendPage(index) {
  const routes = index.project.routes;
  const components = index.items.filter(looksLikeComponentWithProps);
  if (routes.length === 0 && components.length === 0) return null;

  const sections = [];
  if (routes.length) sections.push({ heading: "Routes", blocks: routes.map((r) => ({ type: "route_ref", route_id: r.id })) });
  if (components.length) sections.push({ heading: "Components", blocks: components.map((c) => ({ type: "symbol_ref", symbol_id: c.id })) });

  return { schema_version: "page/1", slug: "frontend", title: "Frontend", sections };
}

import { traceSteps, endpointChoices } from "../../../client/src/map-model.js";
import { redactSecrets } from "../ai/redact.js";

// The questions the chat agent can ask about a run. Every tool reads parser facts, the saved map and the
// saved documentation pages; none reads source files (they are not stored) and none changes anything.

const MAX_RESULTS = 10;
const MAX_PAGE_CHARS = 4000;

const norm = (s) => String(s ?? "").toLowerCase();
const words = (q) => norm(q).split(/[^a-z0-9_$]+/).filter((w) => w.length > 1);

export const TOOL_DEFINITIONS = [
  {
    name: "overview",
    description: "Start here. Counts, the app's areas, its entry points, scripts and key libraries, and the list of saved documentation pages.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "search",
    description: "Find parts of the app (actions a person can take, screens, functions, saved data, files) by words from a question. Returns ids you can pass to describe or follow_request.",
    input_schema: { type: "object", properties: { query: { type: "string", description: "A few words, e.g. 'sign up' or 'todos'" } }, required: ["query"], additionalProperties: false },
  },
  {
    name: "describe",
    description: "Everything known about one part: what it is, what it does, where it lives (file and lines), what it takes in and saves, and what it calls or is called by.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "follow_request",
    description: "The numbered story of one action (an endpoint id): who asks, what comes in, checks, the work in order, what is looked up or saved, and what goes back.",
    input_schema: { type: "object", properties: { id: { type: "string", description: "An endpoint id starting with ep:" } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "list",
    description: "List all parts of one kind.",
    input_schema: { type: "object", properties: { kind: { enum: ["actions", "tables", "screens", "areas"] } }, required: ["kind"], additionalProperties: false },
  },
  {
    name: "read_page",
    description: "Read one saved documentation page by slug (see overview for the slugs). Use for setup commands, configuration and written summaries.",
    input_schema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"], additionalProperties: false },
  },
];

function whereOf(index, node) {
  const item = index.items.find((i) => i.id === node.id);
  if (item?.kind === "endpoint") return `${item.declaration.path}:${item.declaration.start_line}-${item.declaration.end_line}`;
  if (item) return `${item.path}:${item.start_line}-${item.end_line}`;
  const table = (index.project.tables ?? []).find((t) => t.id === node.id);
  if (table) return `${table.source.path}:${table.source.start_line}-${table.source.end_line}`;
  if (node.id.startsWith("mod:")) return node.id.slice(4);
  return null;
}

/** graph: graph/1 (with plain labels); index: persisted index; pages: [{slug,title,markdown}] */
export function makeToolbox({ graph, index, pages = [] }) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const pageBySlug = new Map(pages.map((p) => [p.slug, p]));
  const brief = (n) => ({ id: n.id, name: n.plain_label ?? n.label, code_name: n.label, kind: n.kind, what: n.plain_summary ?? null });
  const isScreen = (n) => n.layer === "frontend" && n.kind !== "module";

  function search({ query }) {
    const ws = words(query);
    if (ws.length === 0) return { results: [] };
    const scored = graph.nodes
      .filter((n) => n.kind !== "module" || ws.some((w) => norm(n.id).includes(w)))
      .map((n) => {
        const hay = [n.plain_label, n.label, n.plain_summary, n.id, n.group].map(norm).join(" ");
        let score = 0;
        for (const w of ws) {
          if (norm(n.plain_label).includes(w) || norm(n.label).includes(w)) score += 3;
          else if (hay.includes(w)) score += 1;
        }
        return { n, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.n.id.localeCompare(b.n.id))
      .slice(0, MAX_RESULTS);
    return { results: scored.map((x) => brief(x.n)) };
  }

  function describe({ id }) {
    const n = byId.get(id);
    if (!n) return { error: `No part with id ${id}. Use search or list to find ids.` };
    const item = index.items.find((i) => i.id === id);
    const out = graph.edges.filter((e) => e.from === id).map((e) => ({ relation: e.kind, operation: e.operation ?? null, to: brief(byId.get(e.to) ?? { id: e.to, label: e.to, kind: "unknown" }), evidence: e.evidence[0] ? `${e.evidence[0].path}:${e.evidence[0].start_line}` : null, inferred: e.inferred }));
    const inn = graph.edges.filter((e) => e.to === id).map((e) => ({ relation: e.kind, from: brief(byId.get(e.from) ?? { id: e.from, label: e.from, kind: "unknown" }), evidence: e.evidence[0] ? `${e.evidence[0].path}:${e.evidence[0].start_line}` : null, inferred: e.inferred }));
    return {
      ...brief(n),
      layer: n.layer,
      area: graph.groups.find((g) => g.id === n.group)?.name ?? null,
      where: whereOf(index, n),
      signature: item?.signature ?? null,
      doc: item?.doc ?? null,
      data: n.data ?? null,
      columns: (index.project.tables ?? []).find((t) => t.id === id)?.columns ?? null,
      calls_or_uses: out.slice(0, 15),
      used_by: inn.slice(0, 15),
    };
  }

  function followRequest({ id }) {
    if (!byId.has(id) || byId.get(id).kind !== "endpoint") return { error: "Not an action id. Use list with kind 'actions' or search." };
    return { steps: traceSteps(graph, id, true).map((s) => ({ step: s.n, kind: s.kind, title: s.title, what: s.text, data: s.chips.map((c) => c.text), code_name: s.technical, where: s.evidence, id: s.nodeId })) };
  }

  function list({ kind }) {
    if (kind === "actions") return { actions: endpointChoices(graph).map(brief) };
    if (kind === "tables") return { tables: graph.nodes.filter((n) => n.kind === "table").map(brief) };
    if (kind === "screens") return { screens: graph.nodes.filter(isScreen).map(brief) };
    if (kind === "areas") return { areas: graph.groups.map((g) => ({ ...g, parts: graph.nodes.filter((n) => n.group === g.id).length })) };
    return { error: "Unknown kind" };
  }

  function overview() {
    const count = (f) => graph.nodes.filter(f).length;
    return {
      counts: { actions: count((n) => n.kind === "endpoint"), tables: count((n) => n.kind === "table"), screens_and_front_end_functions: count(isScreen), files_on_map: count((n) => n.kind === "module") },
      areas: graph.groups.map((g) => ({ id: g.id, name: g.name, summary: g.summary })),
      workspaces: index.project.workspaces.map((w) => ({ folder: w.dir || ".", front_end: w.frontend, scripts: w.scripts, libraries: Object.keys(w.dependencies).slice(0, 12) })),
      environment_variables: index.project.env_vars.map((e) => e.id.replace(/^env:/, "")),
      pages: pages.map((p) => ({ slug: p.slug, title: p.title })),
      note: "Source files are not stored; answers come from parsed facts and the saved pages.",
    };
  }

  function readPage({ slug }) {
    const p = pageBySlug.get(slug);
    if (!p) return { error: `No page ${slug}. See overview for the slugs.` };
    return { slug: p.slug, title: p.title, text: p.markdown.length > MAX_PAGE_CHARS ? `${p.markdown.slice(0, MAX_PAGE_CHARS)}\n[cut]` : p.markdown };
  }

  const impl = { overview, search, describe, follow_request: followRequest, list, read_page: readPage };

  return {
    definitions: TOOL_DEFINITIONS,
    byId,
    /** Runs one tool call; always returns a redacted string (errors included) so a bad call never breaks the loop. */
    run(name, input) {
      try {
        const fn = impl[name];
        if (!fn) return JSON.stringify({ error: `Unknown tool ${name}` });
        return redactSecrets(JSON.stringify(fn(input ?? {})));
      } catch (err) {
        return JSON.stringify({ error: String(err.message).slice(0, 200) });
      }
    },
    /** Where a source id points on the map and in the code, for citation chips. */
    sourceInfo(id) {
      if (id.startsWith("page:")) {
        const p = pageBySlug.get(id.slice(5));
        return p ? { id, label: p.title, kind: "page", where: null } : null;
      }
      const n = byId.get(id);
      return n ? { id, label: n.plain_label ?? n.label, code_name: n.label, kind: n.kind, where: whereOf(index, n) } : null;
    },
  };
}

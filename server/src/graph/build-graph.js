import { humanizeName, endpointPlainLabel, tablePlainLabel, endpointPlainSummary } from "./plain.js";

// T27 (deterministic half): the repo map's graph, built only from Scanner
// facts so it cannot show a connection that is not in the code (§4f).
// Area grouping and labels by AI come later; every node here is real.

function layerForModule(path, workspaces) {
  let best = null;
  for (const w of workspaces) {
    const prefix = w.dir === "" ? "" : `${w.dir}/`;
    if (path.startsWith(prefix) && (best === null || prefix.length > best.prefix.length)) best = { prefix, frontend: w.frontend };
  }
  return best?.frontend ? "frontend" : "module";
}

/** Same segment count; a ":param" segment on either side matches anything. */
function pathsMatch(url, endpointPath) {
  const a = url.split("/").filter(Boolean);
  const b = endpointPath.split("/").filter(Boolean);
  return a.length === b.length && a.every((seg, i) => seg === b[i] || seg.startsWith(":") || b[i].startsWith(":"));
}

/** index: { items, imports, project } - the persisted shape (see load-index.js). */
export function buildGraph(index, { summaries = new Map() } = {}) {
  const itemsById = new Map(index.items.map((i) => [i.id, i]));
  const nodes = new Map();
  const edges = new Map();

  function addNode(node) {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  }
  function addEdge(edge) {
    const key = `${edge.from}|${edge.to}|${edge.kind}`;
    if (!edges.has(key)) edges.set(key, edge);
  }
  function moduleNode(path) {
    const id = `mod:${path}`;
    addNode({ id, kind: "module", layer: layerForModule(path, index.project.workspaces), label: path.split("/").pop() });
    return id;
  }
  function symbolNode(id, layer) {
    const item = itemsById.get(id);
    if (!item || item.kind === "endpoint") return null;
    // An anonymous default export has no name of its own; the module's file name identifies it.
    const name = item.name === "default" ? item.path.split("/").pop().replace(/\.[^.]+$/, "") : item.name;
    addNode({ id, kind: item.kind, layer, label: item.kind === "function" || item.kind === "method" ? `${name}()` : name });
    return id;
  }

  for (const item of index.items) {
    if (item.kind !== "endpoint") continue;
    addNode({ id: item.id, kind: "endpoint", layer: "route", label: `${item.method} ${item.path}` });
    const evidence = [{ path: item.declaration.path, start_line: item.declaration.start_line, end_line: item.declaration.end_line }];

    if (item.handler.symbol_id) {
      const handler = symbolNode(item.handler.symbol_id, "handler");
      if (handler) addEdge({ from: item.id, to: handler, kind: "routes_to", inferred: false, evidence });
    }
    for (const mw of item.middleware) {
      const target = symbolNode(mw, "middleware");
      if (target) addEdge({ from: item.id, to: target, kind: "uses_middleware", inferred: false, evidence });
    }
    for (const mount of item.mounts) {
      if (mount.path === item.declaration.path) continue;
      addEdge({
        from: moduleNode(mount.path),
        to: moduleNode(item.declaration.path),
        kind: "mounts",
        inferred: false,
        evidence: [{ path: mount.path, start_line: mount.start_line, end_line: mount.end_line }],
      });
    }
  }

  for (const imp of index.imports ?? []) {
    addEdge({
      from: moduleNode(imp.from),
      to: moduleNode(imp.to),
      kind: "imports",
      inferred: imp.line === undefined,
      evidence: imp.line === undefined ? [] : [{ path: imp.from, start_line: imp.line, end_line: imp.line }],
    });
  }

  for (const table of index.project.tables ?? []) {
    addNode({ id: table.id, kind: "table", layer: "database", label: table.id.replace(/^tbl:/, "") });
  }

  // T26 inferred edges (string matches, so always marked inferred).
  const tableIdByName = new Map((index.project.tables ?? []).map((t) => [t.id.replace(/^tbl:/, "").toLowerCase(), t.id]));
  const codeItems = index.items.filter((i) => i.kind !== "endpoint");
  function callerNode(path, line, layer) {
    let enclosing = null;
    for (const item of codeItems) {
      if (item.path === path && item.start_line <= line && line <= item.end_line && (item.kind === "function" || item.kind === "method" || item.kind === "class")) {
        if (!enclosing || item.end_line - item.start_line < enclosing.end_line - enclosing.start_line) enclosing = item;
      }
    }
    return enclosing ? symbolNode(enclosing.id, layer) : moduleNode(path);
  }

  for (const q of index.graph_facts?.queries_table ?? []) {
    const tableId = tableIdByName.get(q.table);
    if (!tableId) continue;
    // SQL inside an endpoint's own inline handler belongs to that endpoint; otherwise to the enclosing function or file.
    let owner = null;
    for (const ep of index.items) {
      if (ep.kind !== "endpoint" || !("inline" in ep.handler)) continue;
      const d = ep.declaration;
      if (d.path === q.path && d.start_line <= q.line && q.line <= d.end_line && (!owner || d.end_line - d.start_line < owner.declaration.end_line - owner.declaration.start_line)) owner = ep;
    }
    addEdge({ from: owner ? owner.id : callerNode(q.path, q.line, "handler"), to: tableId, kind: "queries_table", inferred: true, operation: q.operation, columns: q.columns, evidence: [{ path: q.path, start_line: q.line, end_line: q.line }] });
  }

  const endpoints = index.items.filter((i) => i.kind === "endpoint" && i.resolved);
  for (const call of index.graph_facts?.calls_endpoint ?? []) {
    for (const ep of endpoints) {
      if (!pathsMatch(call.url, ep.path) || (call.method !== null && call.method !== ep.method && ep.method !== "ALL")) continue;
      addEdge({ from: callerNode(call.path, call.line, "frontend"), to: ep.id, kind: "calls_endpoint", inferred: true, evidence: [{ path: call.path, start_line: call.line, end_line: call.line }] });
    }
  }

  // Function-to-function calls, resolved through real imports by the Scanner.
  const frontendDirs = index.project.workspaces.filter((w) => w.frontend).map((w) => (w.dir === "" ? "" : `${w.dir}/`));
  const isFrontendPath = (p) => frontendDirs.some((d) => p.startsWith(d));
  for (const c of index.graph_facts?.calls ?? []) {
    const fromItem = itemsById.get(c.from);
    const toItem = itemsById.get(c.to);
    if (!fromItem || !toItem) continue;
    const from = symbolNode(c.from, isFrontendPath(fromItem.path) ? "frontend" : "handler");
    const to = symbolNode(c.to, isFrontendPath(toItem.path) ? "frontend" : "handler");
    if (from && to) addEdge({ from, to, kind: "calls", inferred: false, evidence: [{ path: c.path, start_line: c.line, end_line: c.line }] });
  }

  attachEndpointData(index, [...nodes.values()], [...edges.values()], itemsById);
  addPlainLanguage([...nodes.values()], index, itemsById, summaries);

  return { schema_version: "graph/1", nodes: [...nodes.values()], edges: [...edges.values()], groups: [] };
}

/** Code ranges whose data belongs to an endpoint: its inline handler or named handler, plus what that handler calls (two hops). */
function rangesForEndpoint(ep, edges, itemsById) {
  const ranges = [];
  if ("inline" in ep.handler) ranges.push({ path: ep.declaration.path, start: ep.declaration.start_line, end: ep.declaration.end_line });
  const frontier = [];
  if (ep.handler.symbol_id) frontier.push(ep.handler.symbol_id);
  const seen = new Set(frontier);
  for (let depth = 0; depth < 3 && frontier.length; depth += 1) {
    const next = [];
    for (const id of frontier) {
      const it = itemsById.get(id);
      if (it) ranges.push({ path: it.path, start: it.start_line, end: it.end_line });
      for (const e of edges) if (e.kind === "calls" && e.from === id && !seen.has(e.to)) { seen.add(e.to); next.push(e.to); }
    }
    frontier.splice(0, frontier.length, ...next);
  }
  return ranges;
}

/** What goes into an endpoint, what comes out, and which tables it reads and writes. */
function attachEndpointData(index, nodeList, edges, itemsById) {
  const facts = index.graph_facts ?? {};
  const inRange = (ranges, f) => ranges.some((r) => r.path === f.path && r.start <= f.line && f.line <= r.end);
  const tableNames = new Map((index.project.tables ?? []).map((t) => [t.id.replace(/^tbl:/, "").toLowerCase(), t.id.replace(/^tbl:/, "")]));
  for (const node of nodeList) {
    if (node.kind !== "endpoint") continue;
    const ep = itemsById.get(node.id);
    const ranges = rangesForEndpoint(ep, edges, itemsById);
    const merge = (ops) => {
      const byTable = new Map();
      for (const q of ops) {
        const t = tableNames.get(q.table) ?? q.table;
        const cur = byTable.get(t) ?? new Set();
        for (const c of q.columns ?? []) cur.add(c);
        byTable.set(t, cur);
      }
      return [...byTable].map(([table, cols]) => ({ table, columns: [...cols] }));
    };
    const queries = (facts.queries_table ?? []).filter((q) => inRange(ranges, q));
    node.data = {
      inputs: dedupe((facts.inputs ?? []).filter((f) => inRange(ranges, f)).map((f) => ({ source: f.source, name: f.name }))),
      outputs: dedupe((facts.outputs ?? []).filter((f) => inRange(ranges, f)).map((f) => ({ status: f.status, message: f.message, keys: f.keys }))),
      reads: merge(queries.filter((q) => q.operation === "read")),
      writes: merge(queries.filter((q) => q.operation === "write")),
    };
  }
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((x) => (seen.has(JSON.stringify(x)) ? false : (seen.add(JSON.stringify(x)), true)));
}

/** Plain-English label and sentence for every node, from names and parser facts (and the Analyst's sentence for functions). */
function addPlainLanguage(nodeList, index, itemsById, summaries) {
  const tableById = new Map((index.project.tables ?? []).map((t) => [t.id, t]));
  for (const node of nodeList) {
    if (node.kind === "endpoint") {
      const ep = itemsById.get(node.id);
      node.plain_label = endpointPlainLabel(ep.method, ep.path);
      const sentence = endpointPlainSummary(node.data);
      if (sentence) node.plain_summary = sentence;
    } else if (node.kind === "table") {
      node.plain_label = tablePlainLabel(node.label);
      const t = tableById.get(node.id);
      if (t?.columns?.length) node.plain_summary = `Where the app keeps its ${node.label} records. Each one has: ${t.columns.map((c) => c.name).join(", ")}.`;
    } else if (node.kind === "module") {
      node.plain_label = `${humanizeName(node.label)} file`;
    } else {
      const item = itemsById.get(node.id);
      const name = item?.name === "default" ? item.path.split("/").pop() : (item?.name ?? node.label).replace(/\(\)$/, "");
      node.plain_label = item?.kind === "method" && name.includes(".") ? `${humanizeName(name.split(".").pop())} (${humanizeName(name.split(".")[0]).toLowerCase()})` : humanizeName(name);
      const said = summaries.get(node.id) ?? item?.doc ?? null;
      if (said) node.plain_summary = said;
    }
  }
}

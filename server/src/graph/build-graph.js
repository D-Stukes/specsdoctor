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
export function buildGraph(index) {
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
    addEdge({ from: owner ? owner.id : callerNode(q.path, q.line, "handler"), to: tableId, kind: "queries_table", inferred: true, evidence: [{ path: q.path, start_line: q.line, end_line: q.line }] });
  }

  const endpoints = index.items.filter((i) => i.kind === "endpoint" && i.resolved);
  for (const call of index.graph_facts?.calls_endpoint ?? []) {
    for (const ep of endpoints) {
      if (!pathsMatch(call.url, ep.path) || (call.method !== null && call.method !== ep.method && ep.method !== "ALL")) continue;
      addEdge({ from: callerNode(call.path, call.line, "frontend"), to: ep.id, kind: "calls_endpoint", inferred: true, evidence: [{ path: call.path, start_line: call.line, end_line: call.line }] });
    }
  }

  return { schema_version: "graph/1", nodes: [...nodes.values()], edges: [...edges.values()], groups: [] };
}

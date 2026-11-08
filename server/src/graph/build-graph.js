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
    addNode({ id, kind: item.kind, layer, label: item.kind === "function" || item.kind === "method" ? `${item.name}()` : item.name });
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

  return { schema_version: "graph/1", nodes: [...nodes.values()], edges: [...edges.values()], groups: [] };
}

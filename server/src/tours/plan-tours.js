// Task 11 (§4f): the tour's skeleton is chosen by code from the graph, so every
// stop is a node that exists and every via_edge is an edge that exists. The
// model (tour-agent.js) only writes the words for each numbered stop.

const MAX_STOPS = 8;
const MIN_STOPS = 2;
const LAYER_RANK = { frontend: 0, route: 1, middleware: 2, handler: 3, database: 4, module: 5 };

function degree(graph) {
  const d = new Map();
  for (const e of graph.edges) {
    d.set(e.from, (d.get(e.from) ?? 0) + 1);
    d.set(e.to, (d.get(e.to) ?? 0) + 1);
  }
  return d;
}

function makeHelpers(graph, index) {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const itemById = new Map(index.items.map((i) => [i.id, i]));
  const tableById = new Map((index.project.tables ?? []).map((t) => [t.id, t]));
  const edgeOut = new Map();
  const edgeIn = new Map();
  for (const e of graph.edges) {
    if (!edgeOut.has(e.from)) edgeOut.set(e.from, []);
    edgeOut.get(e.from).push(e);
    if (!edgeIn.has(e.to)) edgeIn.set(e.to, []);
    edgeIn.get(e.to).push(e);
  }
  const out = (id, kind) => (edgeOut.get(id) ?? []).filter((e) => !kind || e.kind === kind);
  const inn = (id, kind) => (edgeIn.get(id) ?? []).filter((e) => !kind || e.kind === kind);

  function evidenceFor(nodeId) {
    const item = itemById.get(nodeId);
    if (item?.kind === "endpoint") return [{ path: item.declaration.path, start_line: item.declaration.start_line, end_line: item.declaration.end_line }];
    if (item) return [{ path: item.path, start_line: item.start_line, end_line: item.end_line }];
    const table = tableById.get(nodeId);
    if (table) return [{ path: table.source.path, start_line: table.source.start_line, end_line: table.source.end_line }];
    if (nodeId.startsWith("mod:")) {
      // A file has no line range of its own; cite the first line where it mounts or imports something.
      const first = [...out(nodeId, "mounts"), ...out(nodeId, "imports")].find((e) => e.evidence.length > 0);
      return first ? [first.evidence[0]] : [];
    }
    return [];
  }

  function stop(nodeId, role, from = null) {
    const edge = from ? graph.edges.find((e) => (e.from === from && e.to === nodeId) || (e.from === nodeId && e.to === from)) : null;
    return { node_id: nodeId, via_edge: edge ? [edge.from, edge.to] : null, role, evidence: edge && edge.evidence.length > 0 && !evidenceFor(nodeId).length ? [edge.evidence[0]] : evidenceFor(nodeId) };
  }

  return { nodeById, itemById, out, inn, evidenceFor, stop };
}

function followRequest(graph, h) {
  const endpoints = graph.nodes.filter((n) => n.kind === "endpoint");
  if (endpoints.length === 0) return null;
  const tablesOf = (ep) => {
    const direct = h.out(ep.id, "queries_table").map((e) => e.to);
    const viaHandler = h.out(ep.id, "routes_to").flatMap((r) => h.out(r.to, "queries_table").map((e) => e.to));
    return [...new Set([...direct, ...viaHandler])].sort();
  };
  // Deterministic pick (spec): most handler-to-table edges, ties broken by id.
  const best = [...endpoints].sort((a, b) => tablesOf(b).length - tablesOf(a).length || a.id.localeCompare(b.id))[0];

  const stops = [];
  const caller = h.inn(best.id, "calls_endpoint").map((e) => e.from).sort()[0];
  if (caller) stops.push(h.stop(caller, "The screen or function that sends the request"));
  stops.push(h.stop(best.id, "The endpoint that receives the request", caller ?? null));
  for (const e of h.out(best.id, "uses_middleware")) stops.push(h.stop(e.to, "Middleware that runs before the handler", best.id));
  let last = best.id;
  for (const e of h.out(best.id, "routes_to")) {
    stops.push(h.stop(e.to, "The handler that does the work", best.id));
    last = e.to;
  }
  for (const t of tablesOf(best).slice(0, 3)) stops.push(h.stop(t, "A table the request reads or writes", h.out(last, "queries_table").some((e) => e.to === t) ? last : best.id));
  return { tour_id: "follow-request", title_hint: `Follow a request: ${h.nodeById.get(best.id).label}`, stops: stops.slice(0, MAX_STOPS) };
}

function dataStorage(graph, h) {
  const tables = graph.nodes.filter((n) => n.kind === "table");
  if (tables.length === 0) return null;
  const queriers = (t) => [...new Set(h.inn(t.id, "queries_table").map((e) => e.from))].sort();
  const ordered = [...tables].sort((a, b) => queriers(b).length - queriers(a).length || a.id.localeCompare(b.id));
  const stops = [];
  for (const t of ordered) {
    if (stops.length >= MAX_STOPS) break;
    stops.push(h.stop(t.id, "A table where the app keeps data"));
    for (const q of queriers(t).slice(0, 2)) {
      if (stops.length >= MAX_STOPS) break;
      stops.push(h.stop(q, "Code that reads or writes this table", t.id));
    }
  }
  return { tour_id: "data-storage", title_hint: "How data is stored", stops };
}

function bigPicture(graph, h) {
  const deg = degree(graph);
  const stops = [];
  const byGroup = new Map();
  for (const n of graph.nodes) {
    if (!n.group) continue;
    if (!byGroup.has(n.group)) byGroup.set(n.group, []);
    byGroup.get(n.group).push(n);
  }
  if (byGroup.size >= 2) {
    const reps = [...byGroup.entries()].map(([gid, nodes]) => {
      const rep = [...nodes].sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0) || a.id.localeCompare(b.id))[0];
      // Order areas front to back by their representative node's layer, so the walk reads client, server, data.
      const layerRank = LAYER_RANK[rep.layer] ?? 5;
      return { gid, rep, layerRank, group: graph.groups.find((g) => g.id === gid) };
    });
    reps.sort((a, b) => a.layerRank - b.layerRank || a.group.name.localeCompare(b.group.name));
    let prev = null;
    for (const r of reps.slice(0, MAX_STOPS)) {
      const s = h.stop(r.rep.id, `The "${r.group.name}" area: ${r.group.summary}`, prev);
      stops.push(s);
      prev = r.rep.id;
    }
  } else {
    // No areas: one stop per layer, best-connected node in each.
    let prev = null;
    for (const layer of ["frontend", "route", "middleware", "handler", "database"]) {
      const nodes = graph.nodes.filter((n) => n.layer === layer && n.kind !== "module");
      if (nodes.length === 0) continue;
      const rep = [...nodes].sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0) || a.id.localeCompare(b.id))[0];
      stops.push(h.stop(rep.id, `The ${layer} layer of the app`, prev));
      prev = rep.id;
    }
  }
  return { tour_id: "big-picture", title_hint: "The big picture", stops: stops.slice(0, MAX_STOPS) };
}

function startHere(graph, h) {
  const deg = degree(graph);
  const modules = graph.nodes.filter((n) => n.kind === "module");
  const stops = [];

  const mountSources = modules.filter((m) => h.out(m.id, "mounts").length > 0 && h.inn(m.id, "mounts").length === 0).sort((a, b) => h.out(b.id, "mounts").length - h.out(a.id, "mounts").length || a.id.localeCompare(b.id));
  if (mountSources[0]) stops.push(h.stop(mountSources[0].id, "The server's entry point: where the routers are mounted"));

  const frontendRoots = modules
    .filter((m) => m.layer === "frontend" && h.inn(m.id, "imports").length > 0 === false && h.out(m.id, "imports").length > 0)
    .sort((a, b) => h.out(b.id, "imports").length - h.out(a.id, "imports").length || a.id.localeCompare(b.id));
  const appRoot = frontendRoots.find((m) => /app\./i.test(m.label)) ?? frontendRoots[0];
  const frontendEntry = appRoot ?? modules.filter((m) => m.layer === "frontend").sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0) || a.id.localeCompare(b.id))[0];
  if (frontendEntry) stops.push(h.stop(frontendEntry.id, "The front end's entry point"));

  const topEndpoint = graph.nodes.filter((n) => n.kind === "endpoint").sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0) || a.id.localeCompare(b.id))[0];
  if (topEndpoint) stops.push(h.stop(topEndpoint.id, "The busiest endpoint: a good one to read first"));

  const topTable = graph.nodes.filter((n) => n.kind === "table").sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0) || a.id.localeCompare(b.id))[0];
  if (topTable) stops.push(h.stop(topTable.id, "The most-used table: the shape of the data"));

  return { tour_id: "start-here", title_hint: "Where to start", stops };
}

/** Up to four tour plans; a tour with fewer than two stops is left out (small repos). */
export function planTours(graph, index) {
  const h = makeHelpers(graph, index);
  return [bigPicture(graph, h), followRequest(graph, h), dataStorage(graph, h), startHere(graph, h)]
    .filter((p) => p && p.stops.length >= MIN_STOPS)
    .map((p) => ({ ...p, stops: dedupeStops(p.stops) }))
    .filter((p) => p.stops.length >= MIN_STOPS)
    .map((p) => ({ ...p, labels: Object.fromEntries(p.stops.map((s) => [s.node_id, h.nodeById.get(s.node_id)?.label ?? s.node_id])) }));
}

function dedupeStops(stops) {
  const seen = new Set();
  return stops.filter((s) => (seen.has(s.node_id) ? false : (seen.add(s.node_id), true)));
}

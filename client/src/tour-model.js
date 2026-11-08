// Pure helpers for the tour player (no React), so they can be tested under Node.

/** The stops, plus up to two connected neighbours each for context, and every edge between those nodes. */
export function tourSubgraph(graph, tour) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const stopIds = tour.stops.map((s) => s.node_id).filter((id) => byId.has(id));
  const keep = new Set(stopIds);
  for (const id of stopIds) {
    const neighbours = graph.edges
      .filter((e) => e.from === id || e.to === id)
      .map((e) => (e.from === id ? e.to : e.from))
      .filter((n) => !keep.has(n) && byId.has(n))
      .sort();
    for (const n of [...new Set(neighbours)].slice(0, 2)) keep.add(n);
  }
  const nodes = [...keep].map((id) => byId.get(id));
  const edges = graph.edges.filter((e) => keep.has(e.from) && keep.has(e.to));
  return { nodes, edges, stopIds: new Set(stopIds) };
}

/** Edges the tour walks along (stop.via_edge), as "from|to" keys. */
export function walkedEdgeKeys(tour) {
  return new Set(tour.stops.filter((s) => s.via_edge).map((s) => `${s.via_edge[0]}|${s.via_edge[1]}`));
}

/** How long to keep a stop on screen when nobody is speaking it: reading time, at least 2.5 s, scaled by speed. */
export function readingMs(text, speed) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2500, words * 380) / speed;
}

/** Layered columns only make sense when most nodes belong to a map layer; file-level tours use a free layout. */
export function layoutKindFor(nodes) {
  const layered = nodes.filter((n) => ["frontend", "route", "middleware", "handler", "database"].includes(n.layer) && n.kind !== "module").length;
  return layered * 2 >= nodes.length ? "architecture" : "dependencies";
}

export function stepIndex(current, delta, count) {
  return Math.min(count - 1, Math.max(0, current + delta));
}

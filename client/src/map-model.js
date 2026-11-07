// Pure graph shaping for the repo map (no React), so it can be tested under Node.

export const LAYER_ORDER = ["frontend", "route", "middleware", "handler", "database"];
export const ARCH_KINDS = new Set(["routes_to", "uses_middleware", "calls_endpoint", "queries_table"]);
export const DEP_KINDS = new Set(["imports", "mounts"]);
export const COLLAPSE_ABOVE = 300;

export function subgraphFor(graph, view, traceEndpoint) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  let kinds;
  let keepIds;

  if (view === "dependencies") {
    kinds = DEP_KINDS;
    keepIds = new Set(graph.nodes.filter((n) => n.kind === "module").map((n) => n.id));
  } else if (view === "trace") {
    kinds = ARCH_KINDS;
    keepIds = new Set();
    if (traceEndpoint) {
      keepIds.add(traceEndpoint);
      const forward = [];
      for (const e of graph.edges) {
        if (e.kind === "calls_endpoint" && e.to === traceEndpoint) keepIds.add(e.from);
        if ((e.kind === "routes_to" || e.kind === "uses_middleware") && e.from === traceEndpoint) {
          keepIds.add(e.to);
          forward.push(e.to);
        }
      }
      for (const e of graph.edges) {
        if (e.kind === "queries_table" && (e.from === traceEndpoint || forward.includes(e.from))) keepIds.add(e.to);
      }
    }
  } else {
    kinds = ARCH_KINDS;
    keepIds = new Set(graph.nodes.filter((n) => n.kind !== "module" && LAYER_ORDER.includes(n.layer)).map((n) => n.id));
    for (const e of graph.edges) {
      if (!kinds.has(e.kind)) continue;
      if (byId.get(e.from)?.kind === "module") keepIds.add(e.from);
      if (byId.get(e.to)?.kind === "module") keepIds.add(e.to);
    }
  }

  const edges = graph.edges.filter((e) => kinds.has(e.kind) && keepIds.has(e.from) && keepIds.has(e.to));
  return { nodes: [...keepIds].map((id) => byId.get(id)).filter(Boolean), edges };
}

/**
 * Replaces every area's member nodes with one node per area, except areas in
 * `expanded`. Edges between collapsed areas are merged ("3 links"), dropped
 * when both ends fall in the same area, and are `inferred` only if every
 * merged edge is. Nodes without an area stay as they are.
 */
export function collapseByGroup(sub, groups, expanded = new Set()) {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const collapsedOf = (node) => (node.group && groupById.has(node.group) && !expanded.has(node.group) ? node.group : null);

  const memberCount = new Map();
  const layerVotes = new Map();
  const nodeToId = new Map();
  const nodes = [];
  for (const n of sub.nodes) {
    const g = collapsedOf(n);
    if (!g) {
      nodes.push(n);
      nodeToId.set(n.id, n.id);
      continue;
    }
    const id = `group:${g}`;
    nodeToId.set(n.id, id);
    memberCount.set(g, (memberCount.get(g) ?? 0) + 1);
    const votes = layerVotes.get(g) ?? new Map();
    votes.set(n.layer, (votes.get(n.layer) ?? 0) + 1);
    layerVotes.set(g, votes);
  }
  for (const [g, count] of memberCount) {
    const layer = [...layerVotes.get(g).entries()].sort((a, b) => b[1] - a[1])[0][0];
    nodes.push({ id: `group:${g}`, kind: "group", layer, label: `${groupById.get(g).name} (${count})`, group: g });
  }

  const merged = new Map();
  for (const e of sub.edges) {
    const from = nodeToId.get(e.from);
    const to = nodeToId.get(e.to);
    if (!from || !to || from === to) continue;
    const key = `${from}|${to}`;
    const entry = merged.get(key) ?? { from, to, count: 0, allInferred: true, kinds: new Set(), first: e };
    entry.count += 1;
    entry.allInferred = entry.allInferred && e.inferred;
    entry.kinds.add(e.kind);
    merged.set(key, entry);
  }
  const edges = [...merged.values()].map((m) => {
    const grouped = m.from.startsWith("group:") || m.to.startsWith("group:");
    if (!grouped) return m.first;
    return { from: m.from, to: m.to, kind: m.count === 1 ? m.first.kind : "grouped", label: m.count === 1 ? undefined : `${m.count} links`, inferred: m.allInferred, evidence: m.count === 1 ? m.first.evidence : [] };
  });
  return { nodes, edges };
}

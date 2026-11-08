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

// --- plain-English flow (Plain English toggle, Functions view, Follow the data) ---

const PLAIN_EDGE = { calls_endpoint: "asks", routes_to: "handled by", uses_middleware: "checked by", calls: "uses", imports: "uses file", mounts: "connects" };

/** Edge text: plain words for everyone, or the technical kind name. */
export function edgeLabel(edge, plain) {
  if (edge.label) return edge.label;
  if (edge.kind === "queries_table") return plain ? (edge.operation === "write" ? "saves to" : "looks up") : edge.kind.replace(/_/g, " ");
  return plain ? (PLAIN_EDGE[edge.kind] ?? edge.kind) : edge.kind.replace(/_/g, " ");
}

export function nodeTitle(node, plain) {
  return plain ? (node.plain_label ?? node.label) : node.label;
}

/** Functions view: functions, the endpoints they serve or ask, and the call edges between them. */
export function functionsSubgraph(graph) {
  const kinds = new Set(["calls", "routes_to", "calls_endpoint"]);
  const edges = graph.edges.filter((e) => kinds.has(e.kind));
  const ids = new Set(edges.flatMap((e) => [e.from, e.to]));
  return { nodes: graph.nodes.filter((n) => ids.has(n.id)), edges };
}

const listText = (xs) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/**
 * "Follow the data": the story of one endpoint as numbered, plain-English steps: who asks, what the
 * server checks, which functions do the work, what is read or saved, and what comes back.
 */
export function traceSteps(graph, endpointId, plain = true) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const ep = byId.get(endpointId);
  if (!ep) return [];
  const out = (id, kind) => graph.edges.filter((e) => e.from === id && (!kind || e.kind === kind));
  const inn = (id, kind) => graph.edges.filter((e) => e.to === id && (!kind || e.kind === kind));
  const steps = [];
  const seen = new Set();
  const ev = (e) => (e?.evidence?.[0] ? `${e.evidence[0].path}:${e.evidence[0].start_line}` : null);
  const technical = (n) => (plain ? n.label : null);
  const push = (step) => steps.push({ ...step, n: steps.length + 1 });
  const data = ep.data ?? { inputs: [], outputs: [], reads: [], writes: [] };

  // 1. Who asks: a function that calls this endpoint, and what calls that.
  const askEdge = inn(ep.id, "calls_endpoint").sort((a, b) => a.from.localeCompare(b.from))[0];
  if (askEdge) {
    const asker = byId.get(askEdge.from);
    const upper = inn(asker.id, "calls").map((e) => byId.get(e.from)).filter(Boolean).sort((a, b) => a.id.localeCompare(b.id))[0];
    if (upper) {
      seen.add(upper.id);
      push({ kind: "caller", nodeId: upper.id, title: nodeTitle(upper, plain), text: upper.plain_summary ?? "A screen in the app.", technical: technical(upper), evidence: ev(inn(asker.id, "calls")[0]), chips: [] });
    }
    seen.add(asker.id);
    push({ kind: "caller", nodeId: asker.id, title: nodeTitle(asker, plain), text: asker.plain_summary ?? "Sends the request to the app's server.", technical: technical(asker), evidence: ev(askEdge), chips: [] });
  }

  // 2. The request arrives, with the data that comes in.
  const inputNames = [...new Set(data.inputs.map((i) => i.name))];
  push({
    kind: "entry",
    nodeId: ep.id,
    title: nodeTitle(ep, plain),
    text: askEdge ? "The request arrives at the app's server." : "A request like this arrives at the app's server.",
    technical: technical(ep),
    evidence: ep.id.includes("@") ? ep.id.slice(ep.id.lastIndexOf("@") + 1) : null,
    chips: inputNames.map((name) => ({ kind: "in", text: `in: ${name}` })),
  });

  // 3. Checks before the work.
  for (const e of out(ep.id, "uses_middleware")) {
    const mw = byId.get(e.to);
    if (!mw || seen.has(mw.id)) continue;
    seen.add(mw.id);
    push({ kind: "check", nodeId: mw.id, title: nodeTitle(mw, plain), text: mw.plain_summary ?? "A check that runs before the work starts.", technical: technical(mw), evidence: ev(e), chips: [] });
  }

  // 4. The functions that do the work, in the order they call each other.
  const walk = (id, depth) => {
    if (depth > 3) return;
    for (const e of out(id).filter((x) => x.kind === "routes_to" || x.kind === "calls")) {
      const fn = byId.get(e.to);
      if (!fn || seen.has(fn.id)) continue;
      seen.add(fn.id);
      push({ kind: "work", nodeId: fn.id, title: nodeTitle(fn, plain), text: fn.plain_summary ?? "Does part of the work.", technical: technical(fn), evidence: ev(e), chips: [] });
      walk(fn.id, depth + 1);
    }
  };
  walk(ep.id, 0);

  // 5. What is read from or saved to the database.
  const columnsOf = (cols) => (cols.length && !cols.includes("*") ? ` (${cols.join(", ")})` : "");
  for (const r of data.reads) {
    const table = graph.nodes.find((n) => n.kind === "table" && n.label === r.table);
    push({ kind: "read", nodeId: table?.id ?? null, title: `Look up ${table ? nodeTitle(table, plain).replace(/ \(saved data\)$/, "") : r.table}`, text: `Reads what is already saved in ${r.table}.`, technical: plain ? r.table : null, evidence: null, chips: [{ kind: "read", text: `reads: ${r.table}${columnsOf(r.columns)}` }] });
  }
  for (const w of data.writes) {
    const table = graph.nodes.find((n) => n.kind === "table" && n.label === w.table);
    push({ kind: "write", nodeId: table?.id ?? null, title: `Save to ${table ? nodeTitle(table, plain).replace(/ \(saved data\)$/, "") : w.table}`, text: `Stores new information in ${w.table}.`, technical: plain ? w.table : null, evidence: null, chips: [{ kind: "write", text: `saves: ${w.table}${columnsOf(w.columns)}` }] });
  }

  // 6. What comes back.
  if (data.outputs.length) {
    const good = data.outputs.filter((o) => o.status === null || (o.status >= 200 && o.status < 300));
    const bad = data.outputs.filter((o) => o.status !== null && o.status >= 400);
    const chips = [
      ...good.map((o) => ({ kind: "out", text: `back: ${o.keys?.length ? listText(o.keys) : "the result"}${o.status ? ` (${o.status})` : ""}` })),
      ...bad.map((o) => ({ kind: "bad", text: `problem${o.status ? ` (${o.status})` : ""}: ${o.message ?? "an error"}` })),
    ];
    push({ kind: "reply", nodeId: ep.id, title: "The answer goes back", text: good.length ? "The app's server sends the result back to where the request came from." : "The app's server answers.", technical: null, evidence: null, chips });
  }
  return steps;
}

/** Endpoints worth tracing, busiest first (most steps of data and calls behind them). */
export function endpointChoices(graph) {
  const weight = (n) => (n.data ? n.data.inputs.length + n.data.reads.length * 2 + n.data.writes.length * 2 + n.data.outputs.length : 0) + graph.edges.filter((e) => e.from === n.id).length;
  return graph.nodes.filter((n) => n.kind === "endpoint").sort((a, b) => weight(b) - weight(a) || a.id.localeCompare(b.id));
}

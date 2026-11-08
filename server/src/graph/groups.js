// Repo map areas (§4f): the Grouper names areas ("Auth", "Habits") and says
// which nodes belong; code decides what is allowed. The AI never creates a
// node or edge, only assigns existing node ids to named areas.

function nodePath(node) {
  if (node.id.startsWith("mod:")) return node.id.slice(4);
  if (node.id.startsWith("sym:")) return node.id.slice(4).split("#")[0];
  if (node.id.startsWith("ep:")) return node.id.slice(node.id.lastIndexOf("@") + 1).replace(/:\d+$/, "");
  return null;
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "area";
}

/** Deterministic fallback (and stub-mode answer): one area per folder, tables together. */
export function groupByFolder(graph) {
  const byId = new Map();
  for (const node of graph.nodes) {
    if (node.kind === "table") {
      if (!byId.has("database")) byId.set("database", { id: "database", name: "Database", summary: "Tables found in the schema files.", members: [] });
      byId.get("database").members.push(node.id);
      continue;
    }
    const p = nodePath(node);
    if (!p) continue;
    const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "(root)";
    const id = slug(dir);
    if (!byId.has(id)) byId.set(id, { id, name: dir, summary: `Files in ${dir}.`, members: [] });
    byId.get(id).members.push(node.id);
  }
  return [...byId.values()];
}

/**
 * Keeps only what is true of the graph: unknown member ids are dropped, a node
 * belongs to at most one area (first wins), unique ids, no empty areas.
 */
export function validateGroups(parsedGroups, graph) {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const assigned = new Set();
  const usedIds = new Set();
  const out = [];
  let dropped = 0;
  for (const g of parsedGroups) {
    const members = [];
    for (const m of g.members) {
      if (!nodeIds.has(m) || assigned.has(m)) {
        dropped += 1;
        continue;
      }
      assigned.add(m);
      members.push(m);
    }
    if (members.length === 0 || !g.name.trim()) continue;
    let id = slug(g.id || g.name);
    for (let n = 2; usedIds.has(id); n += 1) id = `${slug(g.id || g.name)}-${n}`;
    usedIds.add(id);
    out.push({ id, name: g.name.trim(), summary: g.summary.trim(), members });
  }
  return { groups: out, droppedMembers: dropped };
}

/** Sets node.group and the graph's groups array from a validated grouping. */
export function applyGroups(graph, groups) {
  const groupOf = new Map();
  for (const g of groups) for (const m of g.members) groupOf.set(m, g.id);
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (groupOf.has(n.id) ? { ...n, group: groupOf.get(n.id) } : n)),
    groups: groups.map(({ id, name, summary }) => ({ id, name, summary })),
  };
}

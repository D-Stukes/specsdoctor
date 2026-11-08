import ELK from "elkjs/lib/elk.bundled.js";
import { LAYER_ORDER } from "./map-model.js";

const elk = new ELK();

export const NODE_W = 260;
export const NODE_H = 42;

export const LAYER_COLOR = {
  frontend: "var(--periwinkle)",
  route: "var(--mint)",
  middleware: "var(--amber)",
  handler: "var(--text)",
  database: "var(--status-ok)",
  module: "var(--text-secondary)",
  group: "var(--text-secondary)",
};

export async function layout(nodes, edges, view) {
  const layered = view !== "dependencies";
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "22",
      "elk.layered.spacing.nodeNodeBetweenLayers": "70",
      ...(layered ? { "elk.partitioning.activate": "true" } : {}),
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: NODE_W,
      height: NODE_H,
      ...(layered ? { layoutOptions: { "elk.partitioning.partition": String(Math.max(0, LAYER_ORDER.indexOf(n.layer))) } } : {}),
    })),
    edges: edges.map((e, i) => ({ id: `e${i}`, sources: [e.from], targets: [e.to] })),
  };
  const out = await elk.layout(graph);
  return new Map(out.children.map((c) => [c.id, { x: c.x, y: c.y }]));
}


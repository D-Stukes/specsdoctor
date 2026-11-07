import { useEffect, useMemo, useState, useCallback } from "react";
import { ReactFlow, MiniMap, Controls, Background, MarkerType } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import "@xyflow/react/dist/style.css";

const elk = new ELK();

const NODE_W = 260;
const NODE_H = 42;

const LAYER_ORDER = ["frontend", "route", "middleware", "handler", "database"];
const LAYER_COLOR = {
  frontend: "var(--periwinkle)",
  route: "var(--mint)",
  middleware: "var(--amber)",
  handler: "var(--text)",
  database: "var(--status-ok)",
  module: "var(--text-secondary)",
};
const ARCH_KINDS = new Set(["routes_to", "uses_middleware", "calls_endpoint", "queries_table"]);
const DEP_KINDS = new Set(["imports", "mounts"]);

const VIEWS = [
  { id: "architecture", label: "Architecture" },
  { id: "trace", label: "Request trace" },
  { id: "dependencies", label: "Dependencies" },
];

function subgraphFor(graph, view, traceEndpoint) {
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
      const queue = [];
      for (const e of graph.edges) {
        if (!kinds.has(e.kind)) continue;
        if (e.kind === "calls_endpoint" && e.to === traceEndpoint) keepIds.add(e.from);
        if ((e.kind === "routes_to" || e.kind === "uses_middleware") && e.from === traceEndpoint) {
          keepIds.add(e.to);
          queue.push(e.to);
        }
      }
      for (const e of graph.edges) {
        if (e.kind === "queries_table" && (e.from === traceEndpoint || queue.includes(e.from))) keepIds.add(e.to);
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

async function layout(nodes, edges, view) {
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

function pageSlugFor(node) {
  if (node.id.startsWith("ep:")) return "api-endpoints";
  const path = node.id.startsWith("mod:") ? node.id.slice(4) : node.id.startsWith("sym:") ? node.id.slice(4).split("#")[0] : null;
  return path ? path.replace(/\.[^./]+$/, "").replace(/\//g, "-") : null;
}

export default function MapView({ runId, graph, onBack, onOpenPage }) {
  const [view, setView] = useState("architecture");
  const [traceEndpoint, setTraceEndpoint] = useState(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [positions, setPositions] = useState(null);

  const endpoints = useMemo(() => graph.nodes.filter((n) => n.kind === "endpoint"), [graph]);
  useEffect(() => {
    if (!traceEndpoint && endpoints.length > 0) setTraceEndpoint(endpoints[0].id);
  }, [endpoints, traceEndpoint]);

  const sub = useMemo(() => subgraphFor(graph, view, traceEndpoint), [graph, view, traceEndpoint]);

  useEffect(() => {
    let cancelled = false;
    setPositions(null);
    layout(sub.nodes, sub.edges, view).then((p) => {
      if (!cancelled) setPositions(p);
    });
    return () => {
      cancelled = true;
    };
  }, [sub, view]);

  const needle = query.trim().toLowerCase();
  const flowNodes = useMemo(() => {
    if (!positions) return [];
    return sub.nodes.map((n) => {
      const match = needle === "" || n.label.toLowerCase().includes(needle) || n.id.toLowerCase().includes(needle);
      return {
        id: n.id,
        position: positions.get(n.id) ?? { x: 0, y: 0 },
        data: { label: <span className="map-node-label" title={n.label}>{n.label}</span> },
        sourcePosition: "right",
        targetPosition: "left",
        width: NODE_W,
        height: NODE_H,
        style: {
          width: NODE_W,
          height: NODE_H,
          background: "var(--surface-raised)",
          color: "var(--text)",
          border: `1.5px solid ${LAYER_COLOR[n.layer] ?? "var(--hairline)"}`,
          borderRadius: 10,
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          padding: "0 8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: match ? 1 : 0.2,
          boxShadow: n.id === selectedId ? `0 0 0 2px ${LAYER_COLOR[n.layer] ?? "var(--text)"}` : "none",
        },
      };
    });
  }, [positions, sub, needle, selectedId]);

  const flowEdges = useMemo(
    () =>
      sub.edges.map((e, i) => ({
        id: `e${i}`,
        source: e.from,
        target: e.to,
        label: e.kind.replace(/_/g, " "),
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#8b96a0" },
        style: { stroke: "#8b96a0", strokeWidth: 1.4, strokeDasharray: e.inferred ? "6 4" : undefined },
        labelStyle: { fill: "#a3adb6", fontSize: 10 },
        labelBgStyle: { fill: "#151a1f" },
      })),
    [sub]
  );

  const selected = graph.nodes.find((n) => n.id === selectedId) ?? null;
  const selectedEdges = selected ? graph.edges.filter((e) => e.from === selected.id || e.to === selected.id) : [];
  const labelOf = useCallback((id) => graph.nodes.find((n) => n.id === id)?.label ?? id, [graph]);
  const slug = selected ? pageSlugFor(selected) : null;

  return (
    <div className="map-shell">
      <div className="map-toolbar">
        <button className="btn-primary" style={{ width: "auto" }} onClick={onBack}>
          ← Run
        </button>
        <div className="map-tabs" role="tablist">
          {VIEWS.map((v) => (
            <button key={v.id} role="tab" aria-selected={view === v.id} className={`map-tab ${view === v.id ? "map-tab-active" : ""}`} onClick={() => { setView(v.id); setSelectedId(null); }}>
              {v.label}
            </button>
          ))}
        </div>
        {view === "trace" && (
          <select className="map-input" value={traceEndpoint ?? ""} onChange={(e) => setTraceEndpoint(e.target.value)} aria-label="Endpoint to trace">
            {endpoints.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        )}
        <input className="map-input" type="search" placeholder="Search nodes" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search nodes" />
        <span className="map-legend">
          <span className="map-legend-line" /> from code
          <span className="map-legend-line map-legend-dashed" /> inferred
        </span>
      </div>

      <div className="map-body">
        <div className="map-canvas">
          {!positions ? (
            <p className="lede map-empty">Laying out the map…</p>
          ) : flowNodes.length === 0 ? (
            <p className="lede map-empty">
              {view === "trace" ? "This endpoint has no connected handlers, middleware or callers in the code." : "Nothing to show in this view for this run."}
            </p>
          ) : (
            <ReactFlow
              key={view + traceEndpoint}
              nodes={flowNodes}
              edges={flowEdges}
              colorMode="dark"
              fitView
              minZoom={0.1}
              onlyRenderVisibleElements
              nodesDraggable={false}
              nodesConnectable={false}
              onNodeClick={(_, node) => setSelectedId(node.id)}
              onPaneClick={() => setSelectedId(null)}
            >
              <Background gap={16} color="rgba(255,255,255,0.05)" />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable nodeColor="#7ee0c3" maskColor="rgba(13,16,19,0.7)" />
            </ReactFlow>
          )}
        </div>

        {selected && (
          <aside className="map-drawer" aria-label="Node details">
            <h2 style={{ fontFamily: "var(--font-mono)", fontSize: 15, wordBreak: "break-all" }}>{selected.label}</h2>
            <p className="stage-status">
              {selected.kind} · {selected.layer}
            </p>
            <p className="stage-status map-case" style={{ wordBreak: "break-all" }}>{selected.id}</p>
            {slug && (
              <a className="page-link" href="#" onClick={(e) => { e.preventDefault(); onOpenPage(slug); }}>
                Open doc page
              </a>
            )}
            <h3 style={{ fontSize: 13, marginTop: 16 }}>Connections</h3>
            {selectedEdges.length === 0 && <p className="stage-status">None found in the code.</p>}
            {selectedEdges.map((e, i) => (
              <div key={i} className="map-edge-row">
                <div>
                  {e.from === selected.id ? "→" : "←"} {e.kind.replace(/_/g, " ")} {labelOf(e.from === selected.id ? e.to : e.from)}
                </div>
                <div className="stage-status map-case">
                  {e.inferred && <strong style={{ color: "var(--amber)" }}>inferred · </strong>}
                  {e.evidence.length > 0 ? e.evidence.map((ev) => `${ev.path}:${ev.start_line}`).join(", ") : "no line recorded"}
                </div>
              </div>
            ))}
          </aside>
        )}
      </div>
    </div>
  );
}

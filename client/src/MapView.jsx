import { useEffect, useMemo, useState, useCallback } from "react";
import { ReactFlow, ReactFlowProvider, MiniMap, Controls, Background, MarkerType, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { LAYER_ORDER, COLLAPSE_ABOVE, subgraphFor, collapseByGroup, edgeLabel, nodeTitle, functionsSubgraph, endpointChoices } from "./map-model.js";
import FollowTheData from "./FollowTheData.jsx";
import AskPanel from "./AskPanel.jsx";
import { NODE_W, NODE_H, LAYER_COLOR, layout } from "./map-shared.js";
import TourPlayer from "./TourPlayer.jsx";
import ExplorerPlayer from "./ExplorerPlayer.jsx";

async function fetchExplorer(runId) {
  const res = await fetch(`/api/runs/${runId}/explore`, { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) window.dispatchEvent(new Event("docsync:signed-out"));
  if (!res.ok) throw new Error(body?.error?.message ?? "The guide could not start exploring right now.");
  return body.explorer;
}

const VIEWS = [
  { id: "flow", label: "Follow the Data" },
  { id: "architecture", label: "Architecture" },
  { id: "functions", label: "Functions" },
  { id: "trace", label: "Request Trace" },
  { id: "dependencies", label: "Files" },
];

function pageSlugFor(node) {
  if (node.id.startsWith("ep:")) return "api-endpoints";
  const path = node.id.startsWith("mod:") ? node.id.slice(4) : node.id.startsWith("sym:") ? node.id.slice(4).split("#")[0] : null;
  return path ? path.replace(/\.[^./]+$/, "").replace(/\//g, "-") : null;
}

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function MapViewInner({ runId, graph, tours = [], onBack, onOpenPage }) {
  const { setCenter } = useReactFlow();
  const reducedMotion = useMemo(prefersReducedMotion, []);
  const [view, setView] = useState(() => (graph.nodes.some((n) => n.kind === "endpoint") ? "flow" : "architecture"));
  const [plain, setPlain] = useState(true); // plain-English names by default; off shows the code names
  const [traceEndpoint, setTraceEndpoint] = useState(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [positions, setPositions] = useState(null);
  const [collapseChoice, setCollapseChoice] = useState(null); // null = automatic (collapse above COLLAPSE_ABOVE nodes)
  const [expanded, setExpanded] = useState(() => new Set());
  const [areaFilter, setAreaFilter] = useState("");
  const [tourId, setTourId] = useState(null); // set while a guided tour is playing
  const [askOpen, setAskOpen] = useState(false);
  const [explorer, setExplorer] = useState({ status: "idle" }); // idle | loading | ready | error

  const endpoints = useMemo(() => graph.nodes.filter((n) => n.kind === "endpoint"), [graph]);
  useEffect(() => {
    if (!traceEndpoint && endpoints.length > 0) setTraceEndpoint(endpointChoices(graph)[0].id);
  }, [endpoints, traceEndpoint, graph]);

  const base = useMemo(() => (view === "functions" ? functionsSubgraph(graph) : subgraphFor(graph, view, traceEndpoint)), [graph, view, traceEndpoint]);

  // Idea 4 ("pulse-on-call"): the request-trace diagram can play back the actual call order -
  // a breadth-first walk of the already-drawn subgraph starting at the traced endpoint, so every
  // step it plays corresponds to a node/edge genuinely on screen (no reaching into data this view
  // doesn't render).
  const traceOrder = useMemo(() => {
    if (view !== "trace" || !traceEndpoint) return [];
    const byFrom = new Map();
    base.edges.forEach((e, i) => {
      if (!byFrom.has(e.from)) byFrom.set(e.from, []);
      byFrom.get(e.from).push({ edgeIndex: i, to: e.to });
    });
    const order = [];
    const seen = new Set([traceEndpoint]);
    const queue = [traceEndpoint];
    while (queue.length) {
      const id = queue.shift();
      for (const item of byFrom.get(id) ?? []) {
        if (seen.has(item.to)) continue;
        seen.add(item.to);
        order.push(item);
        queue.push(item.to);
      }
    }
    return order;
  }, [view, traceEndpoint, base]);
  const edgeOrderPos = useMemo(() => new Map(traceOrder.map((item, pos) => [item.edgeIndex, pos])), [traceOrder]);
  const nodeOrderPos = useMemo(() => {
    const m = new Map(traceEndpoint ? [[traceEndpoint, -1]] : []);
    for (const item of traceOrder) if (!m.has(item.to)) m.set(item.to, edgeOrderPos.get(item.edgeIndex));
    return m;
  }, [traceOrder, traceEndpoint, edgeOrderPos]);

  const [playTrace, setPlayTrace] = useState(false);
  const [traceStep, setTraceStep] = useState(-1);
  useEffect(() => {
    setTraceStep(-1);
    setPlayTrace(false);
  }, [view, traceEndpoint]);
  useEffect(() => {
    if (!playTrace) return undefined;
    if (traceStep >= traceOrder.length - 1) {
      setPlayTrace(false);
      return undefined;
    }
    const t = setTimeout(() => setTraceStep((s) => s + 1), 900);
    return () => clearTimeout(t);
  }, [playTrace, traceStep, traceOrder.length]);
  const traceFinished = traceStep >= traceOrder.length - 1 && traceStep >= 0;
  const toggleTracePlay = useCallback(() => {
    setPlayTrace((p) => {
      if (!p && traceFinished) setTraceStep(-1);
      return !p;
    });
  }, [traceFinished]);
  const hasAreas = graph.groups.length > 0;
  const collapsed = hasAreas && view !== "trace" && view !== "flow" && view !== "functions" && (collapseChoice ?? base.nodes.length > COLLAPSE_ABOVE);
  const sub = useMemo(() => (collapsed ? collapseByGroup(base, graph.groups, expanded) : base), [base, collapsed, graph.groups, expanded]);
  const groupNameOf = useCallback((id) => graph.groups.find((g) => g.id === id)?.name ?? null, [graph.groups]);

  useEffect(() => {
    if (view === "flow") return undefined;
    let cancelled = false;
    setPositions(null);
    layout(sub.nodes, sub.edges, view === "functions" ? "architecture" : view).then((p) => {
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
      const textMatch = needle === "" || n.label.toLowerCase().includes(needle) || n.id.toLowerCase().includes(needle) || (n.plain_label ?? "").toLowerCase().includes(needle) || (n.plain_summary ?? "").toLowerCase().includes(needle);
      const match = textMatch && (areaFilter === "" || n.group === areaFilter);
      const orderPos = nodeOrderPos.get(n.id);
      const traceActive = playTrace && orderPos === traceStep;
      const traceVisited = orderPos !== undefined && orderPos <= traceStep && !traceActive;
      return {
        id: n.id,
        position: positions.get(n.id) ?? { x: 0, y: 0 },
        data: {
          label: (
            <span className="map-node-text" title={n.plain_summary ?? n.label}>
              <span className="map-node-label">{nodeTitle(n, plain)}</span>
              {plain && n.plain_label && n.plain_label !== n.label && <span className="map-node-tech">{n.label}</span>}
            </span>
          ),
        },
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
          fontFamily: plain ? "var(--font-sans)" : "var(--font-mono)",
          fontSize: 13,
          padding: "0 8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: match ? 1 : 0.2,
          boxShadow: n.id === selectedId
            ? `0 0 0 2px ${LAYER_COLOR[n.layer] ?? "var(--text)"}`
            : traceActive
            ? "0 0 0 3px var(--amber), 0 0 26px 6px rgba(244,194,122,0.55)"
            : traceVisited
            ? "0 0 0 2px rgba(244,194,122,0.45)"
            : "none",
          animation: traceActive && !reducedMotion ? "trace-pulse 900ms ease-in-out infinite" : "none",
        },
      };
    });
  }, [positions, sub, needle, selectedId, areaFilter, plain, nodeOrderPos, playTrace, traceStep, reducedMotion]);

  const flowEdges = useMemo(
    () =>
      sub.edges.map((e, i) => {
        const orderPos = edgeOrderPos.get(i);
        const traceActive = playTrace && orderPos === traceStep;
        const traceVisited = orderPos !== undefined && orderPos < traceStep;
        const color = traceActive ? "#f4c27a" : traceVisited ? "#d7a45c" : "#8b96a0";
        return {
          id: `e${i}`,
          source: e.from,
          target: e.to,
          label: edgeLabel(e, plain),
          animated: traceActive && !reducedMotion,
          markerEnd: { type: MarkerType.ArrowClosed, color },
          style: { stroke: color, strokeWidth: traceActive ? 2.6 : traceVisited ? 1.8 : 1.4, strokeDasharray: e.inferred ? "6 4" : undefined },
          labelStyle: { fill: "#a3adb6", fontSize: 10 },
          labelBgStyle: { fill: "#151a1f" },
        };
      }),
    [sub, plain, edgeOrderPos, playTrace, traceStep, reducedMotion]
  );

  const selected = sub.nodes.find((n) => n.id === selectedId) ?? graph.nodes.find((n) => n.id === selectedId) ?? null;
  const selectedGroup = selected?.kind === "group" ? graph.groups.find((g) => g.id === selected.group) : null;
  const groupMembers = selectedGroup ? base.nodes.filter((n) => n.group === selectedGroup.id) : [];
  const selectedEdges = selected && !selectedGroup ? graph.edges.filter((e) => e.from === selected.id || e.to === selected.id) : [];
  const labelOf = useCallback((id) => {
    const n = graph.nodes.find((x) => x.id === id);
    return n ? nodeTitle(n, plain) : id;
  }, [graph, plain]);
  const slug = selected && !selectedGroup ? pageSlugFor(selected) : null;

  // Idea 4, "talk to the guide" (LOG.md): when Ask names a source, select it everywhere (it already
  // highlights the matching Follow-the-data step) and, on a canvas view where that node is actually
  // laid out, glide the camera to it - the same centering TourPlayer uses for its own stops.
  const flyToId = useCallback(
    (id) => {
      setSelectedId(id);
      if (view !== "flow" && positions?.has(id)) {
        const p = positions.get(id);
        setCenter(p.x + NODE_W / 2, p.y + NODE_H / 2, { zoom: 1, duration: 750 });
      }
    },
    [view, positions, setCenter]
  );

  const startExplore = useCallback(async () => {
    if (explorer.status === "ready") {
      setExplorer((s) => ({ ...s, open: true }));
      return;
    }
    setExplorer({ status: "loading" });
    try {
      const doc = await fetchExplorer(runId);
      setExplorer({ status: "ready", open: true, explorer: doc });
    } catch (err) {
      setExplorer({ status: "error", message: err.message });
    }
  }, [runId, explorer.status]);

  const activeTour = tourId ? tours.find((t) => t.tour_id === tourId) : null;
  if (activeTour) {
    return <TourPlayer graph={graph} tour={activeTour} tours={tours} onSelectTour={setTourId} onBack={() => setTourId(null)} />;
  }
  if (explorer.status === "ready" && explorer.open) {
    return <ExplorerPlayer graph={graph} explorer={explorer.explorer} onBack={() => setExplorer((s) => ({ ...s, open: false }))} />;
  }

  return (
    <div className="map-shell">
      <div className="map-toolbar">
        <button className="btn-primary" style={{ width: "auto" }} onClick={onBack}>
          ← Back to report
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
                {nodeTitle(n, plain)}
              </option>
            ))}
          </select>
        )}
        {view === "trace" && !reducedMotion && traceOrder.length > 0 && (
          <button className="btn-primary" style={{ width: "auto" }} onClick={toggleTracePlay}>
            {playTrace ? "Pause Trace" : traceFinished ? "Replay Trace" : "Play Trace"}
          </button>
        )}
        <label className="map-check" title="Show everyday words instead of code names">
          <input type="checkbox" checked={plain} onChange={(e) => setPlain(e.target.checked)} /> Plain English
        </label>
        <button className="btn-primary" style={{ width: "auto" }} onClick={() => setAskOpen((o) => !o)} aria-pressed={askOpen}>
          Ask
        </button>
        {tours.length > 0 && (
          <button className="btn-primary" style={{ width: "auto", background: "var(--amber)", color: "var(--mint-ink)" }} onClick={() => setTourId(tours[0].tour_id)}>
            Guided Tour
          </button>
        )}
        <button className="btn-primary" style={{ width: "auto" }} onClick={startExplore} disabled={explorer.status === "loading"} title="Let the guide pick its own walk through this app">
          {explorer.status === "loading" ? "Exploring…" : "Explore"}
        </button>
        {explorer.status === "error" && <span className="map-note map-note-error">{explorer.message}</span>}
        {hasAreas && view !== "flow" && (
          <select className="map-input" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} aria-label="Highlight an area">
            <option value="">All areas</option>
            {graph.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
        {hasAreas && view !== "trace" && view !== "flow" && view !== "functions" && (
          <label className="map-check">
            <input type="checkbox" checked={collapsed} onChange={(e) => { setCollapseChoice(e.target.checked); setExpanded(new Set()); setSelectedId(null); }} /> Collapse areas
          </label>
        )}
        <input className="map-input" type="search" placeholder="Search nodes" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search nodes" />
        <span className="map-legend">
          <span className="map-legend-line" /> from code
          <span className="map-legend-line map-legend-dashed" /> inferred
        </span>
      </div>

      <div className="map-body">
        <div className="map-canvas">
          {view === "flow" ? (
            <FollowTheData graph={graph} plain={plain} endpointId={traceEndpoint} onEndpoint={setTraceEndpoint} selectedId={selectedId} onSelect={setSelectedId} />
          ) : !positions ? (
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

        {askOpen && (
          <AskPanel runId={runId} graph={graph} plain={plain} onClose={() => setAskOpen(false)} onSelectSource={flyToId} onOpenPage={onOpenPage} />
        )}

        {selected && (
          <aside className="map-drawer" aria-label="Node details">
            <h2 style={{ fontFamily: plain ? "var(--font-sans)" : "var(--font-mono)", fontSize: 16, wordBreak: "break-word" }}>{selectedGroup ? selectedGroup.name : nodeTitle(selected, plain)}</h2>
            {!selectedGroup && plain && selected.plain_label && selected.plain_label !== selected.label && <p className="stage-status map-case" style={{ wordBreak: "break-all" }}>{selected.label}</p>}
            {!selectedGroup && selected.plain_summary && <p>{selected.plain_summary}</p>}
            {!selectedGroup && selected.data && <DataBlock data={selected.data} />}
            <p className="stage-status">
              {selectedGroup ? `area · ${groupMembers.length} nodes in this view` : `${selected.kind} · ${selected.layer}`}
            </p>
            {!selectedGroup && selected.group && groupNameOf(selected.group) && <p className="stage-status">Area: {groupNameOf(selected.group)}</p>}
            {selectedGroup && (
              <>
                <p>{selectedGroup.summary}</p>
                <button className="btn-primary" style={{ width: "auto" }} onClick={() => { setExpanded(new Set([...expanded, selectedGroup.id])); setSelectedId(null); }}>
                  Expand this area
                </button>
                <h3 style={{ fontSize: 13, marginTop: 16 }}>Nodes in this area</h3>
                {groupMembers.slice(0, 60).map((m) => (
                  <div key={m.id} className="map-edge-row">{m.label}</div>
                ))}
                {groupMembers.length > 60 && <p className="stage-status">and {groupMembers.length - 60} more</p>}
              </>
            )}
            {!selectedGroup && <p className="stage-status map-case" style={{ wordBreak: "break-all" }}>{selected.id}</p>}
            {slug && (
              <a className="page-link" href="#" onClick={(e) => { e.preventDefault(); onOpenPage(slug); }}>
                Open doc page
              </a>
            )}
            {!selectedGroup && <h3 style={{ fontSize: 13, marginTop: 16 }}>Connections</h3>}
            {!selectedGroup && selectedEdges.length === 0 && <p className="stage-status">None found in the code.</p>}
            {selectedEdges.map((e, i) => (
              <div key={i} className="map-edge-row">
                <div>
                  {e.from === selected.id ? "→" : "←"} {edgeLabel(e, plain)} {labelOf(e.from === selected.id ? e.to : e.from)}
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

export default function MapView(props) {
  return (
    <ReactFlowProvider>
      <MapViewInner {...props} />
    </ReactFlowProvider>
  );
}

function DataBlock({ data }) {
  const rows = [
    ["Takes in", data.inputs.map((i) => i.name)],
    ["Looks up", data.reads.map((r) => `${r.table}${r.columns.length && !r.columns.includes("*") ? ` (${r.columns.join(", ")})` : ""}`)],
    ["Saves to", data.writes.map((w) => `${w.table}${w.columns.length ? ` (${w.columns.join(", ")})` : ""}`)],
    ["Sends back", data.outputs.filter((o) => o.status === null || o.status < 400).map((o) => (o.keys?.length ? o.keys.join(", ") : "the result"))],
    ["If it goes wrong", data.outputs.filter((o) => o.status !== null && o.status >= 400).map((o) => o.message ?? `error ${o.status}`)],
  ].filter(([, items]) => items.length > 0);
  if (rows.length === 0) return null;
  return (
    <dl className="data-block">
      {rows.map(([label, items]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{[...new Set(items)].join("; ")}</dd>
        </div>
      ))}
    </dl>
  );
}

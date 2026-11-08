import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ReactFlow, ReactFlowProvider, ViewportPortal, useReactFlow, MarkerType } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import GuideCharacter from "./GuideCharacter.jsx";
import { NODE_W, NODE_H, LAYER_COLOR, layout } from "./map-shared.js";
import { tourSubgraph, walkedEdgeKeys, readingMs, layoutKindFor, stepIndex } from "./tour-model.js";
import { speak, cancelSpeech, speechAvailable, prefetch } from "./speech.js";

const SPEEDS = [0.75, 1, 1.25, 1.5];
const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const spokenTextFor = (s) => (s.thought ? `${s.thought} ${s.title}. ${s.narration}` : `${s.title}. ${s.narration}`);

function Player({ graph, tour, tours, onSelectTour, onBack }) {
  const { setCenter } = useReactFlow();
  const reduced = useMemo(prefersReducedMotion, []);
  const voiceSupported = useMemo(speechAvailable, []);

  const [index, setIndex] = useState(0);
  const [arrived, setArrived] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [captions, setCaptions] = useState(true);
  const [voice, setVoice] = useState(voiceSupported);
  const [positions, setPositions] = useState(null);
  const [dot, setDot] = useState(null);
  const [moving, setMoving] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false); // true only for the gap speak()'s onStart didn't manage to hide

  const sub = useMemo(() => tourSubgraph(graph, tour), [graph, tour]);
  const walked = useMemo(() => walkedEdgeKeys(tour), [tour]);
  const stop = tour.stops[index];
  const labelOf = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n.label])), [graph]);

  // New tour: back to the first stop, paused. Get its line synthesizing now, before Play is even
  // pressed, so the first stop doesn't carry the full wait too.
  useEffect(() => {
    setIndex(0);
    setArrived(-1);
    setPlaying(false);
    setFinished(false);
    setDot(null);
    cancelSpeech();
    if (voiceSupported && tour.stops[0]) prefetch(spokenTextFor(tour.stops[0]));
  }, [tour, voiceSupported]);

  useEffect(() => {
    let cancelled = false;
    setPositions(null);
    layout(sub.nodes, sub.edges, layoutKindFor(sub.nodes)).then((p) => !cancelled && setPositions(p));
    return () => {
      cancelled = true;
    };
  }, [sub]);

  // Move to the current stop: camera glides (or fades), a glowing dot travels the edge.
  useEffect(() => {
    if (!positions || !stop) return undefined;
    const target = positions.get(stop.node_id);
    if (!target) return undefined;
    let cancelled = false;
    let raf = 0;
    const travelMs = reduced ? 0 : 750 / speed;
    setMoving(true);
    setArrived(-1);

    const center = { x: target.x + NODE_W / 2 + 70, y: target.y + NODE_H / 2 };
    setCenter(center.x, center.y, { zoom: 1, duration: travelMs });

    const prevId = index > 0 ? tour.stops[index - 1].node_id : null;
    const from = prevId ? positions.get(prevId) : null;
    if (from && travelMs > 0) {
      const a = { x: from.x + NODE_W / 2, y: from.y + NODE_H / 2 };
      const b = { x: target.x + NODE_W / 2, y: target.y + NODE_H / 2 };
      const start = performance.now();
      const tick = (now) => {
        if (cancelled) return;
        const t = Math.min(1, (now - start) / travelMs);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        setDot({ x: a.x + (b.x - a.x) * eased, y: a.y + (b.y - a.y) * eased });
        if (t < 1) raf = requestAnimationFrame(tick);
        else setDot(null);
      };
      raf = requestAnimationFrame(tick);
    } else {
      setDot(null);
    }

    const timer = setTimeout(() => {
      if (cancelled) return;
      setMoving(false);
      setArrived(index);
    }, travelMs + 60);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    // speed deliberately not a dependency: changing it mid-stop must not replay the move
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, index, tour]);

  // Narrate the stop once we've arrived, then go on to the next while playing.
  useEffect(() => {
    if (!playing || arrived !== index || !stop) return undefined;
    let cancelled = false;
    const advance = () => {
      if (cancelled) return;
      if (index >= tour.stops.length - 1) {
        setPlaying(false);
        setFinished(true);
      } else {
        setTimeout(() => !cancelled && setIndex((i) => i + 1), 350 / speed);
      }
    };
    const spoken = spokenTextFor(stop);
    let cancelNarration;
    if (voice && voiceSupported) {
      setSynthesizing(true);
      cancelNarration = speak(spoken, {
        rate: speed,
        onStart: () => {
          if (cancelled) return;
          setSynthesizing(false);
          // Only once this line is actually playing (its own synthesis is done) start the next
          // one, so the two never contend for the same local engine at once - concurrent
          // requests to it were failing outright (502s) rather than just queueing.
          const next = tour.stops[index + 1];
          if (next) prefetch(spokenTextFor(next));
        },
        onEnd: advance,
      });
    } else {
      const timer = setTimeout(advance, readingMs(spoken, speed));
      cancelNarration = () => clearTimeout(timer);
    }
    return () => {
      cancelled = true;
      setSynthesizing(false);
      cancelNarration?.();
    };
  }, [playing, arrived, index, voice, speed, stop, tour, voiceSupported]);

  useEffect(() => () => cancelSpeech(), []);

  const go = useCallback(
    (delta) => {
      setFinished(false);
      setIndex((i) => stepIndex(i, delta, tour.stops.length));
    },
    [tour]
  );
  const togglePlay = useCallback(() => {
    setFinished(false);
    setPlaying((p) => {
      if (!p && index >= tour.stops.length - 1 && arrived === index) {
        setIndex(0);
      }
      return !p;
    });
  }, [index, arrived, tour]);

  useEffect(() => {
    function onKey(e) {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, go]);

  const guideState = finished ? "celebrating" : !positions ? "thinking" : moving ? "pointing" : synthesizing ? "composing" : playing ? "talking" : "idle";

  const flowNodes = useMemo(() => {
    if (!positions) return [];
    return sub.nodes.map((n) => {
      const isStop = sub.stopIds.has(n.id);
      const current = stop && n.id === stop.node_id;
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
          opacity: isStop ? 1 : 0.35,
          boxShadow: current ? "0 0 0 3px var(--amber), 0 0 24px 4px rgba(244,194,122,0.45)" : "none",
        },
      };
    });
  }, [positions, sub, stop]);

  const flowEdges = useMemo(
    () =>
      sub.edges.map((e, i) => {
        const onPath = walked.has(`${e.from}|${e.to}`);
        return {
          id: `e${i}`,
          source: e.from,
          target: e.to,
          label: onPath ? e.kind.replace(/_/g, " ") : undefined,
          markerEnd: { type: MarkerType.ArrowClosed, color: onPath ? "#f4c27a" : "#4a545d" },
          style: { stroke: onPath ? "#f4c27a" : "#4a545d", strokeWidth: onPath ? 2.4 : 1.2, strokeDasharray: e.inferred ? "6 4" : undefined },
          labelStyle: { fill: "#a3adb6", fontSize: 10 },
          labelBgStyle: { fill: "#151a1f" },
        };
      }),
    [sub, walked]
  );

  const pos = positions && stop ? positions.get(stop.node_id) : null;
  const evidence = stop?.evidence?.[0];

  return (
    <div className="tour-shell">
      <div className="map-toolbar">
        <button className="btn-primary" style={{ width: "auto" }} onClick={onBack}>
          ← Map
        </button>
        {tours.length > 1 && (
          <select className="map-input" value={tour.tour_id} onChange={(e) => onSelectTour(e.target.value)} aria-label="Choose a tour">
            {tours.map((t) => (
              <option key={t.tour_id} value={t.tour_id}>
                {t.title}
              </option>
            ))}
          </select>
        )}
        <select className="map-input" style={{ minWidth: 0 }} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Speed">
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
        <label className="map-check">
          <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} /> Captions
        </label>
        <label className="map-check" title={voiceSupported ? "" : "This browser has no speech synthesis"}>
          <input type="checkbox" checked={voice && voiceSupported} disabled={!voiceSupported} onChange={(e) => setVoice(e.target.checked)} /> Voice
        </label>
        <span className="map-legend">
          <span className="map-legend-line" style={{ borderTopColor: "#f4c27a" }} /> the path
          <span className="map-legend-line map-legend-dashed" /> inferred
        </span>
      </div>

      <div className={`tour-canvas ${reduced ? "tour-fade" : ""}`} key={reduced ? `${tour.tour_id}-${index}` : tour.tour_id}>
        {!positions ? (
          <p className="lede map-empty">Getting the tour ready…</p>
        ) : (
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            colorMode="dark"
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            fitView
            minZoom={0.2}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            proOptions={{ hideAttribution: true }}
          >
            <ViewportPortal>
              {dot && <div className="tour-dot" style={{ left: dot.x, top: dot.y }} />}
              {pos && (
                <div className="tour-guide" style={{ left: pos.x + NODE_W - 30, top: pos.y - 40, transition: reduced ? "none" : "left 0.6s ease, top 0.6s ease" }}>
                  <GuideCharacter state={guideState} size={52} />
                  {stop?.thought && arrived === index && (
                    <div className="tour-thought-bubble">{stop.thought}</div>
                  )}
                </div>
              )}
            </ViewportPortal>
          </ReactFlow>
        )}
      </div>

      <div className="tour-panel" aria-live="polite">
        <p className="tour-title">
          {index + 1} of {tour.stops.length} · {stop?.title}
        </p>
        {captions && stop?.thought && <p className="tour-thought">{stop.thought}</p>}
        {captions && <p className="tour-narration">{stop?.narration}</p>}
        {synthesizing && (
          <p className="tour-synth-status">
            <span className="tour-eq" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </span>
            Finding the words…
          </p>
        )}
        {evidence && (
          <span className="tour-evidence">
            {evidence.path}:{evidence.start_line}
            {evidence.end_line !== evidence.start_line ? `-${evidence.end_line}` : ""}
            {" · "}
            {labelOf.get(stop.node_id)}
          </span>
        )}
        <div className="tour-controls">
          <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous stop">
            ◀
          </button>
          <button type="button" className="btn-primary" style={{ width: "auto" }} onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
            {playing ? "Pause" : finished ? "Replay" : "Play"}
          </button>
          <button type="button" onClick={() => go(1)} disabled={index === tour.stops.length - 1} aria-label="Next stop">
            ▶
          </button>
          <div className="tour-stops" role="tablist" aria-label="Stops">
            {tour.stops.map((s, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Stop ${i + 1}: ${s.title}`}
                className={`tour-stop-dot ${i < index ? "tour-stop-dot-done" : ""} ${i === index ? "tour-stop-dot-current" : ""}`}
                onClick={() => { setFinished(false); setIndex(i); }}
              />
            ))}
          </div>
          <span className="tour-note">Space plays · ← → step</span>
        </div>
      </div>
    </div>
  );
}

export default function TourPlayer(props) {
  return (
    <ReactFlowProvider>
      <Player {...props} />
    </ReactFlowProvider>
  );
}

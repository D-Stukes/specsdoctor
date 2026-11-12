import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { traceSteps, endpointChoices, nodeTitle } from "./map-model.js";
import { fieldsFromEntry, parseWriteChip, firstIndexOfKind } from "./data-motion.js";

const CHIP_CLASS = { in: "chip-in", read: "chip-read", write: "chip-write", out: "chip-out", bad: "chip-bad" };
const KIND_TITLE = { caller: "A screen asks", entry: "The request arrives", check: "A check first", work: "The work", read: "Looking things up", write: "Saving", reply: "The answer" };
const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const TRAVEL_MS = prefersReducedMotion() ? 0 : 900;
const LAND_PAUSE_MS = prefersReducedMotion() ? 0 : 500;
const REPLY_REVEAL_MS = prefersReducedMotion() ? 0 : 500;
const IDLE = { phase: "idle" };

function DataRow({ info }) {
  if (!info) return null;
  return (
    <div className="flow-row-flourish">
      <span className="flow-row-check">✓</span> New row in <strong>{info.table}</strong>
      {info.columns.length > 0 ? `: ${info.columns.join(", ")}` : ""}
    </div>
  );
}

/** The story of one action, in numbered plain-English steps: who asks, what comes in, what happens, what is saved, what goes back. */
export default function FollowTheData({ graph, plain, endpointId, onEndpoint, selectedId, onSelect }) {
  const [showTechnical, setShowTechnical] = useState(false);
  const [motion, setMotion] = useState(IDLE);
  const trackRef = useRef(null);
  const stepRefs = useRef(new Map());
  const timers = useRef([]);
  const choices = useMemo(() => endpointChoices(graph), [graph]);
  const steps = useMemo(() => traceSteps(graph, endpointId, plain), [graph, endpointId, plain]);
  const current = choices.find((n) => n.id === endpointId);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => {
    clearTimers();
    setMotion(IDLE);
  }, [endpointId, plain, clearTimers]);
  useEffect(() => clearTimers, [clearTimers]);

  const entryIdx = firstIndexOfKind(steps, "entry");
  const writeIdx = firstIndexOfKind(steps, "write");
  const replyIdx = firstIndexOfKind(steps, "reply");
  const fields = entryIdx !== -1 ? fieldsFromEntry(steps[entryIdx]) : [];
  const canPlay = entryIdx !== -1 && fields.length > 0 && (writeIdx !== -1 || replyIdx !== -1) && (motion.phase === "idle" || motion.phase === "done");

  const play = useCallback(() => {
    clearTimers();
    const targetIdx = writeIdx !== -1 ? writeIdx : replyIdx;
    const containerEl = trackRef.current;
    const startEl = stepRefs.current.get(steps[entryIdx]?.n);
    const endEl = stepRefs.current.get(steps[targetIdx]?.n);
    if (!containerEl || !startEl || !endEl) return;
    const cRect = containerEl.getBoundingClientRect();
    const sRect = startEl.getBoundingClientRect();
    const eRect = endEl.getBoundingClientRect();

    const startTags = fields.map((name, i) => ({ id: `${name}-${i}`, name, x: sRect.left - cRect.left + 48 + i * 6, y: sRect.top - cRect.top + 44 }));
    setMotion({ phase: "entering", tags: startTags, entryIdx, targetIdx, writeIdx, replyIdx });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setMotion((m) =>
          m.phase !== "entering"
            ? m
            : { ...m, phase: "traveling", tags: m.tags.map((t, i) => ({ ...t, x: eRect.left - cRect.left + 14 + (i % 3) * 18, y: eRect.top - cRect.top + 42 + Math.floor(i / 3) * 16 })) }
        );
      });
    });

    timers.current.push(setTimeout(() => setMotion((m) => (m.phase === "traveling" ? { ...m, phase: "landed", tags: [] } : m)), TRAVEL_MS + 120));
    timers.current.push(setTimeout(() => setMotion((m) => (m.phase === "landed" ? { ...m, phase: "replying" } : m)), TRAVEL_MS + 120 + LAND_PAUSE_MS));
    timers.current.push(setTimeout(() => setMotion((m) => (m.phase === "replying" ? { ...m, phase: "done" } : m)), TRAVEL_MS + 120 + LAND_PAUSE_MS + REPLY_REVEAL_MS));
  }, [steps, entryIdx, writeIdx, replyIdx, fields, clearTimers]);

  if (choices.length === 0) return <p className="lede map-empty">No API endpoints were found in this code, so there is no request to follow. Try the Architecture or Functions view.</p>;

  const onPath = (idx) => motion.phase !== "idle" && idx >= motion.entryIdx && idx <= motion.targetIdx;
  const showRow = (idx) => idx === motion.writeIdx && ["landed", "replying", "done"].includes(motion.phase);
  const showReply = (idx) => idx === motion.replyIdx && ["replying", "done"].includes(motion.phase);

  return (
    <div className="flow">
      <div className="flow-head">
        <label className="flow-pick">
          <span>Follow what happens when someone does this:</span>
          <select className="map-input" value={endpointId ?? ""} onChange={(e) => onEndpoint(e.target.value)} aria-label="Action to follow">
            {choices.map((n) => (
              <option key={n.id} value={n.id}>
                {nodeTitle(n, plain)}
              </option>
            ))}
          </select>
        </label>
        {plain && current && <span className="flow-tech">{current.label}</span>}
        <button type="button" className="btn-primary" style={{ width: "auto" }} onClick={play} disabled={!canPlay} title={fields.length === 0 ? "This action takes no input to animate" : "Watch the real fields travel this path"}>
          {motion.phase === "idle" || motion.phase === "done" ? "▶ Watch the data move" : "Watching…"}
        </button>
      </div>
      {current?.plain_summary && <p className="flow-summary">{current.plain_summary}</p>}

      <div className="flow-track" ref={trackRef}>
        <ol className="flow-steps">
          {steps.map((s, idx) => (
            <li
              key={s.n}
              ref={(el) => {
                if (el) stepRefs.current.set(s.n, el);
              }}
              className={`flow-step flow-${s.kind} ${s.nodeId && s.nodeId === selectedId ? "flow-selected" : ""} ${onPath(idx) ? "flow-onpath" : ""}`}
            >
              <span className="flow-num">{s.n}</span>
              <div className="flow-card" onClick={() => s.nodeId && onSelect(s.nodeId)} role={s.nodeId ? "button" : undefined} tabIndex={s.nodeId ? 0 : undefined} onKeyDown={(e) => e.key === "Enter" && s.nodeId && onSelect(s.nodeId)}>
                <div className="flow-kind">{KIND_TITLE[s.kind]}</div>
                <div className="flow-title">{s.title}</div>
                <p className="flow-text">{s.text}</p>
                {s.chips.length > 0 && (
                  <div className="flow-chips">
                    {s.chips.map((c, i) => (
                      <span
                        key={i}
                        className={`chip ${CHIP_CLASS[c.kind]} ${showReply(idx) ? "chip-reveal" : ""} ${showReply(idx) && c.kind === "bad" ? "chip-bad-pulse" : ""}`}
                        style={showReply(idx) ? { animationDelay: `${i * 90}ms` } : undefined}
                      >
                        {c.text}
                      </span>
                    ))}
                  </div>
                )}
                {showRow(idx) && <DataRow info={parseWriteChip(s)} />}
                {(showTechnical || !plain) && (s.technical || s.evidence) && (
                  <div className="flow-where map-case">
                    {s.technical}
                    {s.technical && s.evidence ? " · " : ""}
                    {s.evidence}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
        {motion.tags?.length > 0 && (
          <div className="flow-tags" aria-hidden="true">
            {motion.tags.map((t) => (
              <span key={t.id} className="data-tag" style={{ left: t.x, top: t.y }}>
                {t.name}
              </span>
            ))}
          </div>
        )}
      </div>
      {plain && (
        <label className="map-check flow-code-toggle">
          <input type="checkbox" checked={showTechnical} onChange={(e) => setShowTechnical(e.target.checked)} /> Show the code names and file lines
        </label>
      )}
    </div>
  );
}

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { traceSteps, endpointChoices, nodeTitle } from "./map-model.js";
import { fieldsFromEntry, parseWriteChip, firstIndexOfKind } from "./data-motion.js";

const CHIP_CLASS = { in: "chip-in", read: "chip-read", write: "chip-write", out: "chip-out", bad: "chip-bad" };
const KIND_TITLE = { caller: "Sent by", entry: "Server receives it", check: "Check first", work: "Server does the work", read: "Looks up data", write: "Saves data", reply: "Answer goes back" };
// The first "caller" step is the screen where the action starts (e.g. the App page);
// a caller right after it is the code that actually sends the request (e.g. saveHabit).
function stepLabel(steps, idx) {
  const s = steps[idx];
  if (s.kind === "caller") return steps[idx - 1]?.kind === "caller" ? "Sent by" : "Starts on screen";
  return KIND_TITLE[s.kind];
}

// Code name + file line for the "Show the code names and file lines" option, skipping the
// code name when it's identical to the plain title (so it never just repeats the title).
function codeRef(s) {
  const parts = [];
  if (s.technical && s.technical !== s.title) parts.push(s.technical);
  if (s.evidence) parts.push(s.evidence);
  return parts.join(" · ");
}

// Hover text for a step's name: what kind of thing it is and where it lives in the code.
const KIND_HELP = {
  caller: "a screen or piece of front-end code",
  entry: "a web address (API endpoint) on the app's server",
  check: "a check that runs before the work, like confirming who is signed in",
  work: "a function on the server that does the work",
  read: "a database table the app reads from",
  write: "a database table the app saves to",
  reply: "the server's response",
};
function tooltipFor(s, label) {
  const where = s.evidence ? ` Found in ${s.evidence.replace(/:(\d+)$/, " (line $1)")}.` : "";
  const code = s.technical && s.technical !== s.title ? ` Code name: ${s.technical}.` : "";
  return `${label}: "${s.title}" is ${KIND_HELP[s.kind] ?? "part of this flow"}.${code}${where}`;
}

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const STEP_MS = prefersReducedMotion() ? 0 : 1800;
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
  const [expanded, setExpanded] = useState(() => new Set());
  const toggleStep = (n) => setExpanded((prev) => { const next = new Set(prev); next.has(n) ? next.delete(n) : next.add(n); return next; });
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
  const canPlay = steps.length > 1 && (motion.phase === "idle" || motion.phase === "done");

  // Walk the steps one at a time: each step lights up, opens, and scrolls into view,
  // so you can actually follow the data instead of watching it fly past.
  const play = useCallback(() => {
    clearTimers();
    setExpanded(new Set());
    steps.forEach((_, idx) => {
      timers.current.push(setTimeout(() => setMotion({ phase: "walking", current: idx }), idx * STEP_MS));
    });
    timers.current.push(setTimeout(() => setMotion({ phase: "done", current: steps.length - 1 }), steps.length * STEP_MS));
  }, [steps, clearTimers]);

  useEffect(() => {
    if (motion.phase !== "walking") return;
    const el = stepRefs.current.get(steps[motion.current]?.n);
    el?.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [motion, steps]);

  if (choices.length === 0) return <p className="lede map-empty">No API endpoints were found in this code, so there is no request to follow. Try the Architecture or Functions view.</p>;

  const walking = motion.phase !== "idle";
  const onPath = (idx) => walking && idx <= motion.current;
  const isActive = (idx) => motion.phase === "walking" && idx === motion.current;
  const showRow = (idx) => walking && idx === writeIdx && motion.current >= writeIdx;
  const showReply = (idx) => walking && idx === replyIdx && motion.current >= replyIdx;
  const carrying = (idx) => isActive(idx) && entryIdx !== -1 && idx >= entryIdx && fields.length > 0 && (writeIdx === -1 || idx < writeIdx);

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
              className={`flow-step flow-${s.kind} ${s.nodeId && s.nodeId === selectedId ? "flow-selected" : ""} ${onPath(idx) ? "flow-onpath" : ""} ${isActive(idx) ? "flow-active" : ""}`}
            >
              <span className="flow-num">{s.n}</span>
              <div
                className="flow-card"
                onClick={() => { toggleStep(s.n); if (s.nodeId) onSelect(s.nodeId); }}
                role="button"
                tabIndex={0}
                aria-expanded={expanded.has(s.n)}
                onKeyDown={(e) => { if (e.key === "Enter") { toggleStep(s.n); if (s.nodeId) onSelect(s.nodeId); } }}
              >
                <div className="flow-line">
                  <span className="flow-kind">{stepLabel(steps, idx)}:</span>
                  <span className="flow-title" title={tooltipFor(s, stepLabel(steps, idx))}>
                    {s.title} <span className="flow-info" aria-hidden="true">ⓘ</span>
                  </span>
                  {(showTechnical || !plain) && codeRef(s) && <span className="flow-code">{codeRef(s)}</span>}
                  <span className="flow-toggle">{expanded.has(s.n) ? "▾ less" : "▸ details"}</span>
                </div>
                {(expanded.has(s.n) || isActive(idx) || (motion.phase === "done" && onPath(idx))) && (
                <div className="flow-details">
                {carrying(idx) && <div className="flow-carry">Carrying: {fields.join(", ")}</div>}
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
                </div>
                )}
              </div>
              {idx < steps.length - 1 && <div className="flow-arrow" aria-hidden="true">↓</div>}
            </li>
          ))}
        </ol>
      </div>
      {plain && (
        <label className="map-check flow-code-toggle">
          <input type="checkbox" checked={showTechnical} onChange={(e) => setShowTechnical(e.target.checked)} /> Show the code names and file lines
        </label>
      )}
    </div>
  );
}

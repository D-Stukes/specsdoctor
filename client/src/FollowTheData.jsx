import { useMemo, useState } from "react";
import { traceSteps, endpointChoices, nodeTitle } from "./map-model.js";

const CHIP_CLASS = { in: "chip-in", read: "chip-read", write: "chip-write", out: "chip-out", bad: "chip-bad" };
const KIND_TITLE = { caller: "A screen asks", entry: "The request arrives", check: "A check first", work: "The work", read: "Looking things up", write: "Saving", reply: "The answer" };

/** The story of one action, in numbered plain-English steps: who asks, what comes in, what happens, what is saved, what goes back. */
export default function FollowTheData({ graph, plain, endpointId, onEndpoint, selectedId, onSelect }) {
  const [showTechnical, setShowTechnical] = useState(false);
  const choices = useMemo(() => endpointChoices(graph), [graph]);
  const steps = useMemo(() => traceSteps(graph, endpointId, plain), [graph, endpointId, plain]);
  const current = choices.find((n) => n.id === endpointId);

  if (choices.length === 0) return <p className="lede map-empty">No API endpoints were found in this code, so there is no request to follow. Try the Architecture or Functions view.</p>;

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

      <ol className="flow-steps">
        {steps.map((s) => (
          <li key={s.n} className={`flow-step flow-${s.kind} ${s.nodeId && s.nodeId === selectedId ? "flow-selected" : ""}`}>
            <span className="flow-num">{s.n}</span>
            <div className="flow-card" onClick={() => s.nodeId && onSelect(s.nodeId)} role={s.nodeId ? "button" : undefined} tabIndex={s.nodeId ? 0 : undefined} onKeyDown={(e) => e.key === "Enter" && s.nodeId && onSelect(s.nodeId)}>
              <div className="flow-kind">{KIND_TITLE[s.kind]}</div>
              <div className="flow-title">{s.title}</div>
              <p className="flow-text">{s.text}</p>
              {s.chips.length > 0 && (
                <div className="flow-chips">
                  {s.chips.map((c, i) => (
                    <span key={i} className={`chip ${CHIP_CLASS[c.kind]}`}>
                      {c.text}
                    </span>
                  ))}
                </div>
              )}
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
      {plain && (
        <label className="map-check" style={{ marginTop: "0.75rem" }}>
          <input type="checkbox" checked={showTechnical} onChange={(e) => setShowTechnical(e.target.checked)} /> Show the code names and file lines
        </label>
      )}
    </div>
  );
}

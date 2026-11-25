import { useEffect, useState, useCallback } from "react";

async function api(path, options) {
  const res = await fetch(`/api${path}`, { ...options, headers: { "content-type": "application/json", ...options?.headers } });
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event("docsync:signed-out"));
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Request to ${path} failed`);
  }
  return res.json();
}

const RESOLUTIONS = [
  { status: "corrected", label: "I fixed it" },
  { status: "dismissed", label: "Not an issue" },
  { status: "accepted_uncertain", label: "Keep, still unsure" },
];

const SEVERITY_COLOR = { critical: "var(--status-bad)", warning: "var(--status-review)", info: "var(--status-idle)" };

function Finding({ finding, onResolved, showPage, onOpenPage }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function resolve(status) {
    setBusy(true);
    setError(null);
    try {
      await api(`/findings/${finding.id}`, { method: "PATCH", body: JSON.stringify({ status, note }) });
      onResolved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="finding">
      <div className="finding-head">
        <span className="finding-sev" style={{ color: SEVERITY_COLOR[finding.severity] ?? "var(--text-muted)" }}>{finding.severity}</span>
        {showPage && finding.page_slug && (
          <a className="finding-page" href="#" onClick={(e) => { e.preventDefault(); onOpenPage(finding.page_slug); }}>
            {finding.page_slug}
          </a>
        )}
      </div>
      <p className="finding-msg">{finding.message}</p>
      <input className="finding-note" type="text" placeholder="Why? (required to resolve)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Resolution note" />
      <div className="finding-actions">
        {RESOLUTIONS.map((r) => (
          <button key={r.status} type="button" disabled={busy || note.trim() === ""} onClick={() => resolve(r.status)}>
            {r.label}
          </button>
        ))}
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

/** Open review findings for a run, or for one page when pageSlug is given. */
export default function FindingsList({ runId, pageSlug, onOpenPage, onChanged, refreshKey }) {
  const [findings, setFindings] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api(`/runs/${runId}/findings?status=open`);
      setFindings(pageSlug ? data.findings.filter((f) => f.page_slug === pageSlug) : data.findings);
    } catch (err) {
      setError(err.message);
    }
  }, [runId, pageSlug]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (error) return <p className="error-text">{error}</p>;
  if (!findings || findings.length === 0) return null;

  return (
    <div className="page-list findings">
      <h2>Needs Review ({findings.length})</h2>
      {findings.map((f) => (
        <Finding key={f.id} finding={f} showPage={!pageSlug} onOpenPage={onOpenPage} onResolved={() => { load(); onChanged?.(); }} />
      ))}
    </div>
  );
}

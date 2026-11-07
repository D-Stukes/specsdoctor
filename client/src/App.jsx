import MapView from "./MapView.jsx";
import FindingsList from "./Findings.jsx";
import React, { useEffect, useRef, useState } from "react";
import "./theme.css";

async function api(path, options) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...options?.headers },
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body?.error?.message ?? `Request to ${path} failed`);
    err.code = body?.error?.code;
    err.status = res.status;
    if (res.status === 401 && path !== "/session") window.dispatchEvent(new Event("docsync:signed-out"));
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">[ ]</span>
      <span>DocSync</span>
    </div>
  );
}

function AccessCodeForm({ onSignedIn }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api("/session", { method: "POST", body: JSON.stringify({ code }) });
      onSignedIn();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="shell">
      <div className="card">
        <div className="card-header">
          <Brand />
        </div>
        <div className="eyebrow">Developer access · Private preview</div>
        <h1>Enter access code</h1>
        <p className="lede">
          DocSync turns a public GitHub repository into source-linked documentation drafts, checks what it extracts against the
          code, and flags anything uncertain for human review.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="code">Access code</label>
            <input id="code" type="password" value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="off" />
          </div>
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Checking…" : "Continue"}
          </button>
          {error && <p className="error-text">{error}</p>}
        </form>
        <p className="footnote">Public repositories only · Up to 100 code files · Drafts for human review.</p>
      </div>
    </div>
  );
}

const WRITE_FOR_OPTIONS = [
  { id: "developers", label: "Developers", enabled: true },
  { id: "everyday", label: "Everyday users", enabled: false },
  { id: "both", label: "Both", enabled: false },
];

function RepoForm({ onRunStarted, onOpenRun }) {
  const [repoUrl, setRepoUrl] = useState("");
  const [ref, setRef] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await api("/runs", { method: "POST", body: JSON.stringify({ repo_url: repoUrl, ref: ref || null, intake: null }) });
      onRunStarted(result.run_id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="shell">
      <div className="card">
        <div className="card-header">
          <Brand />
        </div>
        <div className="eyebrow">Source-linked developer docs</div>
        <h1>Make sense of any codebase.</h1>
        <p className="lede">
          Paste a public GitHub repository. DocSync reads the code and writes documentation that cites the exact lines it relies
          on.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="repo_url">GitHub repository</label>
            <input
              id="repo_url"
              type="text"
              placeholder="https://github.com/owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              autoFocus
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="ref">Branch, tag, or commit (optional)</label>
            <input id="ref" type="text" placeholder="main" value={ref} onChange={(e) => setRef(e.target.value)} autoComplete="off" />
          </div>

          <div className="write-for" role="group" aria-label="Write for">
            {WRITE_FOR_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={opt.id === "developers"}
                disabled={!opt.enabled}
                title={opt.enabled ? undefined : "Coming soon"}
              >
                {opt.label}
                {!opt.enabled && " · soon"}
              </button>
            ))}
          </div>

          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Starting…" : "Create docs →"}
          </button>
          {error && <p className="error-text">{error}</p>}
        </form>
        <div className="trust-row">
          <span>✓ Pinned to one commit</span>
          <span>✓ Every claim cites its source</span>
          <span>⚠ Uncertainty flagged for review</span>
        </div>
        <RunList onOpenRun={onOpenRun} />
      </div>
    </div>
  );
}

function formatDuration(ms) {
  if (ms == null) return null;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

function RunList({ onOpenRun }) {
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api("/runs").then((data) => setRuns(data.runs)).catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="error-text">{error}</p>;
  if (!runs) return <p className="lede">Loading…</p>;
  if (runs.length === 0) return null;

  return (
    <div className="page-list">
      <h2>Recent runs</h2>
      {runs.map((r) => (
        <a
          key={r.run_id}
          className="page-link"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onOpenRun(r.run_id);
          }}
        >
          <span className={`dot dot-${r.status === "running" || r.status === "queued" ? "running" : r.status === "failed" ? "failed" : "done"}`} style={{ marginRight: "0.5rem" }} />
          {r.repo.owner}/{r.repo.name} — {r.status} — ${Number(r.cost_usd).toFixed(2)}
          {r.duration_ms != null && ` — ${formatDuration(r.duration_ms)}`}
        </a>
      ))}
    </div>
  );
}

const STATUS_LABEL = { done: "Done", running: "Running", pending: "Pending", failed: "Failed", partial: "Partial", skipped: "Skipped" };

// page_status (Technical Design §2) -> the same dot classes the stage list uses.
const PAGE_STATUS_DOT = {
  generated: "dot-done",
  generation_failed: "dot-failed",
  not_applicable: "dot-skipped",
  not_detected: "dot-skipped",
  unsupported: "dot-skipped",
};

function PageViewer({ runId, slug, onBack }) {
  const [page, setPage] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api(`/runs/${runId}/pages/${slug}`);
    setPage(data);
    setDraft(data.markdown);
  }

  useEffect(() => {
    load();
  }, [runId, slug]);

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      await api(`/runs/${runId}/pages/${slug}`, { method: "PUT", body: JSON.stringify({ base_rev: page.rev, markdown: draft }) });
      await load();
      setEditing(false);
    } catch (err) {
      if (err.status === 409) {
        setError("Someone else saved a newer revision - reload before editing again.");
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleReview() {
    setBusy(true);
    setError(null);
    try {
      await api(`/runs/${runId}/pages/${slug}/review`, { method: "POST", body: JSON.stringify({ rev: page.rev, note: "" }) });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <div className="card" style={{ maxWidth: 720 }}>
        <div className="card-header">
          <Brand />
          <button className="btn-primary" style={{ width: "auto" }} onClick={onBack}>
            ← Back
          </button>
        </div>
        {!page ? (
          <p className="lede">Loading…</p>
        ) : (
          <>
            <div className="status-pill">
              <span className={`dot ${page.checks.fresh ? "dot-done" : "dot-pending"}`} />
              rev {page.rev} · {page.origin} · {page.checks.fresh ? "checks fresh" : "checks stale"}
              {page.reviewed_at && " · reviewed"}
            </div>
            {error && <p className="error-text">{error}</p>}
            {editing ? (
              <>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={16}
                  style={{ width: "100%", background: "var(--surface-raised)", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 12.5, border: "1px solid var(--hairline-hover)", borderRadius: 10, padding: "0.75rem" }}
                />
                <div className="write-for" style={{ marginTop: "0.75rem" }}>
                  <button type="button" className="btn-primary" style={{ width: "auto" }} disabled={busy} onClick={handleSave}>
                    {busy ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => { setDraft(page.markdown); setEditing(false); }}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <FindingsList runId={runId} pageSlug={slug} refreshKey={page.rev} />
                <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--text)", lineHeight: 1.6 }}>
                  {page.markdown || "(this page has been emptied)"}
                </pre>
                <div className="write-for">
                  <button type="button" className="btn-primary" style={{ width: "auto" }} onClick={() => setEditing(true)}>
                    Edit
                  </button>
                  <button type="button" disabled={busy || Boolean(page.reviewed_at)} onClick={handleReview}>
                    {page.reviewed_at ? "Reviewed" : busy ? "Marking…" : "Mark reviewed"}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RunProgress({ runId, onBackToList }) {
  const [run, setRun] = useState(null);
  const [pages, setPages] = useState([]);
  const [error, setError] = useState(null);
  const [openSlug, setOpenSlug] = useState(null);
  const [graph, setGraph] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    async function poll() {
      try {
        const data = await api(`/runs/${runId}`);
        setRun(data);
        if (!["queued", "running"].includes(data.status)) {
          const pageData = await api(`/runs/${runId}/pages`);
          setPages(pageData.pages);
        } else {
          timerRef.current = setTimeout(poll, 2000);
        }
      } catch (err) {
        setError(err.message);
      }
    }
    poll();
    return () => clearTimeout(timerRef.current);
  }, [runId]);

  async function refreshPages() {
    try {
      setPages((await api(`/runs/${runId}/pages`)).pages);
    } catch (err) {
      setError(err.message);
    }
  }

  // Coming back from a page (where an edit may have added findings) or resolving one: refresh counts.
  useEffect(() => {
    if (!openSlug && run && !["queued", "running"].includes(run.status)) refreshPages();
  }, [openSlug]);

  async function openMap() {
    setError(null);
    try {
      setGraph(await api(`/runs/${runId}/graph`));
      setShowMap(true);
    } catch (err) {
      setError(err.message);
    }
  }

  if (openSlug) return <PageViewer runId={runId} slug={openSlug} onBack={() => setOpenSlug(null)} />;
  if (showMap && graph) {
    return <MapView runId={runId} graph={graph} onBack={() => setShowMap(false)} onOpenPage={(slug) => { setShowMap(false); setOpenSlug(slug); }} />;
  }

  return (
    <div className="shell">
      <div className="card">
        <div className="card-header">
          <Brand />
          <button className="btn-primary" style={{ width: "auto" }} onClick={onBackToList}>
            ← All runs
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
        {!run ? (
          <p className="lede">Starting…</p>
        ) : (
          <>
            <div className="run-header">
              <h1>
                {run.repo.owner}/{run.repo.name}
              </h1>
              {run.resolved_sha && <span className="sha">{run.resolved_sha.slice(0, 7)}</span>}
            </div>
            <div className="status-pill">
              <span className={`dot ${run.status === "running" || run.status === "queued" ? "dot-running" : run.status === "failed" ? "dot-failed" : "dot-done"}`} />
              {run.status.replace(/_/g, " ")}
            </div>

            <div className="stage-list">
              {run.stages.map((s) => (
                <div className="stage-row" key={s.stage}>
                  <span className={`dot dot-${s.status}`} />
                  <span className="stage-name">{s.stage}</span>
                  <span className="stage-status">{STATUS_LABEL[s.status] ?? s.status}</span>
                  <span className="stage-count">
                    {s.items_done}
                    {s.items_total != null ? `/${s.items_total}` : ""}
                  </span>
                </div>
              ))}
            </div>

            <div className="cost-row">
              <span>Cost</span>
              <span>
                ${run.cost_usd.toFixed(2)} / ${run.budget_cap_usd.toFixed(2)} budget
              </span>
            </div>
            {run.duration_ms != null && (
              <div className="cost-row">
                <span>Time</span>
                <span>{formatDuration(run.duration_ms)}</span>
              </div>
            )}

            {run.failure && <p className="error-text">{run.failure.code}: {run.failure.detail}</p>}

            <FindingsList runId={runId} onOpenPage={setOpenSlug} onChanged={refreshPages} refreshKey={pages.map((p) => p.open_findings).join(",")} />

            {pages.length > 0 && (
              <div className="page-list">
                <h2>Generated pages</h2>
                {pages.map((p) => (
                  <a key={p.slug} className="page-link" href="#" onClick={(e) => { e.preventDefault(); setOpenSlug(p.slug); }}>
                    <span className={`dot ${PAGE_STATUS_DOT[p.status] ?? "dot-pending"}`} style={{ marginRight: "0.5rem" }} />
                    {p.title}
                    <span className="stage-status" style={{ marginLeft: "0.5rem" }}>{p.status.replace(/_/g, " ")}</span>
                    {p.open_findings > 0 && <span className="finding-badge">{p.open_findings} to review</span>}
                  </a>
                ))}
              </div>
            )}

            {(run.status === "complete" || run.status === "complete_with_errors") && (
              <div className="page-list">
                <h2>Repo map</h2>
                <a className="page-link" href="#" onClick={(e) => { e.preventDefault(); openMap(); }}>
                  Open the interactive map
                </a>
              </div>
            )}

            {(run.status === "complete" || run.status === "complete_with_errors") && pages.length > 0 && (
              <div className="page-list">
                <h2>Export</h2>
                <a className="page-link" href={`/api/runs/${runId}/export.zip`} download>
                  Download docs (.zip)
                </a>
                <a className="page-link" href={`/api/runs/${runId}/export.zip?include_review=true`} download>
                  Download docs + review.md (.zip)
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [checking, setChecking] = useState(true);
  const [runId, setRunId] = useState(null);

  useEffect(() => {
    // A reload keeps the session cookie; ask the server instead of assuming we're signed out.
    api("/runs?limit=1")
      .then(() => setSignedIn(true))
      .catch(() => {})
      .finally(() => setChecking(false));
    const onSignedOut = () => {
      setSignedIn(false);
      setRunId(null);
    };
    window.addEventListener("docsync:signed-out", onSignedOut);
    return () => window.removeEventListener("docsync:signed-out", onSignedOut);
  }, []);

  if (checking) return null;
  if (!signedIn) return <AccessCodeForm onSignedIn={() => setSignedIn(true)} />;
  if (!runId) return <RepoForm onRunStarted={setRunId} onOpenRun={setRunId} />;
  return <RunProgress runId={runId} onBackToList={() => setRunId(null)} />;
}

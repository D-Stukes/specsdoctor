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

function RepoForm({ onRunStarted }) {
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
      </div>
    </div>
  );
}

const STATUS_LABEL = { done: "Done", running: "Running", pending: "Pending", failed: "Failed", partial: "Partial", skipped: "Skipped" };

function PageViewer({ runId, slug, onBack }) {
  const [page, setPage] = useState(null);

  useEffect(() => {
    api(`/runs/${runId}/pages/${slug}`).then(setPage);
  }, [runId, slug]);

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
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--text)", lineHeight: 1.6 }}>
            {page.markdown}
          </pre>
        )}
      </div>
    </div>
  );
}

function RunProgress({ runId }) {
  const [run, setRun] = useState(null);
  const [pages, setPages] = useState([]);
  const [error, setError] = useState(null);
  const [openSlug, setOpenSlug] = useState(null);
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

  if (openSlug) return <PageViewer runId={runId} slug={openSlug} onBack={() => setOpenSlug(null)} />;

  return (
    <div className="shell">
      <div className="card">
        <div className="card-header">
          <Brand />
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

            {run.failure && <p className="error-text">{run.failure.code}: {run.failure.detail}</p>}

            {pages.length > 0 && (
              <div className="page-list">
                <h2>Generated pages</h2>
                {pages.map((p) => (
                  <a key={p.slug} className="page-link" href="#" onClick={(e) => { e.preventDefault(); setOpenSlug(p.slug); }}>
                    {p.title}
                  </a>
                ))}
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
  const [runId, setRunId] = useState(null);

  if (!signedIn) return <AccessCodeForm onSignedIn={() => setSignedIn(true)} />;
  if (!runId) return <RepoForm onRunStarted={setRunId} />;
  return <RunProgress runId={runId} />;
}

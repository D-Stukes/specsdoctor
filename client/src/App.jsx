import MapView from "./MapView.jsx";
import FindingsList from "./Findings.jsx";
import SharedRunView from "./SharedRunView.jsx";
import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./theme.css";

const SHARE_PATH = /^\/share\/([\w-]+)$/;

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
      <span>SpecsDoctor</span>
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
          SpecsDoctor turns a public GitHub repository into source-linked documentation drafts, checks what it extracts against the
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
        <p className="footnote">Public repositories only · Drafts for human review.</p>
      </div>
    </div>
  );
}

// Task 12 (T35): plain-language user guides for the app's own end users, alongside the always-on
// developer docs. "everyday"/"both" only cost extra when actually picked (see pipeline.js) - the
// default stays "developers", today's only behavior, for anyone who doesn't touch this control.
const WRITE_FOR_OPTIONS = [
  { id: "developers", label: "Developers" },
  { id: "everyday", label: "Everyday users" },
  { id: "both", label: "Both" },
];

function RepoForm({ onRunStarted, onOpenRun }) {
  const [repoUrl, setRepoUrl] = useState("");
  const [ref, setRef] = useState("");
  const [writeFor, setWriteFor] = useState("developers");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await api("/runs", { method: "POST", body: JSON.stringify({ repo_url: repoUrl, ref: ref || null, write_for: writeFor, intake: null }) });
      onRunStarted(result.run_id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="shell">
      <div className="card home-card">
        <div className="card-header">
          <Brand />
        </div>
        <div className="eyebrow">Source-linked developer docs</div>
        <h1>Make sense of any codebase.</h1>
        <p className="lede">
          Paste a public GitHub repository. SpecsDoctor reads the code and writes documentation that cites the exact lines it relies
          on.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="repo_url">Enter a GitHub repository</label>
            <input
              id="repo_url"
              type="text"
              placeholder="e.g. https://github.com/owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              autoFocus
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="ref">Branch (optional)</label>
            <input id="ref" type="text" placeholder="main" value={ref} onChange={(e) => setRef(e.target.value)} autoComplete="off" />
          </div>

          <div className="write-for" role="group" aria-label="Write for">
            {WRITE_FOR_OPTIONS.map((opt) => (
              <button key={opt.id} type="button" aria-pressed={opt.id === writeFor} onClick={() => setWriteFor(opt.id)}>
                {opt.label}
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

// Mirrors server/src/chat/tools.js's isScreen predicate - keep both definitions of "screen" in
// sync if this ever changes (the two can't share a module: one runs in the browser, one in Node).
const isScreen = (n) => n.layer === "frontend" && n.kind !== "module";

/** A fetched graph is only trustworthy once it has the shape every consumer (this, MapView) assumes. */
function isValidGraph(g) {
  return Boolean(g) && Array.isArray(g.nodes) && Array.isArray(g.groups);
}

/** The shape of the codebase, straight from the graph's own facts - what the landing dashboard leads with. */
function graphStats(graph) {
  const count = (f) => graph.nodes.filter(f).length;
  return {
    actions: count((n) => n.kind === "endpoint"),
    tables: count((n) => n.kind === "table"),
    screens: count(isScreen),
    files: count((n) => n.kind === "module"),
    areas: graph.groups,
  };
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
    <details className="page-list recent-runs" open>
      <summary>
        <h2>Recent runs <span className="dash-area-count">{runs.length}</span></h2>
        {runs.length > 4 && <span className="scroll-hint">scroll for more</span>}
      </summary>
      <div className="scroll-list">
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
    </details>
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

// Renders a generated doc page as formatted text. Links into a GitHub file
// (source citations) become "View source" chips that open in a new tab.
function DocLink({ href = "", children }) {
  const isSource = /github\.com\/[^/]+\/[^/]+\/blob\//.test(href);
  if (isSource) {
    return (
      <a className="source-link" href={href} target="_blank" rel="noopener noreferrer" title="Open this line on GitHub">
        <span aria-hidden="true">{"</>"}</span> {children} <span className="source-link-arrow" aria-hidden="true">↗</span>
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function DocPage({ markdown }) {
  if (!markdown) return <p className="lede">(this page has been emptied)</p>;
  return (
    <article className="doc-page">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: DocLink }}>
        {markdown}
      </ReactMarkdown>
    </article>
  );
}

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
    <div className="shell shell-results">
      <div className="card card-reading">
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
                <DocPage markdown={page.markdown} />
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

/** The pipeline's stage list plus cost/duration - shared so the "running" and "finished" (collapsed-into-details) views can never drift apart. */
function BuildStatus({ run }) {
  return (
    <>
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
        <span>
          Cost ${run.cost_usd.toFixed(2)} / ${run.budget_cap_usd.toFixed(2)} budget
        </span>
        {run.duration_ms != null && <span>Time {formatDuration(run.duration_ms)}</span>}
      </div>
    </>
  );
}

// Idea 5 (LOG.md's "wow factor" brainstorm): turn the public share link on or off for this run.
// `shareUrl` comes from the same GET /runs/:id poll RunProgress already does - no extra fetch.
// Groups generated pages for the report: project-wide pages (Overview, API endpoints...)
// first, then one collapsed group per project area (the first two folders of the path,
// e.g. server/src or fixtures/fixture-pern-mini). Inside a group, pages show the rest of the path.
function pageGroupKey(title) {
  if (!title.includes("/")) return "Project overview";
  const parts = title.split("/");
  return parts.length > 2 ? parts.slice(0, 2).join("/") : parts[0];
}
function pageLabelInGroup(title, key) {
  return key === "Project overview" ? title : title.slice(key.length + 1);
}
function groupPagesByFolder(pages) {
  const groups = new Map();
  for (const p of pages) {
    const key = pageGroupKey(p.title);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const overview = groups.get("Project overview");
  groups.delete("Project overview");
  const rest = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return overview ? [["Project overview", overview], ...rest] : rest;
}

// Groups mapped areas by their top-level folder (client, server, fixtures...) so the
// dashboard shows a short, expandable list instead of one long wall of chips.
function groupAreasByFolder(areas) {
  const groups = new Map();
  for (const a of areas) {
    const top = (a.name || "").split("/")[0] || "other";
    if (!groups.has(top)) groups.set(top, []);
    groups.get(top).push(a);
  }
  return [...groups.entries()].sort((x, y) => x[0].localeCompare(y[0]));
}

function ShareControl({ runId, shareUrl }) {
  const [url, setUrl] = useState(shareUrl);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => setUrl(shareUrl), [shareUrl]);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const { share_url } = await api(`/runs/${runId}/share`, { method: "POST" });
      setUrl(share_url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      await api(`/runs/${runId}/share`, { method: "DELETE" });
      setUrl(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard access denied or unavailable - the URL is still shown as selectable text
    }
  }

  if (!url) {
    return (
      <button type="button" className="action-link" onClick={enable} disabled={busy}>
        {busy ? "Creating link…" : "Share this run"}
      </button>
    );
  }
  return (
    <div className="share-control">
      <input className="map-input" type="text" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Public share link" />
      <button type="button" className="btn-primary" style={{ width: "auto" }} onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
      <button type="button" className="btn-primary" style={{ width: "auto", background: "var(--surface-raised)", color: "var(--text)" }} onClick={disable} disabled={busy}>
        Stop sharing
      </button>
      {error && <span className="map-note map-note-error">{error}</span>}
    </div>
  );
}

function RunProgress({ runId, onBackToList }) {
  const [run, setRun] = useState(null);
  const [pages, setPages] = useState([]);
  const [error, setError] = useState(null);
  const [openSlug, setOpenSlug] = useState(null);
  const [graph, setGraph] = useState(null);
  const [graphError, setGraphError] = useState(null);
  const [tours, setTours] = useState([]);
  const [showMap, setShowMap] = useState(false);
  const timerRef = useRef(null);
  const graphPromiseRef = useRef(null); // de-dupes a fetch already in flight, whoever started it
  const stats = useMemo(() => (graph ? graphStats(graph) : null), [graph]);

  // Shared by the background prefetch and openMap(), so the two never race each other into firing
  // duplicate requests, and a malformed response is never mistaken for a usable graph (it used to
  // be: "truthy" and "valid" were treated as the same thing, so a bad payload could get stuck in
  // state forever with no way to retry).
  function loadGraph() {
    if (!graphPromiseRef.current) {
      graphPromiseRef.current = api(`/runs/${runId}/graph`)
        .then((g) => {
          if (!isValidGraph(g)) throw new Error("The map data for this run came back incomplete.");
          return g;
        })
        .finally(() => {
          graphPromiseRef.current = null;
        });
    }
    return graphPromiseRef.current;
  }

  function retryGraph() {
    setGraphError(null);
    loadGraph().then(setGraph).catch((err) => setGraphError(err.message));
  }

  useEffect(() => {
    async function poll() {
      try {
        const data = await api(`/runs/${runId}`);
        setRun(data);
        if (!["queued", "running"].includes(data.status)) {
          const pageData = await api(`/runs/${runId}/pages`);
          setPages(pageData.pages);
          if (data.status === "complete" || data.status === "complete_with_errors") {
            loadGraph().then(setGraph).catch((err) => setGraphError(err.message)); // the dashboard's stats
          }
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
      const g = graph ?? (await loadGraph());
      if (!graph) setGraph(g);
      setGraphError(null);
      setTours((await api(`/runs/${runId}/tours`).catch(() => ({ tours: [] }))).tours);
      setShowMap(true);
    } catch (err) {
      setError(err.message);
    }
  }

  if (openSlug) return <PageViewer runId={runId} slug={openSlug} onBack={() => setOpenSlug(null)} />;
  if (showMap && graph) {
    return <MapView runId={runId} graph={graph} tours={tours} onBack={() => setShowMap(false)} onOpenPage={(slug) => { setShowMap(false); setOpenSlug(slug); }} />;
  }

  const isDone = run && (run.status === "complete" || run.status === "complete_with_errors");
  const overviewPage = pages.find((p) => p.slug === "overview");

  return (
    <div className="shell">
      <div className="card">
        <div className="card-header">
          <Brand />
          <button className="btn-primary" style={{ width: "auto" }} onClick={onBackToList}>
            ← Analyze another repo
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

            {run.failure && <p className="error-text">{run.failure.code}: {run.failure.detail}</p>}

            {isDone && (
              <div className="dashboard">
                <h2>At a glance: what SpecsDoctor scanned</h2>
                {!stats ? (
                  graphError ? (
                    <p className="lede">
                      {graphError}{" "}
                      <a href="#" onClick={(e) => { e.preventDefault(); retryGraph(); }}>
                        Retry
                      </a>
                    </p>
                  ) : (
                    <p className="lede">Putting the overview together…</p>
                  )
                ) : (
                  <>
                    <p className="dash-summary">
                      <span title="Web addresses the app's server answers, like GET /api/habits"><strong>{stats.actions}</strong> API endpoints</span>
                      <span title="Tables where the app stores its data"><strong>{stats.tables}</strong> database tables</span>
                      <span title="Pages and components people see in the app"><strong>{stats.screens}</strong> screens</span>
                      <span title="Code files SpecsDoctor read and connected"><strong>{stats.files}</strong> code files</span>
                    </p>
                    {stats.areas.length > 0 && (
                      <details className="dash-mapped">
                      <summary>Mapped folders <span className="dash-area-count">{stats.areas.length}</span></summary>
                      <div className="dash-areas">
                        {groupAreasByFolder(stats.areas).map(([folder, areas]) => (
                          <details key={folder} className="dash-area-group">
                            <summary>
                              {folder} <span className="dash-area-count">{areas.length}</span>
                            </summary>
                            <div className="dash-area-chips">
                              {areas.map((a) => (
                                <span key={a.id} className="dash-area-chip" title={a.summary}>
                                  {a.name}
                                </span>
                              ))}
                            </div>
                          </details>
                        ))}
                      </div>
                      </details>
                    )}
                  </>
                )}
                <div className="dash-actions">
                  <button type="button" className="action-link" onClick={openMap}>
                    Open the map →
                  </button>
                  {overviewPage && (
                    <a className="action-link" href="#" onClick={(e) => { e.preventDefault(); setOpenSlug(overviewPage.slug); }}>
                      Read the full overview
                    </a>
                  )}
                  <ShareControl runId={run.run_id} shareUrl={run.share_url} />
                </div>
              </div>
            )}

            {isDone ? (
              <details className="build-details">
                <summary>Build details {run.stages.length > 3 && <span className="scroll-hint">scroll for more</span>}</summary>
                <BuildStatus run={run} />
              </details>
            ) : (
              <BuildStatus run={run} />
            )}

            <FindingsList runId={runId} onOpenPage={setOpenSlug} onChanged={refreshPages} refreshKey={pages.map((p) => p.open_findings).join(",")} />

            {pages.length > 0 && (
              <div className="page-list">
                <h2>Generated pages</h2>
                {groupPagesByFolder(pages).map(([folder, group]) => (
                  <details key={folder} className="page-group" open={folder === "Project overview"}>
                    <summary>
                      {folder} <span className="dash-area-count">{group.length}</span>
                      {group.length > 5 && <span className="scroll-hint">scroll for more</span>}
                    </summary>
                    <div className="scroll-list">
                      {group.map((p) => (
                        <a key={p.slug} className="page-link" href="#" onClick={(e) => { e.preventDefault(); setOpenSlug(p.slug); }}>
                          <span className={`dot ${PAGE_STATUS_DOT[p.status] ?? "dot-pending"}`} style={{ marginRight: "0.5rem" }} />
                          {pageLabelInGroup(p.title, folder)}
                          <span className="stage-status" style={{ marginLeft: "0.5rem" }}>{p.status.replace(/_/g, " ")}</span>
                          {p.open_findings > 0 && <span className="finding-badge">{p.open_findings} to review</span>}
                          <span className="page-view">View →</span>
                        </a>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            )}

            {isDone && pages.length > 0 && (
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
  // Idea 5's public share link bypasses sign-in entirely - checked before any of the normal
  // access-code flow's hooks run, since a visitor here was never meant to need a session.
  const shareMatch = typeof window !== "undefined" ? window.location.pathname.match(SHARE_PATH) : null;
  if (shareMatch) return <SharedRunView token={shareMatch[1]} />;

  const [signedIn, setSignedIn] = useState(false);
  const [checking, setChecking] = useState(true);
  // The open report lives in the URL (#run=<id>) so a refresh keeps you on what you just ran.
  const [runId, setRunIdState] = useState(() => {
    const m = typeof window !== "undefined" ? window.location.hash.match(/^#run=([\w-]+)$/) : null;
    return m ? m[1] : null;
  });
  const setRunId = (id) => {
    setRunIdState(id);
    const url = id ? `#run=${id}` : window.location.pathname + window.location.search;
    window.history.replaceState(null, "", url);
  };

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

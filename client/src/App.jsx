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
// Developer docs are always written; the second choice adds plain-language guides on top.
// ("everyday" and "both" did the same thing in pipeline.js, so the UI offers just these two.)
const WRITE_FOR_OPTIONS = [
  {
    id: "developers",
    label: "Technical",
    hint: "Click Create Docs to make technical docs for people who work on the code and those who write its documentation. These include the architecture, API endpoints, data model, and an explanation page for each code file. See the samples below.",
  },
  {
    id: "both",
    label: "Plain English",
    hint: "Click Create Docs to make everything in the technical version, plus short, plain-English steps that explain what each screen is for and how to use it. Takes a little longer. See the samples below.",
  },
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
      <div className="report-layout has-side">
      <div className="card card-reading report-main home-card">
        <div className="card-header home-header">
          <Brand />
          <img className="home-logo-art" src="/assets/specsdoctor-logo-art.png" alt="" aria-hidden="true" />
        </div>
        <ul className="feature-list">
          <li>Source-linked developer docs</li>
          <li>Make sense of any codebase</li>
          <li>Read-only: never changes your repo</li>
          <li>Every claim cites its source</li>
          <li>Uncertainty flagged for review</li>
        </ul>
        <p className="lede">
          <strong>Instructions:</strong> Paste a public GitHub repository link into the box below. SpecsDoctor reads the code and explains what it does. Its claims about the code link to the
          exact lines they came from, so you can check them yourself.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="repo_url">Enter a GitHub repository:</label>
            <input
              id="repo_url"
              type="text"
              placeholder="e.g. https://github.com/owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              autoFocus
              autoComplete="off"
            />
            <p className="size-note">
              Note: Analysis works for repos with up to 100 code files. (Larger repos may time out.)
            </p>
          </div>
          <div className="field">
            <label htmlFor="ref">Enter the branch you want to analyze:</label>
            <input id="ref" type="text" placeholder="Main branch (default unless a different branch is indicated)" value={ref} onChange={(e) => setRef(e.target.value)} autoComplete="off" />
          </div>

          <div className="field write-for-field">
            <div className="write-for-row">
            <span className="write-for-label">Select the version you prefer:</span>
            <div className="write-for" role="group" aria-label="Write the docs for">
              {WRITE_FOR_OPTIONS.map((opt) => (
                <button key={opt.id} type="button" className={`wf-${opt.id}`} aria-pressed={opt.id === writeFor} onClick={() => setWriteFor(opt.id)}>
                  {opt.label}
                </button>
              ))}
            </div>
            </div>
            <p className="write-for-hint">{WRITE_FOR_OPTIONS.find((o) => o.id === writeFor)?.hint}</p>
          </div>

          <div className="version-sample" aria-label="Example of each version">
            <div className="version-sample-cols">
              <div className={`version-col wf-developers ${writeFor === "developers" ? "version-col-on" : ""}`}>
                <span className="version-col-name">Technical</span>
                <p><code>POST /api/habits</code> creates a habit. Requires sign-in (<code>requireAuth</code>). Returns <code>201</code>, or <code>400</code> "name is required".</p>
              </div>
              <div className={`version-col wf-both ${writeFor === "both" ? "version-col-on" : ""}`}>
                <span className="version-col-name">Plain English</span>
                <p>Open the app and select "Add habit." Type a name and save it. If the name is blank, the app asks for one.</p>
              </div>
            </div>
          </div>

          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Starting…" : (
              <span className="btn-label">
                Create Docs
                <svg className="btn-arrow" viewBox="0 0 22 12" aria-hidden="true">
                  <path d="M1 6h14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                  <path d="M14 1.5L21 6 14 10.5Z" fill="currentColor" />
                </svg>
              </span>
            )}
          </button>
          {error && <p className="error-text">{error}</p>}
        </form>
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

// Friendlier words for run statuses. A stopped run is named by its real reason, never "failed":
// a time-out or the size limit is the app's limit, not an error.
const RUN_STATUS_TEXT = { complete_with_errors: "complete (some parts partial)" };
const STOP_REASON = {
  interrupted: { label: "timed out", tip: "Analysis timed out. Try a smaller repo or branch.", limit: true },
  queue_timeout: { label: "timed out", tip: "Analysis timed out. Try a smaller repo or branch.", limit: true },
  repo_too_large: { label: "too large", tip: "Over the 100-code-file limit. Click to see the exact count.", limit: true },
  repo_not_found: { label: "repo not found", tip: "Check that the repo link is correct and the repo is public.", limit: true },
  ref_not_found: { label: "branch not found", tip: "Check the branch name. Leave it blank to use the main branch.", limit: true },
  tarball_too_large: { label: "too large", tip: "This repo's download is over the 100 MB limit, usually because of large images or videos. Try a smaller repo or a branch without them.", limit: true },
  too_many_archive_entries: { label: "too large", tip: "This repo has too many files to download. Try a smaller repo or branch.", limit: true },
  github_rate_limited: { label: "GitHub busy", tip: "GitHub's request limit is used up for now. Please try again in a few minutes.", limit: true },
};
const UNEXPECTED = { label: "unexpected error", tip: "Something went wrong on SpecsDoctor's side. Please try again. If it happens again, try a different repo." };
function runLabel(status, failureCode) {
  if (status === "failed") return (STOP_REASON[failureCode] ?? UNEXPECTED).label;
  return RUN_STATUS_TEXT[status] ?? status.replace(/_/g, " ");
}
function runDot(status, failureCode) {
  if (status === "running" || status === "queued") return "dot-running";
  if (status === "failed") return STOP_REASON[failureCode]?.limit ? "dot-limit" : "dot-failed";
  return "dot-done";
}

// Home screen's right-hand panel: recent runs, in the same bridge + panel as the report.
function RunList({ onOpenRun }) {
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api("/runs").then((data) => setRuns(data.runs)).catch((err) => setError(err.message));
  }, []);

  return (
    <>
      <div className="report-connector" aria-hidden="true" />
      <aside className="card report-side">
        <h2>
          Recent Runs
        </h2>
        {error ? (
          <p className="error-text">{error}</p>
        ) : !runs ? (
          <p className="report-side-note">Loading…</p>
        ) : runs.length === 0 ? (
          <p className="report-side-note">Repos you analyze will show up here, so you can reopen their reports any time.</p>
        ) : (
          <>
            <p className="report-side-note">Click a run to open its report.</p>
            <div className="report-side-list">
              <div className="scroll-list">
                {runs.map((r) => (
                  <a
                    key={r.run_id}
                    className={`page-link run-row ${r.status === "failed" ? "run-failed" : ""}`}
                    href="#"
                    title={r.status === "failed" ? (STOP_REASON[r.failure_code] ?? UNEXPECTED).tip : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      onOpenRun(r.run_id);
                    }}
                  >
                    <span className={`dot ${runDot(r.status, r.failure_code)}`} />
                    <span className="run-row-text">
                      <span className="run-row-name">{r.repo.owner}/{r.repo.name}</span>
                      <span className="run-row-meta">
                        {runLabel(r.status, r.failure_code)}
                        {r.duration_ms != null && r.status !== "failed" && ` · ${formatDuration(r.duration_ms)}`}
                      </span>
                    </span>
                    <span className="page-view">Open →</span>
                  </a>
                ))}
              </div>
            </div>
          </>
        )}
      </aside>
    </>
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

// Code-file pages start "# client/x.js" then "## client/x.js" - show that name only once.
function dropRepeatedTitle(md) {
  const m = md.match(/^# (.+)\n+## (.+)\n/);
  return m && m[1].trim() === m[2].trim() ? md.replace(/^# .+\n+/, "") : md;
}

// Section headings end with a colon ("What this app does:"), except a code file's name.
function colonHeadings(md, skipFirst) {
  let first = true;
  return md.replace(/^## (.+)$/gm, (line, text) => {
    const isFirst = first;
    first = false;
    if ((skipFirst && isFirst) || /[:?.!]$/.test(text.trim())) return line;
    return `## ${text.trim()}:`;
  });
}

function DocPage({ markdown }) {
  if (!markdown) return <p className="lede">(this page has been emptied)</p>;
  const trimmed = dropRepeatedTitle(markdown);
  markdown = colonHeadings(trimmed, trimmed !== markdown);
  return (
    <article className="doc-page">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: DocLink }}>
        {markdown}
      </ReactMarkdown>
    </article>
  );
}

function PageViewer({ runId, slug, pages = [], onOpen, onBack }) {
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
    setEditing(false);
    setError(null);
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
      <div className="report-layout has-side page-layout">
      <div className="card card-reading report-main page-list-main">
        <div className="card-header">
          <Brand />
          <button className="btn-header" onClick={onBack}>
            ← Back to report
          </button>
        </div>
        <div className="page-list-scroll">
          <PagesList pages={pages} currentSlug={slug} onOpen={onOpen} placeholder="Loading pages…" />
        </div>
      </div>
      <div className="report-connector" aria-hidden="true" />
      <article className="card report-side page-doc-side">
        <div className="page-scroll" key={slug}>
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
      </article>
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
        {/* Run cost is the app owner's AI cost, not the visitor's: kept in the database (runs.cost_usd), not shown here. */}
        {run.duration_ms != null && <span>Time {formatDuration(run.duration_ms)}</span>}
      </div>
    </>
  );
}

// Idea 5 (LOG.md's "wow factor" brainstorm): turn the public share link on or off for this run.
// `shareUrl` comes from the same GET /runs/:id poll RunProgress already does - no extra fetch.
// Builds a two-level tree for Generated pages: project-wide pages first, then each top
// folder (client, server, fixtures...). Inside a top folder: its own pages, then one
// collapsible subfolder per second-level folder (src, scripts, test...), so roots aren't repeated.
// "API endpoints" -> "API Endpoints"; small joining words stay lowercase unless first.
const SMALL_WORDS = new Set(["a", "an", "and", "the", "of", "for", "to", "in", "on", "by"]);
function titleCase(t) {
  return t.replace(/[A-Za-z][\w'-]*/g, (w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)));
}

function buildPageTree(pages) {
  const overview = { name: "Project Overview", pages: [], children: [] };
  const tops = new Map();
  for (const p of pages) {
    const parts = p.title.split("/");
    if (parts.length === 1) { overview.pages.push({ ...p, label: titleCase(p.title) }); continue; }
    const top = parts[0];
    if (!tops.has(top)) tops.set(top, { name: top, pages: [], childMap: new Map() });
    const node = tops.get(top);
    if (parts.length === 2) { node.pages.push({ ...p, label: parts[1] }); continue; }
    const sub = parts[1];
    if (!node.childMap.has(sub)) node.childMap.set(sub, { name: sub, pages: [], children: [] });
    node.childMap.get(sub).pages.push({ ...p, label: parts.slice(2).join("/") });
  }
  const rest = [...tops.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((n) => ({ name: n.name, pages: n.pages, children: [...n.childMap.values()].sort((a, b) => a.name.localeCompare(b.name)) }));
  return overview.pages.length ? [overview, ...rest] : rest;
}

const capitalize = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

function countPages(node) {
  return node.pages.length + node.children.reduce((sum, c) => sum + countPages(c), 0);
}

function containsSlug(node, slug) {
  return node.pages.some((p) => p.slug === slug) || node.children.some((c) => containsSlug(c, slug));
}

// The "Generated pages" panel to the right of the main card, joined by the photo-toned bridge.
// Shared by the report and the page viewer so both screens look and behave the same.
function SidePages({ pages, currentSlug, onOpen, placeholder }) {
  return (
    <>
      <div className="report-connector" aria-hidden="true" />
      <aside className="card report-side">
        <PagesList pages={pages} currentSlug={currentSlug} onOpen={onOpen} placeholder={placeholder} />
      </aside>
    </>
  );
}

// "Generated Pages": the overview list, then folders in columns. Used in the report's side panel
// and, once a page is open, as the main (left) card - so you always pick on the left, read on the right.
function PagesList({ pages, currentSlug, onOpen, placeholder }) {
  return (
    <>
        <h2 className="pages-title">Generated Pages</h2>
        {pages.length > 0 ? (
          <>
            <p className="report-side-note">
              {currentSlug ? "You're reading the highlighted page. Click another to switch." : "Click any page to read it. Faded pages are topics SpecsDoctor found nothing for."}
            </p>
            <div className="report-side-list">
              {(() => {
                const tree = buildPageTree(pages);
                const hasOverview = tree[0]?.name === "Project Overview";
                const overview = hasOverview ? tree[0] : null;
                const folders = hasOverview ? tree.slice(1) : tree;
                return (
                  <>
                    {overview && <PageFolder node={overview} open={!currentSlug || containsSlug(overview, currentSlug)} currentSlug={currentSlug} onOpen={onOpen} />}
                    {folders.length > 0 && (
                      <>
                        <h3 className="folder-heading">More Pages by Folder <span>(click to open)</span></h3>
                        <div className="folder-grid">
                          {folders.map((node) => (
                            <PageFolder key={node.name} node={node} currentSlug={currentSlug} onOpen={onOpen} />
                          ))}
                        </div>
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          </>
        ) : (
          <p className="report-side-note">{placeholder}</p>
        )}
    </>
  );
}

function PageFolder({ node, open = false, currentSlug, onOpen }) {
  return (
    <details className="page-group" open={open || (currentSlug != null && containsSlug(node, currentSlug))}>
      <summary>
        {capitalize(node.name)} <span className="dash-area-count">{countPages(node)}</span>
      </summary>
      <div className="page-group-body">
        {node.pages.length > 0 && (
          <div className="scroll-list">
            {node.pages.map((p) => (
              <a key={p.slug} className={`page-link ${p.empty ? "page-empty" : ""} ${p.slug === currentSlug ? "page-current" : ""}`} aria-current={p.slug === currentSlug ? "page" : undefined} href="#" onClick={(e) => { e.preventDefault(); onOpen(p.slug); }} title={p.empty ? "SpecsDoctor found nothing for this topic in this repo" : undefined}>
                <span className={`dot ${p.empty ? "dot-empty" : PAGE_STATUS_DOT[p.status] ?? "dot-pending"}`} style={{ marginRight: "0.5rem" }} />
                {p.label}
                <span className="stage-status" style={{ marginLeft: "0.5rem" }}>{p.empty ? "nothing found" : p.status ? p.status.replace(/_/g, " ") : "pending analysis"}</span>
                {p.open_findings > 0 && <span className="finding-badge">{p.open_findings} to review</span>}
                <span className="page-view">View →</span>
              </a>
            ))}
          </div>
        )}
        {node.children.map((c) => (
          <PageFolder key={c.name} node={c} currentSlug={currentSlug} onOpen={onOpen} />
        ))}
      </div>
    </details>
  );
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
        {busy ? "Creating link…" : "Share This Run"}
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
        if (!["queued", "running"].includes(data.status)) {
          // Fetch pages before showing the run, so the report appears in its final
          // two-panel layout at once instead of flashing a single card first.
          const pageData = await api(`/runs/${runId}/pages`);
          setPages(pageData.pages);
          setRun(data);
          if (data.status === "complete" || data.status === "complete_with_errors") {
            loadGraph().then(setGraph).catch((err) => setGraphError(err.message)); // the dashboard's stats
          }
        } else {
          setRun(data);
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

  if (openSlug) return <PageViewer runId={runId} slug={openSlug} pages={pages} onOpen={setOpenSlug} onBack={() => setOpenSlug(null)} />;
  if (showMap && graph) {
    return <MapView runId={runId} graph={graph} tours={tours} onBack={() => setShowMap(false)} onOpenPage={(slug) => { setShowMap(false); setOpenSlug(slug); }} />;
  }

  const isDone = run && (run.status === "complete" || run.status === "complete_with_errors");
  const overviewPage = pages.find((p) => p.slug === "overview");
  // The side panel shows from the first moment (with a placeholder while loading or running),
  // so the layout never jumps from one card to two.
  const stillWorking = !run || ["queued", "running"].includes(run.status);
  const showSide = pages.length > 0 || stillWorking;

  return (
    <div className="shell">
      <div className={`report-layout ${showSide ? "has-side" : ""}`}>
      <div className="card card-reading report-main">
        <div className="card-header">
          <Brand />
          <button className="btn-header" onClick={onBackToList}>
            ← Analyze another repo
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
        {!run ? (
          <p className="lede">Starting…</p>
        ) : (
          <>
            <div className="run-header">
              <h1 title={run.resolved_sha ? `Docs pinned to commit ${run.resolved_sha.slice(0, 7)}` : undefined}>
                <span className="repo-label">GitHub repo analyzed:</span> {run.repo.owner}/{run.repo.name}
              </h1>
            </div>
            {isDone && pages.length > 0 && (
              <div className="export-bar">
                <span className="export-label">Export Results:</span>
                <a className="export-link" href={`/api/runs/${runId}/export.zip`} download>
                  ↓ Docs (.zip)
                </a>
                <a className="export-link" href={`/api/runs/${runId}/export.zip?include_review=true`} download>
                  ↓ Docs + review notes (.zip)
                </a>
              </div>
            )}
            {!isDone && (
            <div className="status-pill">
              <span className={`dot ${runDot(run.status, run.failure?.code)}`} />
              {run.status === "failed" ? `Analysis stopped: ${runLabel(run.status, run.failure?.code)}` : runLabel(run.status)}
            </div>
            )}

            {run.failure && (
              <p className={STOP_REASON[run.failure.code]?.limit ? "limit-text" : "error-text"}>
                {run.failure.code === "interrupted" || run.failure.code === "queue_timeout"
                  ? "This repo is too large to finish within the time limit. Please try a smaller repo, or select a smaller branch."
                  : run.failure.code === "repo_too_large"
                    ? run.failure.detail
                    : (STOP_REASON[run.failure.code] ?? UNEXPECTED).tip}
              </p>
            )}

            {isDone && (
              <div className="dashboard">
                <h2>At a Glance: What SpecsDoctor Scanned</h2>
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
                      <summary>Mapped Folders <span className="dash-area-count">{stats.areas.length}</span></summary>
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
                    View the Code Flow
                  </button>
                  {overviewPage && (
                    <a className="action-link" href="#" onClick={(e) => { e.preventDefault(); setOpenSlug(overviewPage.slug); }}>
                      Read the Full Overview
                    </a>
                  )}
                  <ShareControl runId={run.run_id} shareUrl={run.share_url} />
                </div>
              </div>
            )}


            {isDone ? (
              <details className="build-details" open>
                <summary>
                  Build Details
                  {run.status === "complete_with_errors" && (
                    <span className="scroll-hint">some steps finished partly; see below</span>
                  )}
                </summary>
                <BuildStatus run={run} />
              </details>
            ) : (
              <BuildStatus run={run} />
            )}

            <FindingsList runId={runId} onOpenPage={setOpenSlug} onChanged={refreshPages} refreshKey={pages.map((p) => p.open_findings).join(",")} />

          </>
        )}
      </div>
      {showSide && (
        <SidePages pages={pages} onOpen={setOpenSlug} placeholder={run ? "Pages will appear here when SpecsDoctor finishes." : "Loading pages…"} />
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

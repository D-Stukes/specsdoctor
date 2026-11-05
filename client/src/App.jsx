import React, { useEffect, useRef, useState } from "react";

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
    <form onSubmit={handleSubmit}>
      <h1>DocSync</h1>
      <label htmlFor="code">Access code</label>
      <input id="code" type="password" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
      <button type="submit" disabled={submitting}>
        {submitting ? "Checking..." : "Continue"}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function RepoForm({ onRunStarted }) {
  const [repoUrl, setRepoUrl] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await api("/runs", { method: "POST", body: JSON.stringify({ repo_url: repoUrl, ref: null, intake: null }) });
      onRunStarted(result.run_id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Generate docs</h1>
      <label htmlFor="repo_url">GitHub repository URL</label>
      <input
        id="repo_url"
        type="text"
        placeholder="https://github.com/owner/repo"
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
        autoFocus
      />
      <button type="submit" disabled={submitting}>
        {submitting ? "Starting..." : "Generate"}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function RunProgress({ runId }) {
  const [run, setRun] = useState(null);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    async function poll() {
      try {
        const data = await api(`/runs/${runId}`);
        setRun(data);
        if (data.status === "queued" || data.status === "running") {
          timerRef.current = setTimeout(poll, 2000);
        }
      } catch (err) {
        setError(err.message);
      }
    }
    poll();
    return () => clearTimeout(timerRef.current);
  }, [runId]);

  if (error) return <p role="alert">{error}</p>;
  if (!run) return <p>Loading...</p>;

  return (
    <div>
      <h1>
        {run.repo.owner}/{run.repo.name}
      </h1>
      <p>Status: {run.status}</p>
      <p>Resolved SHA: {run.resolved_sha}</p>
      <ul>
        {run.stages.map((s) => (
          <li key={s.stage}>
            {s.stage}: {s.status} ({s.items_done}/{s.items_total ?? "?"})
          </li>
        ))}
      </ul>
      <p>Cost: ${run.cost_usd.toFixed(2)} / ${run.budget_cap_usd.toFixed(2)}</p>
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

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { migrate } from "../src/db/migrate.js";
import { closePool } from "../src/db/pool.js";
import { createApp } from "../src/index.js";

process.env.SESSION_SECRET ??= "test-secret";
process.env.ACCESS_CODE ??= "test-code";
process.env.DATABASE_URL ??= "postgres://localhost:5432/docsync_test";

let server;
let baseUrl;
let githubSkip = false; // set when api.github.com can't serve this run's live-repo tests


before(async () => {
  try {
    const limit = await (await fetch("https://api.github.com/rate_limit", { headers: { "user-agent": "docsync-tests" } })).json();
    if (limit.resources.core.remaining < 5) githubSkip = `GitHub API rate limit exhausted (resets ${new Date(limit.resources.core.reset * 1000).toLocaleTimeString()}); set GITHUB_TOKEN to run the live-repo tests`;
  } catch {
    githubSkip = "api.github.com unreachable";
  }
  await migrate();
  const app = createApp();
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closePool();
});

async function postJson(pathname, body, cookie) {
  return fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function putJson(pathname, body, cookie) {
  return fetch(`${baseUrl}${pathname}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function patchJson(pathname, body, cookie) {
  return fetch(`${baseUrl}${pathname}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

test("GET /api/health reports db connectivity", async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.db, true);
});

test("POST /api/runs without a session is rejected", async () => {
  const res = await postJson("/api/runs", { repo_url: "https://github.com/acme/widgets" });
  assert.equal(res.status, 401);
});

let sessionCookie;

test("bad access code is rejected, correct one sets a session cookie", async () => {
  const bad = await postJson("/api/session", { code: "wrong" });
  assert.equal(bad.status, 401);

  const good = await postJson("/api/session", { code: process.env.ACCESS_CODE });
  assert.equal(good.status, 204);
  const setCookie = good.headers.get("set-cookie");
  assert.ok(setCookie, "expected a Set-Cookie header");
  sessionCookie = setCookie.split(";")[0];
});

test("POST /api/runs rejects a malformed repo_url", async () => {
  const rejected = await postJson("/api/runs", { repo_url: "not-a-url" }, sessionCookie);
  assert.equal(rejected.status, 400);
});

async function pollUntilTerminal(baseUrl, runId, cookie, { timeoutMs = 60_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${baseUrl}/api/runs/${runId}`, { headers: { cookie } });
    const body = await res.json();
    if (!["queued", "running"].includes(body.status)) return body;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`run ${runId} did not reach a terminal status within ${timeoutMs}ms`);
}

let m3RunId;

// M3: real Repo Reader -> Scanner -> Analyst -> Writer -> Renderer, against
// a real (tiny, stable) public repo, in AI stub mode (zero cost, zero AI
// network calls - AI_STUB_MODE defaults to true in routes/runs.js).
test("M3: a real run against a real repo produces a generated reference page with cost recorded", async (t) => {
  if (githubSkip) return t.skip(githubSkip);
  const started = await postJson("/api/runs", { repo_url: "https://github.com/jonschlinkert/is-number" }, sessionCookie);
  assert.equal(started.status, 202);
  const { run_id, status } = await started.json();
  assert.equal(status, "queued");
  m3RunId = run_id;

  const finalRun = await pollUntilTerminal(baseUrl, run_id, sessionCookie);
  assert.equal(finalRun.repo.owner, "jonschlinkert");
  assert.equal(finalRun.resolved_sha.length, 40);
  assert.equal(finalRun.stages.length, 7);
  assert.ok(["complete", "complete_with_errors"].includes(finalRun.status), `expected a usable run, got ${finalRun.status}: ${JSON.stringify(finalRun.failure)}`);
  assert.equal(finalRun.cost_usd, 0, "AI_STUB_MODE should make this free");

  const pagesRes = await fetch(`${baseUrl}/api/runs/${run_id}/pages`, { headers: { cookie: sessionCookie } });
  const { pages } = await pagesRes.json();
  // Task 4 added Architect pages (tech-stack, data-model, architecture,
  // api-endpoints) alongside the module reference pages from Task 3 - for
  // this tiny repo several of those are manifest/graph-derived prose with
  // no source link, so check the module page specifically, not pages[0].
  assert.ok(pages.some((p) => p.slug === "index"), "expected the index.js module reference page");
  assert.ok(pages.some((p) => p.slug === "tech-stack"), "expected the Architect's tech-stack page");

  const pageRes = await fetch(`${baseUrl}/api/runs/${run_id}/pages/index`, { headers: { cookie: sessionCookie } });
  assert.equal(pageRes.status, 200);
  const page = await pageRes.json();
  assert.equal(page.status, "generated");
  assert.ok(page.markdown.includes(`https://github.com/jonschlinkert/is-number/blob/${finalRun.resolved_sha}/`), "markdown should contain a commit-pinned source link");
});

// AT-13: edit -> save -> reload persists; emptying a page persists too;
// rev_conflict on a stale base_rev; review marks a revision reviewed;
// findings list + resolve a finding (T17). Builds on the run M3 just saved.
test("AT-13: editing, reviewing and resolving findings on a saved run", async (t) => {
  if (githubSkip) return t.skip(githubSkip);
  const slug = "index";
  const original = await (await fetch(`${baseUrl}/api/runs/${m3RunId}/pages/${slug}`, { headers: { cookie: sessionCookie } })).json();
  assert.equal(original.rev, 1);

  const staleEdit = await putJson(`/api/runs/${m3RunId}/pages/${slug}`, { base_rev: 999, markdown: "nope" }, sessionCookie);
  assert.equal(staleEdit.status, 409);
  assert.equal((await staleEdit.json()).error.code, "rev_conflict");

  const edited = await putJson(`/api/runs/${m3RunId}/pages/${slug}`, { base_rev: original.rev, markdown: "# Edited by hand\n\nreal() is documented here." }, sessionCookie);
  assert.equal(edited.status, 200);
  const editedBody = await edited.json();
  assert.equal(editedBody.rev, 2);
  assert.equal(editedBody.checks_fresh, true);

  const afterEdit = await (await fetch(`${baseUrl}/api/runs/${m3RunId}/pages/${slug}`, { headers: { cookie: sessionCookie } })).json();
  assert.equal(afterEdit.rev, 2);
  assert.equal(afterEdit.origin, "user");
  assert.equal(afterEdit.markdown, "# Edited by hand\n\nreal() is documented here.");

  // Emptying a page is explicitly allowed (§4d "markdown may be ''").
  const emptied = await putJson(`/api/runs/${m3RunId}/pages/${slug}`, { base_rev: 2, markdown: "" }, sessionCookie);
  assert.equal(emptied.status, 200);
  const afterEmpty = await (await fetch(`${baseUrl}/api/runs/${m3RunId}/pages/${slug}`, { headers: { cookie: sessionCookie } })).json();
  assert.equal(afterEmpty.rev, 3);
  assert.equal(afterEmpty.markdown, "");

  const staleReview = await postJson(`/api/runs/${m3RunId}/pages/${slug}/review`, { rev: 2, note: "looks right" }, sessionCookie);
  assert.equal(staleReview.status, 409);

  const review = await postJson(`/api/runs/${m3RunId}/pages/${slug}/review`, { rev: 3, note: "looks right" }, sessionCookie);
  assert.equal(review.status, 200);
  const afterReview = await (await fetch(`${baseUrl}/api/runs/${m3RunId}/pages/${slug}`, { headers: { cookie: sessionCookie } })).json();
  assert.ok(afterReview.reviewed_at, "expected reviewed_at to be set");

  // Findings: the tech-stack page always exists and, for this repo, cites
  // nothing (plain prose) so it won't have findings - use the run's full
  // findings list instead, which should include at least the "none found"
  // (none expected) - check the endpoint shape and filtering work, not a
  // specific count, since AI_STUB_MODE + a tiny repo keep real findings rare.
  const findingsRes = await fetch(`${baseUrl}/api/runs/${m3RunId}/findings?status=open`, { headers: { cookie: sessionCookie } });
  assert.equal(findingsRes.status, 200);
  const { findings } = await findingsRes.json();
  assert.ok(Array.isArray(findings));

  if (findings.length > 0) {
    const target = findings[0];
    const badResolve = await patchJson(`/api/findings/${target.id}`, { status: "corrected" }, sessionCookie);
    assert.equal(badResolve.status, 400, "note should be required unless reopening");
    assert.equal((await badResolve.json()).error.code, "note_required");

    const resolve = await patchJson(`/api/findings/${target.id}`, { status: "corrected", note: "fixed it" }, sessionCookie);
    assert.equal(resolve.status, 200);
    const resolved = await resolve.json();
    assert.equal(resolved.status, "corrected");
    assert.equal(resolved.resolution_note, "fixed it");
  }
});

// AT-14: export ZIP has the mkdocs skeleton, provenance, no word "verified"
// as a claim, and review.md only when asked for.
test("AT-14: export ZIP contents", async (t) => {
  if (githubSkip) return t.skip(githubSkip);
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const notReady = await fetch(`${baseUrl}/api/runs/00000000-0000-0000-0000-000000000000/export.zip`, { headers: { cookie: sessionCookie } });
  assert.equal(notReady.status, 404);

  const dir = mkdtempSync(join(tmpdir(), "docsync-export-"));
  async function fetchZip(query) {
    const res = await fetch(`${baseUrl}/api/runs/${m3RunId}/export.zip${query}`, { headers: { cookie: sessionCookie } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/zip");
    const file = join(dir, `export${query ? "-review" : ""}.zip`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    return file;
  }
  const list = (file) => execFileSync("unzip", ["-Z1", file]).toString().split("\n").filter(Boolean);

  const plain = list(await fetchZip(""));
  for (const name of ["mkdocs.yml", "README.md", "docs/provenance.md"]) assert.ok(plain.includes(name), `missing ${name}`);
  assert.ok(plain.some((n) => n.startsWith("docs/") && n !== "docs/provenance.md"), "expected at least one page");
  assert.ok(!plain.includes("docs/review.md"), "review.md only with include_review");

  const withReview = list(await fetchZip("?include_review=true"));
  assert.ok(withReview.includes("docs/review.md"));

  const prov = execFileSync("unzip", ["-p", join(dir, "export.zip"), "docs/provenance.md"]).toString();
  assert.match(prov, /Resolved commit/);
  assert.ok(!/verified spec[^.]*\./.test(prov.replace("not a verified spec", "")), "must not claim verified");
});

test("GET /api/runs/:id/graph returns a valid graph/1 for a finished run", async (t) => {
  if (githubSkip) return t.skip(githubSkip);
  const { validateDoc } = await import("@docsync/contracts");
  const res = await fetch(`${baseUrl}/api/runs/${m3RunId}/graph`, { headers: { cookie: sessionCookie } });
  assert.equal(res.status, 200);
  const graph = await res.json();
  const { valid, errors } = validateDoc(graph);
  assert.equal(valid, true, JSON.stringify(errors));

  const missing = await fetch(`${baseUrl}/api/runs/00000000-0000-0000-0000-000000000000/graph`, { headers: { cookie: sessionCookie } });
  assert.equal(missing.status, 404);
});

test("the graph endpoint and the export both carry the run's areas", async (t) => {
  if (githubSkip) return t.skip(githubSkip);
  const { validateDoc } = await import("@docsync/contracts");
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const graph = await (await fetch(`${baseUrl}/api/runs/${m3RunId}/graph`, { headers: { cookie: sessionCookie } })).json();
  assert.ok(graph.groups.length > 0, "a finished run should have areas (folder areas in stub mode)");
  assert.ok(graph.nodes.some((n) => n.group));

  const res = await fetch(`${baseUrl}/api/runs/${m3RunId}/export.zip`, { headers: { cookie: sessionCookie } });
  const file = join(mkdtempSync(join(tmpdir(), "docsync-graph-")), "e.zip");
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  const exported = JSON.parse(execFileSync("unzip", ["-p", file, "graph.json"]).toString());
  assert.equal(validateDoc(exported).valid, true);
  assert.deepEqual(exported.groups, graph.groups);
});

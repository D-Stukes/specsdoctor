import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { migrate } from "../src/db/migrate.js";
import { closePool } from "../src/db/pool.js";
import { createApp } from "../src/index.js";

process.env.SESSION_SECRET ??= "test-secret";
process.env.ACCESS_CODE ??= "test-code";
process.env.DATABASE_URL ??= "postgres://localhost:5432/docsync_dev";

let server;
let baseUrl;

before(async () => {
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

// M3: real Repo Reader -> Scanner -> Analyst -> Writer -> Renderer, against
// a real (tiny, stable) public repo, in AI stub mode (zero cost, zero AI
// network calls - AI_STUB_MODE defaults to true in routes/runs.js).
test("M3: a real run against a real repo produces a generated reference page with cost recorded", async () => {
  const started = await postJson("/api/runs", { repo_url: "https://github.com/jonschlinkert/is-number" }, sessionCookie);
  assert.equal(started.status, 202);
  const { run_id, status } = await started.json();
  assert.equal(status, "queued");

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

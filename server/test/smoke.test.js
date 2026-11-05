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

test("bad access code is rejected, correct one sets a session cookie, and the M1 flow runs end to end", async () => {
  const bad = await postJson("/api/session", { code: "wrong" });
  assert.equal(bad.status, 401);

  const good = await postJson("/api/session", { code: process.env.ACCESS_CODE });
  assert.equal(good.status, 204);
  const setCookie = good.headers.get("set-cookie");
  assert.ok(setCookie, "expected a Set-Cookie header");
  const cookie = setCookie.split(";")[0];

  const rejected = await postJson("/api/runs", { repo_url: "not-a-url" }, cookie);
  assert.equal(rejected.status, 400);

  const started = await postJson("/api/runs", { repo_url: "https://github.com/acme/widgets" }, cookie);
  assert.equal(started.status, 202);
  const { run_id, status } = await started.json();
  assert.equal(status, "queued");
  assert.ok(run_id);

  const progress = await fetch(`${baseUrl}/api/runs/${run_id}`, { headers: { cookie } });
  assert.equal(progress.status, 200);
  const progressBody = await progress.json();
  assert.equal(progressBody.repo.owner, "acme");
  assert.equal(progressBody.repo.name, "widgets");
  assert.equal(progressBody.stages.length, 7);
  assert.ok(["running", "complete"].includes(progressBody.status));
});

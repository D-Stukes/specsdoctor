import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { Readable } from "node:stream";
import * as tarStream from "tar-stream";
import { redactSecrets } from "../src/ai/redact.js";
import { callStructured, setPromptCapture } from "../src/ai/client.js";
import { extractTarball } from "../src/reader/extract-tarball.js";
import { parseRepoUrl } from "../src/repo-url.js";
import { migrate } from "../src/db/migrate.js";
import { closePool } from "../src/db/pool.js";
import { createApp } from "../src/index.js";

process.env.SESSION_SECRET ??= "test-secret";
process.env.ACCESS_CODE ??= "test-code";
process.env.DATABASE_URL ??= "postgres://localhost:5432/docsync_dev";

// --- SEC-5: key-format redaction ---

const FAKE_KEYS = {
  aws: "AKIAIOSFODNN7EXAMPLE",
  github: "ghp_" + "a1B2c3D4e5".repeat(4),
  stripe: "sk_live_" + "4eC39HqLyjWDarjtT1zdp7dc",
  anthropic: "sk-ant-api03-" + "abcDEF123456".repeat(2),
  literal: "Zx9Kq2Lm8Rt5Vw3Yb7Nc1Hd4Gf6Js0Pa",
};

test("redactSecrets replaces AWS, GitHub, Stripe, Anthropic keys and long high-entropy literals", () => {
  for (const [name, secret] of Object.entries(FAKE_KEYS)) {
    const input = name === "literal" ? `const k = "${secret}";` : `const k = ${secret};`;
    const out = redactSecrets(input);
    assert.ok(!out.includes(secret), `${name} key survived`);
    assert.ok(out.includes("[REDACTED]"), `${name} not marked`);
  }
});

test("redactSecrets removes a private key block", () => {
  const out = redactSecrets("x\n-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----\ny");
  assert.ok(!out.includes("MIIabc"));
  assert.ok(out.startsWith("x\n") && out.endsWith("\ny"));
});

test("redactSecrets leaves ordinary code and prose alone", () => {
  const code = 'export function createUserSession(userId) { return "hello world"; } // see README';
  assert.equal(redactSecrets(code), code);
  const longIdentifier = '"aVeryLongButPurelyAlphabeticIdentifierNameHere"';
  assert.equal(redactSecrets(longIdentifier), longIdentifier);
});

test("callStructured redacts secrets from the outgoing prompt (stub-mode capture)", async () => {
  const captured = [];
  setPromptCapture((p) => captured.push(p));
  try {
    await callStructured({
      runId: null,
      stage: "analyst",
      model: "m",
      system: "s",
      userMessage: `source: const key = "${FAKE_KEYS.literal}"; aws=${FAKE_KEYS.aws}`,
      stub: async () => ({}),
    });
  } finally {
    setPromptCapture(null);
  }
  assert.equal(captured.length, 1);
  assert.ok(!captured[0].userMessage.includes(FAKE_KEYS.literal));
  assert.ok(!captured[0].userMessage.includes(FAKE_KEYS.aws));
});

// --- SEC-3 / SEC-5: archive handling ---

function buildTarGz(entries) {
  return new Promise((resolve, reject) => {
    const pack = tarStream.pack();
    const chunks = [];
    const gzip = zlib.createGzip();
    gzip.on("data", (c) => chunks.push(c));
    gzip.on("end", () => resolve(Buffer.concat(chunks)));
    gzip.on("error", reject);
    pack.pipe(gzip);
    for (const e of entries) {
      if (e.type) pack.entry({ name: e.name, type: e.type, linkname: e.linkname });
      else pack.entry({ name: e.name, size: e.content.length }, e.content);
    }
    pack.finalize();
  });
}

test(".env, keys and credential files never reach contentByPath (so never a prompt)", async () => {
  const tgz = await buildTarGz([
    { name: "r/ok.js", content: Buffer.from("export const a = 1;\n") },
    { name: "r/.env", content: Buffer.from("API_KEY=supersecret\n") },
    { name: "r/.env.production", content: Buffer.from("DB=supersecret\n") },
    { name: "r/deploy.pem", content: Buffer.from("supersecret") },
    { name: "r/config/credentials.json", content: Buffer.from('{"k":"supersecret"}') },
    { name: "r/.env.example", content: Buffer.from("API_KEY=\n") },
  ]);
  const { contentByPath } = await extractTarball(Readable.from(tgz));
  assert.deepEqual(Object.keys(contentByPath).sort(), [".env.example", "ok.js"]);
  assert.ok(!JSON.stringify(contentByPath).includes("supersecret"));
});

test("extractTarball rejects hardlinks and device files", async () => {
  const tgz = await buildTarGz([
    { name: "r/ok.js", content: Buffer.from("export const a = 1;\n") },
    { name: "r/hard.js", type: "link", linkname: "r/ok.js" },
    { name: "r/dev.js", type: "character-device" },
  ]);
  const { files } = await extractTarball(Readable.from(tgz));
  assert.deepEqual(files.map((f) => f.path), ["ok.js"]);
});

// --- SEC-2: URL allowlist ---

test("parseRepoUrl rejects non-GitHub and look-alike hosts", () => {
  for (const url of [
    "https://gitlab.com/o/r",
    "http://github.com/o/r",
    "https://github.com.evil.com/o/r",
    "https://evil.com/github.com/o/r",
    "https://user@github.com/o/r",
    "https://github.com/o/r/../../x",
    "file:///etc/passwd",
    "https://github.com/o r/x",
  ]) {
    assert.equal(parseRepoUrl(url), null, url);
  }
  assert.deepEqual(parseRepoUrl("https://github.com/o/r/tree/main"), { owner: "o", name: "r", ref: "main" });
});

// --- SEC-8: every saved-content route needs the session ---

let server;
let baseUrl;
before(async () => {
  await migrate();
  server = createApp().listen(0);
  baseUrl = `http://localhost:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closePool();
});

test("every saved-content route returns 401 without a cookie", async () => {
  const id = "00000000-0000-0000-0000-000000000000";
  const routes = [
    ["GET", "/api/runs"],
    ["POST", "/api/runs"],
    ["GET", `/api/runs/${id}`],
    ["GET", `/api/runs/${id}/pages`],
    ["GET", `/api/runs/${id}/pages/index`],
    ["PUT", `/api/runs/${id}/pages/index`],
    ["POST", `/api/runs/${id}/pages/index/review`],
    ["GET", `/api/runs/${id}/findings`],
    ["PATCH", `/api/findings/${id}`],
    ["GET", `/api/runs/${id}/export.zip`],
  ];
  for (const [method, path] of routes) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: method === "GET" ? undefined : "{}",
    });
    assert.equal(res.status, 401, `${method} ${path}`);
  }
});

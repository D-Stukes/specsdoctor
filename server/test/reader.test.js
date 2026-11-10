import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { Readable } from "node:stream";
import * as tarStream from "tar-stream";
import { classifyFile } from "../src/reader/classify-file.js";
import { extractTarball, MAX_ENTRIES } from "../src/reader/extract-tarball.js";

test("classifyFile: documentable JS/TS extensions are scanned", () => {
  for (const path of ["a.js", "a.jsx", "a.mjs", "a.cjs", "a.ts", "a.tsx"]) {
    assert.equal(classifyFile(path).status, "scanned", path);
  }
});

test("classifyFile: .d.ts is skipped, not scanned", () => {
  assert.deepEqual(classifyFile("types/api.d.ts"), { status: "skipped", reason: "d_ts" });
});

test("classifyFile: node_modules is skipped regardless of extension", () => {
  assert.equal(classifyFile("server/node_modules/pkg/index.js").status, "skipped");
});

test("classifyFile: .env is skipped but .env.example is scanned", () => {
  assert.equal(classifyFile(".env").status, "skipped");
  assert.equal(classifyFile(".env.local").status, "skipped");
  assert.equal(classifyFile("server/.env.example").status, "scanned");
});

test("classifyFile: python files are scanned (Task 8); notebooks are a deliberate, permanent skip", () => {
  assert.deepEqual(classifyFile("pkg/habits.py"), { status: "scanned", language: "python" });
  assert.deepEqual(classifyFile("pkg/exploration.ipynb"), { status: "skipped", reason: "notebook" });
});

test("classifyFile: a file over 1MB is skipped", () => {
  assert.deepEqual(classifyFile("big.js", 2 * 1024 * 1024), { status: "skipped", reason: "file_size_exceeded" });
});

// --- extractTarball: SEC-T "tar with ../ entry, symlink and oversize file rejected" ---

function buildTarGz(entries) {
  return new Promise((resolve, reject) => {
    const pack = tarStream.pack();
    const chunks = [];
    const gzip = zlib.createGzip();
    gzip.on("data", (c) => chunks.push(c));
    gzip.on("end", () => resolve(Buffer.concat(chunks)));
    gzip.on("error", reject);
    pack.pipe(gzip);

    for (const entry of entries) {
      if (entry.type === "symlink") {
        pack.entry({ name: entry.name, type: "symlink", linkname: entry.linkname ?? "/etc/passwd" });
      } else {
        pack.entry({ name: entry.name, size: entry.content.length }, entry.content);
      }
    }
    pack.finalize();
  });
}

test("extractTarball rejects a path-traversal entry", async () => {
  const tgz = await buildTarGz([
    { name: "repo-sha/good.js", content: Buffer.from("const a = 1;\n") },
    { name: "repo-sha/../../etc/passwd", content: Buffer.from("root:x:0:0\n") },
  ]);
  const { files, contentByPath } = await extractTarball(Readable.from(tgz));
  assert.deepEqual(files.map((f) => f.path).sort(), ["good.js"]);
  assert.ok(contentByPath["good.js"]);
  assert.equal(Object.keys(contentByPath).length, 1);
});

test("extractTarball rejects a symlink entry", async () => {
  const tgz = await buildTarGz([
    { name: "repo-sha/good.js", content: Buffer.from("const a = 1;\n") },
    { name: "repo-sha/evil-link", type: "symlink", linkname: "/etc/passwd" },
  ]);
  const { files } = await extractTarball(Readable.from(tgz));
  assert.deepEqual(files.map((f) => f.path).sort(), ["good.js"]);
});

test("extractTarball flags an oversized single file as skipped, not scanned", async () => {
  const big = Buffer.alloc(1024 * 1024 + 10, "a".charCodeAt(0));
  const tgz = await buildTarGz([{ name: "repo-sha/huge.js", content: big }]);
  const { files, contentByPath } = await extractTarball(Readable.from(tgz));
  assert.equal(files[0].status, "skipped");
  assert.equal(files[0].reason, "file_size_exceeded");
  assert.equal(contentByPath["huge.js"], undefined);
});

test("extractTarball flags a minified single-line file as skipped", async () => {
  const minified = "x".repeat(3000);
  const tgz = await buildTarGz([{ name: "repo-sha/vendor.js", content: Buffer.from(minified) }]);
  const { files, contentByPath } = await extractTarball(Readable.from(tgz));
  assert.equal(files[0].status, "skipped");
  assert.equal(files[0].reason, "minified");
  assert.equal(contentByPath["vendor.js"], undefined);
});

test("extractTarball strips the single top-level directory GitHub tarballs wrap everything in", async () => {
  const tgz = await buildTarGz([{ name: "acme-repo-abc123/server/index.js", content: Buffer.from("1") }]);
  const { files } = await extractTarball(Readable.from(tgz));
  assert.equal(files[0].path, "server/index.js");
});

test("extractTarball stops counting new files past the archive-entries limit and reports it", async () => {
  const entries = Array.from({ length: MAX_ENTRIES + 5 }, (_, i) => ({
    name: `repo-sha/file${i}.js`,
    content: Buffer.from("1"),
  }));
  const tgz = await buildTarGz(entries);
  const { files, limitsHit } = await extractTarball(Readable.from(tgz));
  assert.ok(limitsHit.includes("archive_entries"));
  assert.equal(files.length, MAX_ENTRIES);
});

test("a GitHub rate-limit response becomes a clear github_rate_limited error, not a bare 403", async () => {
  const { resolveRef } = await import("../src/reader/github-api.js");
  const realFetch = globalThis.fetch;
  const reset = Math.floor(Date.now() / 1000) + 600;
  globalThis.fetch = async () => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) } });
  try {
    await assert.rejects(() => resolveRef("o", "r", null), (err) => err.code === "github_rate_limited" && /resets in about 10 minute/.test(err.message) && /GITHUB_TOKEN/.test(err.message));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a 403 that is not a rate limit stays a github_error", async () => {
  const { resolveRef } = await import("../src/reader/github-api.js");
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "42" } });
  try {
    await assert.rejects(() => resolveRef("o", "r", null), (err) => err.code === "github_error");
  } finally {
    globalThis.fetch = realFetch;
  }
});

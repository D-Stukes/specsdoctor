import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "../src/scanner/index.js";

function scanFiles(files) {
  const snapshot = {
    schema_version: "snapshot/1",
    repo: { owner: "t", name: "t" },
    requested_ref: null,
    resolved_sha: "0".repeat(40),
    files: Object.entries(files).map(([path, content]) => ({ path, size: content.length, status: "scanned" })),
    limits_hit: [],
  };
  return scan(snapshot, files).index;
}

test('app.use("/dashboard", require("./routes/dashboard")) prefixes that router\'s endpoints', () => {
  const index = scanFiles({
    "server.js": `const express = require("express");\nconst app = express();\napp.use("/authentication", require("./routes/auth"));\napp.use("/dashboard", require("./routes/dashboard"));\napp.listen(5000);\n`,
    "routes/auth.js": `const router = require("express").Router();\nrouter.post("/login", (req, res) => {});\nmodule.exports = router;\n`,
    "routes/dashboard.js": `const router = require("express").Router();\nrouter.get("/", (req, res) => {});\nrouter.put("/todos/:id", (req, res) => {});\nmodule.exports = router;\n`,
  });
  const eps = index.items.filter((i) => i.kind === "endpoint").map((e) => `${e.method} ${e.path} ${e.resolved}`).sort();
  assert.deepEqual(eps, ["GET /dashboard true", "POST /authentication/login true", "PUT /dashboard/todos/:id true"]);
});

test("a single-argument inline require mount adds no prefix", () => {
  const index = scanFiles({
    "server.js": `const app = require("express")();\napp.use(require("./routes/r"));\napp.listen(1);\n`,
    "routes/r.js": `const router = require("express").Router();\nrouter.get("/ping", (req, res) => {});\nmodule.exports = router;\n`,
  });
  assert.deepEqual(index.items.filter((i) => i.kind === "endpoint").map((e) => e.path), ["/ping"]);
});

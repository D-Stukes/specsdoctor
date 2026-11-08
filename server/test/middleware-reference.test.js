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

test("middleware loaded with const x = require() points at the module's real default item, never a made-up name", () => {
  const index = scanFiles({
    "server.js": `const app = require("express")();\napp.use("/d", require("./routes/d"));\napp.listen(1);\n`,
    "routes/d.js": `const router = require("express").Router();\nconst authorize = require("../middleware/authorize");\nrouter.get("/", authorize, (req, res) => {});\nmodule.exports = router;\n`,
    "middleware/authorize.js": `module.exports = function (req, res, next) { next(); };\n`,
  });
  const ep = index.items.find((i) => i.kind === "endpoint");
  assert.deepEqual(ep.middleware, ["sym:middleware/authorize.js#default"]);
  const ids = new Set(index.items.map((i) => i.id));
  assert.ok(ids.has(ep.middleware[0]), "referenced middleware must exist in the index");
});

test("a named destructured middleware keeps its exported name", () => {
  const index = scanFiles({
    "routes/d.js": `const router = require("express").Router();\nconst { guard } = require("../mw");\nrouter.get("/", guard, (req, res) => {});\nmodule.exports = router;\n`,
    "mw.js": `function guard(req, res, next) { next(); }\nmodule.exports = { guard };\n`,
  });
  const ep = index.items.find((i) => i.kind === "endpoint");
  assert.deepEqual(ep.middleware, ["sym:mw.js#guard"]);
});

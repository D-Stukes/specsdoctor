import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDoc } from "@docsync/contracts";
import { parseFile } from "../src/scanner/babel.js";
import { extractFlowFacts } from "../src/scanner/extract-flow-facts.js";
import { sqlOperations } from "../src/scanner/extract-graph-facts.js";
import { scan } from "../src/scanner/index.js";
import { buildGraph } from "../src/graph/build-graph.js";
import { humanizeName, endpointPlainLabel, endpointPlainSummary, tablePlainLabel } from "../src/graph/plain.js";
import { scanFixture } from "./helpers/fixture.js";

const facts = (src) => extractFlowFacts(parseFile("x.js", src));

test("request inputs: destructured body, member access, params, query and headers", () => {
  const f = facts(`
    async function h(req, res) {
      const { name, email } = req.body;
      const id = req.params.id;
      const page = req.query.page;
      const token = req.header("authorization");
      const other = req.headers["x-user-id"];
      const nope = somethingElse.body.name;
    }`);
  assert.deepEqual(f.inputs.map((i) => `${i.source}:${i.name}`).sort(), ["body:email", "body:name", "header:authorization", "header:x-user-id", "params:id", "query:page"]);
});

test("responses: status, error message, and the keys of an object reply", () => {
  const f = facts(`
    function h(req, res) {
      res.status(400).json({ error: "name is required" });
      res.status(201).json({ id: 1, name: "x" });
      res.json(rows);
      res.sendStatus(204);
    }`);
  assert.deepEqual(f.outputs.map((o) => [o.status, o.message, o.keys]), [[400, "name is required", ["error"]], [201, null, ["id", "name"]], [null, null, null], [204, null, null]]);
});

test("bindings and instances: imports, requires, destructured requires, and new Thing()", () => {
  const f = facts(`
    import def, { a as b } from "./m";
    import * as ns from "./n";
    const x = require("./o");
    const { p, q: r } = require("./s");
    const service = new HabitService();`);
  assert.deepEqual([...f.bindings].map(([k, v]) => `${k}=${v.spec}#${v.imported}`).sort(), ["b=./m#a", "def=./m#default", "ns=./n#*", "p=./s#p", "r=./s#q", "x=./o#*"]);
  assert.equal(f.instances.get("service"), "HabitService");
});

test("sqlOperations: read vs write, and columns only when a single table makes them safe to attribute", () => {
  const known = new Set(["habits", "users"]);
  assert.deepEqual(sqlOperations("SELECT id, h.name AS n, count(*) FROM habits h WHERE x = $1", known), [{ table: "habits", operation: "read", columns: ["id", "name"] }]);
  assert.deepEqual(sqlOperations("SELECT * FROM habits", known), [{ table: "habits", operation: "read", columns: ["*"] }]);
  assert.deepEqual(sqlOperations("INSERT INTO habits (user_id, title) VALUES ($1, $2) RETURNING id", known), [{ table: "habits", operation: "write", columns: ["user_id", "title"] }]);
  assert.deepEqual(sqlOperations("UPDATE habits SET title = $1, done = true WHERE id = $2", known), [{ table: "habits", operation: "write", columns: ["title", "done"] }]);
  assert.deepEqual(sqlOperations("DELETE FROM habits WHERE id = $1", known), [{ table: "habits", operation: "write", columns: [] }]);
  const join = sqlOperations("SELECT u.name, h.title FROM users u JOIN habits h ON h.user_id = u.id", known);
  assert.deepEqual(join.map((j) => [j.table, j.operation, j.columns]).sort(), [["habits", "read", []], ["users", "read", []]]);
  assert.deepEqual(sqlOperations("just some text from somewhere", known), []);
});

test("calls are resolved through real imports, instances, this, and same-file names; unknown calls are ignored", () => {
  const files = {
    "a.js": `const { helper } = require("./b");\nconst Svc = require("./c");\nconst svc = new Svc.Thing();\nfunction local() { return 1; }\nfunction main() { helper(); local(); unknown(); console.log(1); }\n`,
    "b.js": `function helper() {}\nmodule.exports = { helper };\n`,
    "d.js": `class Box {\n  open() { return this.close(); }\n  close() { return 1; }\n}\nconst box = new Box();\nfunction run() { box.open(); }\nmodule.exports = { run, Box };\n`,
  };
  const snapshot = { schema_version: "snapshot/1", repo: { owner: "t", name: "t" }, requested_ref: null, resolved_sha: "0".repeat(40), files: Object.entries(files).map(([path, c]) => ({ path, size: c.length, status: "scanned" })), limits_hit: [] };
  const { index } = scan(snapshot, files);
  const calls = index.graph_facts.calls.map((c) => `${c.from.split("#")[1]} -> ${c.to.split("#")[1]}`).sort();
  assert.deepEqual(calls, ["Box.open -> Box.close", "main -> helper", "main -> local", "run -> Box.open"]);
  assert.equal(validateDoc(index).valid, true);
});

test("plain names: camelCase, PascalCase and snake_case become short readable phrases", () => {
  assert.equal(humanizeName("createHabit"), "Create habit");
  assert.equal(humanizeName("HabitsPage"), "Habits page");
  assert.equal(humanizeName("get_all_users"), "Get all users");
  assert.equal(humanizeName("requireAuth"), "Require sign-in");
  assert.equal(humanizeName("authorize.js"), "Authorize");
  assert.equal(humanizeName("parseJWTToken"), "Parse login token");
});

test("plain endpoint names read like what a person does", () => {
  assert.equal(endpointPlainLabel("GET", "/api/habits"), "See all habits");
  assert.equal(endpointPlainLabel("GET", "/api/habits/:id"), "Get one habit");
  assert.equal(endpointPlainLabel("POST", "/api/habits"), "Add a habit");
  assert.equal(endpointPlainLabel("PUT", "/dashboard/todos/:id"), "Change a todo");
  assert.equal(endpointPlainLabel("DELETE", "/dashboard/todos/:id"), "Remove a todo");
  assert.equal(endpointPlainLabel("POST", "/authentication/login"), "Log in");
  assert.equal(endpointPlainLabel("POST", "/authentication/register"), "Sign up");
  assert.equal(endpointPlainLabel("GET", "/"), "Home");
  assert.equal(tablePlainLabel("habits"), "Habits (saved data)");
});

test("plain endpoint sentence: what it takes in, looks up, saves, and answers", () => {
  const text = endpointPlainSummary({
    inputs: [{ source: "body", name: "name" }, { source: "params", name: "id" }, { source: "header", name: "x-user-id" }],
    outputs: [{ status: 201, message: null, keys: ["id"] }, { status: 400, message: "name is required", keys: ["error"] }],
    reads: [{ table: "users", columns: ["*"] }],
    writes: [{ table: "habits", columns: ["user_id", "name"] }],
  });
  assert.equal(text, 'Takes in name, id (from the address) and x-user-id (sent with the request). Looks up users. Saves to habits (user_id, name). Sends back the result. If something is wrong it answers: "name is required".');
});

const { index } = scanFixture();
const graph = buildGraph(index);

test("fixture graph: call edges link the screen to its fetch and handlers to the class methods that touch the database", () => {
  const calls = graph.edges.filter((e) => e.kind === "calls").map((e) => `${e.from.split("#")[1]} -> ${e.to.split("#")[1]}`).sort();
  assert.deepEqual(calls, ["HabitsPage -> fetchHabits", "createHabit -> HabitService.create", "listHabits -> HabitService.list"]);
  assert.ok(graph.edges.filter((e) => e.kind === "calls").every((e) => !e.inferred && e.evidence[0].start_line >= 1));
  assert.equal(validateDoc(graph).valid, true, JSON.stringify(validateDoc(graph).errors));
});

test("fixture graph: an endpoint's data reaches through the functions it calls", () => {
  const post = graph.nodes.find((n) => n.label === "POST /api/habits");
  assert.deepEqual(post.data.inputs, [{ source: "body", name: "title" }]);
  assert.deepEqual(post.data.writes, [{ table: "habits", columns: ["user_id", "title"] }]);
  assert.deepEqual(post.data.reads, []);
  assert.equal(post.plain_label, "Add a habit");
  const list = graph.nodes.find((n) => n.label === "GET /api/habits");
  assert.deepEqual(list.data.reads, [{ table: "habits", columns: ["*"] }]);
});

test("fixture graph: table edges say whether the code reads or writes", () => {
  const ops = graph.edges.filter((e) => e.kind === "queries_table").map((e) => `${e.to}:${e.operation}`).sort();
  assert.ok(ops.includes("tbl:habits:read") && ops.includes("tbl:habits:write"));
  assert.ok(graph.edges.filter((e) => e.kind === "queries_table").every((e) => e.operation === "read" || e.operation === "write"));
});

test("every node has a plain label; summaries from the Analyst are used for functions", () => {
  assert.ok(graph.nodes.every((n) => typeof n.plain_label === "string" && n.plain_label.length > 0));
  const fn = index.items.find((i) => i.kind === "function" && i.name === "listHabits");
  const g = buildGraph(index, { summaries: new Map([[fn.id, "Gets every habit the signed-in person has."]]) });
  assert.equal(g.nodes.find((n) => n.id === fn.id)?.plain_summary, "Gets every habit the signed-in person has.");
});

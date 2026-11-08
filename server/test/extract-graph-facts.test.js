import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFile } from "../src/scanner/babel.js";
import { extractGraphFacts, tablesInSql } from "../src/scanner/extract-graph-facts.js";

const facts = (src) => extractGraphFacts(parseFile("x.js", src));

test("fetch and axios calls with literal or template URLs are captured; origin and query are stripped", () => {
  const f = facts(`
    fetch("/api/a");
    fetch(\`http://localhost:4000/api/b/\${id}?x=1\`, { method: "post" });
    axios.delete("/api/c/1");
    axios.get(url);
    fetch(dynamicUrl);
    api.get("/api/not-axios");
  `);
  assert.deepEqual(f.httpCalls.map((c) => [c.url, c.method]), [["/api/a", "GET"], ["/api/b/:param", "POST"], ["/api/c/1", "DELETE"]]);
});

test("fetch with options but no literal method is unknown, with options lacking a method key it is GET", () => {
  const f = facts(`fetch("/a", { headers: {} }); fetch("/b", opts); fetch("/c", { ...spread });`);
  assert.deepEqual(f.httpCalls.map((c) => c.method), ["GET", null, null]);
});

test("SQL-looking strings and template literals are captured with their line", () => {
  const f = facts(`const a = "SELECT * FROM habits";\nconst b = \`INSERT INTO habits (name) VALUES ($1)\`;\nconst c = "hello world";`);
  assert.deepEqual(f.sqlStrings.map((s) => s.line), [1, 2]);
});

test("tablesInSql finds only known tables across FROM / INTO / UPDATE / JOIN, ignoring case and quoting", () => {
  const known = new Set(["habits", "users"]);
  assert.deepEqual(tablesInSql('SELECT * FROM habits h JOIN "users" u ON u.id = h.user_id', known).sort(), ["habits", "users"]);
  assert.deepEqual(tablesInSql("UPDATE public.habits SET a = 1", known), ["habits"]);
  assert.deepEqual(tablesInSql("SELECT * FROM somewhere_else", known), []);
  assert.deepEqual(tablesInSql("copy the text from the other place", known), []);
});

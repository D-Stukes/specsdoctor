// T15: deterministic Architect pages (§2 "Contradictions resolved" - these
// are built unconditionally, not only as a fallback, so they never fail).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTechStackPage, buildDataModelPage, buildArchitecturePage, buildApiEndpointsPage } from "../src/stages/architect-deterministic.js";
import { renderPage } from "../src/renderer/render-page.js";
import { getValidator } from "@docsync/contracts";

const repo = { owner: "acme", name: "widgets", sha: "9".repeat(40) };

const index = {
  items: [
    { id: "sym:a.js#foo", kind: "function", name: "foo", path: "a.js", start_line: 1, end_line: 2, signature: "foo()" },
    { id: "ep:GET /x@routes.js:1", kind: "endpoint", method: "GET", path: "/x", resolved: true, declaration: { path: "routes.js", start_line: 1, end_line: 1 }, middleware: [], handler: { inline: { path: "routes.js", start_line: 1, end_line: 1 } } },
  ],
  imports: [
    { from: "a.js", to: "b.js", kind: "require" },
    { from: "b.js", to: "c.js", kind: "require" },
  ],
  project: {
    workspaces: [{ dir: "server", scripts: { dev: "node index.js" }, dependencies: { express: "^4.0.0" }, engines: null, frontend: false }],
    env_vars: [],
    tables: [{ id: "tbl:users", format: "sql", source: { path: "schema.sql", start_line: 1, end_line: 3 }, columns: [{ name: "id", type: "serial", nullable: false }] }],
  },
};

const pageValidator = getValidator("page/1");

test("buildTechStackPage lists scripts and dependencies from the index, validates as page/1", () => {
  const page = buildTechStackPage(index);
  assert.ok(pageValidator(page), JSON.stringify(pageValidator.errors));
  const { markdown } = renderPage(page, index, repo);
  assert.ok(markdown.includes("`dev`"));
  assert.ok(markdown.includes("`express`"));
});

test("buildDataModelPage renders real tables via table_ref, not invented ones", () => {
  const page = buildDataModelPage(index);
  assert.ok(pageValidator(page));
  const { markdown, warnings } = renderPage(page, index, repo);
  assert.ok(markdown.includes("`users`"));
  assert.equal(warnings.length, 0);
});

test("buildDataModelPage says so, not nothing, when there are no tables", () => {
  const page = buildDataModelPage({ ...index, project: { ...index.project, tables: [] } });
  const { markdown } = renderPage(page, index, repo);
  assert.ok(markdown.includes("No SQL"));
});

test("buildArchitecturePage renders every import edge as a Mermaid flowchart", () => {
  const page = buildArchitecturePage(index);
  assert.ok(pageValidator(page));
  const { markdown } = renderPage(page, index, repo);
  assert.ok(markdown.includes("```mermaid"));
  assert.ok(markdown.includes("flowchart LR"));
  assert.ok(markdown.includes("a.js"));
  assert.ok(markdown.includes("c.js"));
});

test("buildApiEndpointsPage lists every endpoint via endpoint_ref, resolving to the index", () => {
  const page = buildApiEndpointsPage(index);
  assert.ok(pageValidator(page));
  const { markdown, warnings } = renderPage(page, index, repo);
  assert.ok(markdown.includes("`GET /x`"));
  assert.equal(warnings.length, 0);
});

// T11 "Done when": signatures and URLs byte-equal to index-derived values.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPage } from "../src/renderer/render-page.js";

const repo = { owner: "acme", name: "habit-tracker", sha: "9".repeat(40) };

const index = {
  items: [
    {
      id: "sym:server/controllers/users.js#createUser",
      kind: "function",
      name: "createUser",
      path: "server/controllers/users.js",
      start_line: 42,
      end_line: 61,
      signature: "createUser(req, res)",
      params: [{ name: "req", type: null }, { name: "res", type: null }],
      returns: null,
      doc: "Creates a user from the request body.",
    },
    {
      id: "ep:POST /api/users@server/routes/users.js:8",
      kind: "endpoint",
      method: "POST",
      path: "/api/users",
      resolved: true,
      declaration: { path: "server/routes/users.js", start_line: 8, end_line: 8 },
      middleware: ["sym:server/middleware/auth.js#requireAuth"],
      handler: { symbol_id: "sym:server/controllers/users.js#createUser" },
    },
    { id: "sym:server/middleware/auth.js#requireAuth", kind: "function", name: "requireAuth", path: "server/middleware/auth.js", start_line: 4, end_line: 19, signature: "requireAuth(req, res, next)" },
  ],
  project: {
    env_vars: [{ id: "env:DATABASE_URL", refs: [{ path: "server/db/index.js", line: 3 }], in_env_example: true }],
    tables: [{ id: "tbl:users", source: { path: "server/db/schema.sql", start_line: 1, end_line: 6 }, columns: [{ name: "email", type: "text", nullable: false }] }],
  },
};

const page = {
  schema_version: "page/1",
  slug: "api-endpoints",
  title: "API endpoints",
  sections: [
    {
      heading: "Users",
      blocks: [
        { type: "endpoint_ref", endpoint_id: "ep:POST /api/users@server/routes/users.js:8" },
        {
          type: "claim",
          claim: {
            text: "Creating a user requires a valid session (requireAuth middleware).",
            kind: "behavior",
            symbols: ["sym:server/middleware/auth.js#requireAuth"],
            evidence: [{ path: "server/routes/users.js", start_line: 8, end_line: 8 }],
          },
        },
        { type: "prose", text: "All user routes return JSON." },
        { type: "symbol_ref", symbol_id: "sym:server/controllers/users.js#createUser" },
        { type: "env_ref", env_id: "env:DATABASE_URL" },
        { type: "table_ref", table_id: "tbl:users" },
        { type: "code", kind: "known_command", lang: "bash", text: "npm run dev", source: { path: "server/package.json", script: "dev" } },
      ],
    },
  ],
};

test("renderPage produces the exact commit-pinned URL from repo + path + lines", () => {
  const { markdown } = renderPage(page, index, repo);
  assert.ok(markdown.includes(`https://github.com/acme/habit-tracker/blob/${repo.sha}/server/routes/users.js#L8`));
});

test("renderPage's endpoint signature is byte-equal to the index's own method + path", () => {
  const { markdown } = renderPage(page, index, repo);
  assert.ok(markdown.includes("`POST /api/users`"));
});

test("renderPage's symbol_ref signature is byte-equal to the index's own signature string", () => {
  const { markdown } = renderPage(page, index, repo);
  assert.ok(markdown.includes("`createUser(req, res)`"));
});

test("renderPage resolves middleware symbol_ids to their names", () => {
  const { markdown } = renderPage(page, index, repo);
  assert.ok(markdown.includes("Middleware: `requireAuth`"));
});

test("renderPage renders a table_ref's columns from the index, not the claim", () => {
  const { markdown } = renderPage(page, index, repo);
  assert.ok(markdown.includes("| `email` | `text` | no |"));
});

test("renderPage flags an unknown symbol_id instead of inventing content", () => {
  const brokenPage = { ...page, sections: [{ heading: "X", blocks: [{ type: "symbol_ref", symbol_id: "sym:nope#ghost" }] }] };
  const { markdown, warnings } = renderPage(brokenPage, index, repo);
  assert.ok(markdown.includes("Unknown symbol"));
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].reason, "unknown_symbol");
});

test("a known_command code block credits its package.json script", () => {
  const { markdown } = renderPage(page, index, repo);
  assert.ok(markdown.includes("From `server/package.json` script `dev`"));
});

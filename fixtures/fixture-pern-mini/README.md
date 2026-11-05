# fixture-pern-mini

A small, hand-built PERN-ish repo whose only job is to exercise every row of
the Scanner support matrix (Technical Design §2) before the Scanner (T06–T08)
exists. `inventory.json` is the hand-checked ground truth AT-1/AT-2/AT-3 will
diff the Scanner's real output against.

## Known deviations from a real repo

- **`server/env.example.txt` stands in for `.env.example`.** This development
  environment refuses to write files matching `.env*` (a safety rule, not a
  bug). Rename it to `.env.example` before running the real Scanner against
  this fixture — `inventory.json` already assumes that rename.
- Nothing here is meant to run. Per the project's parser-only rule, no
  `npm install` was done and nothing executes; nested `require`/`import`
  calls that wouldn't actually resolve at runtime (e.g. mixing CommonJS and
  ESM module resolution across `server/lib/*.mjs`) are intentional — only
  parseability matters.

## Where each matrix row lives

| Matrix row | File(s) |
| --- | --- |
| Files: supported extensions | one file each of `.js .jsx .mjs .cjs .ts .tsx` |
| Files: skipped (`.d.ts`, minified, node_modules, build output, >1MB) | `server/types/api.d.ts`, `server/vendor/minified.js`, `server/node_modules/fake-pkg/`, `server/build/bundle.js`, `server/vendor/huge-data.js` |
| Files: parse error | `server/broken/parse-error.js` |
| Exports: named / default / `export {a as b}` / `export * from` | `server/lib/format.mjs`, `server/lib/index.mjs` |
| Exports: `module.exports = {...}` / `.x =` / `exports.x =` | `server/controllers/habits.js`, `server/legacy/utils.cjs` |
| Exports: dynamic key / conditional (flagged) | `server/legacy/dynamic-exports.js` |
| Items: function/arrow/class/method/TS interface/type | throughout; classes in `server/controllers/habits.js`, types in `server/types/habit.ts` |
| Items: higher-order wrapper (flagged) | `server/routes/habits.js` (`asyncHandler`) |
| Items: anonymous default export named `default` | `server/lib/index.mjs` |
| Types: JSDoc / explicit TS annotations | `server/middleware/auth.js`, `server/controllers/users.js`, `server/lib/format.mjs`, `server/types/habit.ts` |
| Imports: static import / require / relative / index resolution | `server/controllers/habits.js` (`require("../lib")`) |
| Imports: alias / dynamic (unresolved) | `client/src/App.jsx` (`@/components/Nav`), `server/routes/habits.js` (`require(pluginName)`), `server/index.js` (`import("./admin-panel.js")`) |
| Env vars: dotted / bracket / destructured literal | `server/index.js`, `server/controllers/users.js`, `server/db/index.js` |
| Env vars: dynamic key (flagged) | `server/legacy/dynamic-exports.js` |
| Express: method registration, `.route().get()`, mounts, inline handlers, middleware | `server/routes/users.js`, `server/routes/habits.js`, `server/index.js` |
| Express: dynamic/non-literal prefix (flagged) | `server/index.js` (`app.use(\`/${apiVersion}/legacy\`, ...)`) |
| Schemas: SQL `CREATE TABLE`, Prisma | `server/db/schema.sql`, `server/prisma/schema.prisma` |
| Schemas: Knex/Sequelize (flagged, file listed) | `server/migrations/001_add_column.js` |
| Manifests | `package.json` at root, `server/`, `client/` |
| Frontend (Should, Task 9): routes, props | `client/src/App.jsx`, `client/src/components/*` — see `inventory.json`'s `gated.frontend_route_props` |
| Python (Should, Task 8) | `python/pkg/*.py` — see `inventory.json`'s `gated.python`; core Scanner should mark these `unsupported`, not parse them, until Task 8 ships |
| Python: notebooks skipped | `python/pkg/exploration.ipynb` |

## Independence caveat

T02 calls for this inventory to be written by whoever does *not* build the
Scanner, specifically so recall numbers aren't graded by the same person who
wrote the extractor. It was drafted solo in this pairing session, so that
hasn't happened yet — Diane should read `inventory.json` against the source
files above before Task 2 starts, and correct anything she'd have called
differently (especially the judgment calls flagged inline, like whether
Router-instance exports should be recorded as constant code items).

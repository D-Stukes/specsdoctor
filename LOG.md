# DocSync — Project Log

Newest entries first. Add an entry after every working session: date, what was done, decisions, what's next.

---

## 2026-11-05 — Task 2: Code facts (T05-T08)

**Done**
- **T05 Repo Reader:** resolves a GitHub owner/repo/ref to a SHA via `api.github.com`, streams the codeload tarball through gunzip + `tar-stream` (never to disk), and classifies every entry per §2's Files row (node_modules/build-output/`.d.ts`/minified/oversized/sensitive-file skips; Python/notebooks marked `unsupported`, gated behind Task 8; path traversal and symlink/hardlink/device entries rejected per SEC-3). Verified against synthetic malicious-archive fixtures and against a real repo (`octocat/Hello-World`) end to end.
- **T06 Scanner core:** JS/TS/JSX/TSX item + export extraction via `@babel/parser` (functions, arrow/function-expr consts, classes + methods, TS interfaces/type aliases; all the named/default/CommonJS export shapes; dynamic and conditional exports flagged rather than guessed), import resolution (static + `require`, directory/index resolution, aliases and dynamic `require()`/`import()` to `unresolved_imports`), and `process.env` extraction (literal + destructured, dynamic access flagged).
- **T07 route resolution:** cross-file mount-graph climber (`route-graph.js`) that composes nested/multiple Express mount prefixes into each endpoint's full path, flagging non-literal prefixes instead of guessing. Handles `.route().method()` chains and higher-order wrappers applied at the registration site (`asyncHandler(fn)`).
- **T08 schema extraction:** SQL `CREATE TABLE` via `pgsql-ast-parser`; a minimal hand-rolled Prisma model parser (no established library was an obvious fit for this small a need).
- Fixed two bugs in the T01 contracts found while wiring the Scanner up: the `index/1` endpoint handler's `oneOf` had `additionalProperties` scoped at the wrong level (rejected both valid shapes), and `unresolved_imports` had no room for `line`/`reason`.

**Verification**
- `server/test/scanner-fixture.test.js` runs the real Scanner against `fixture-pern-mini` and checks AT-1 (recall), AT-2 (route resolution), AT-3 (flagged-pattern reporting): **100% recall** on code items, endpoints, env vars and tables; exact file-status counts; exact flagged-pattern set; schema-valid output. (`server/scripts/run-scanner-on-fixture.mjs` is the same thing as a standalone script, for faster iteration.)
- Ran the full Reader → Scanner pipeline against a real 216-file repo (`expressjs/express`): schema-valid output, 0 parse failures, 323 items / 237 endpoints found.

**Decisions**
- Item/export extraction is scoped to module top level only (no recursing into function bodies) — matches what a documentation scanner actually needs; nested helpers aren't documented.
- A plain top-level `const`/`let` (not a function) only becomes a `constant` code item when something actually exports it (directly or via a later CommonJS assignment) — otherwise every `const express = require("express")` would be spurious noise. Functions, classes and types are always captured regardless of export status, since the matrix treats item extraction and export-status determination as separate concerns.
- Flagged-pattern convention settled through the fixture test run: `unresolved_imports` is the single place for alias/dynamic-require/dynamic-import facts (not duplicated into `coverage.flagged_patterns`); `conditional_export` gets one entry per affected branch, not one per `if` statement.

**Not done / blocked**
- M2 ("Scanner recall ≥ 95% on the fixture and ≥ 90% on both fellowship repos") only has the fixture half — the fellowship repos are still blocked on PRD §8's open decision.
- Frontend route/props structuring (Task 9) and Python support (Task 8) are deliberately out of scope here — both gated add-ons; `fixture-pern-mini/inventory.json`'s `gated` section describes what they should find once built.
- M1 is still not deployed to Render (see the 2026-11-05 Task 1 entry below).

**Next**
- Resolve PRD §8's open decisions, or move on to Task 3 (First page: runner, budget manager, Code Analyst, renderer, Writer for reference pages).

---

## 2026-11-05 — Task 1: Foundations (T01-T03)

**Done**
- Initialized the git repo (none existed) and set up a local Postgres 17 (via Homebrew) for development.
- **T01 contracts pack:** 5 Ajv-validated JSON Schemas (`snapshot/1`, `index/1`, `summary/1`, `page/1`, `verify/1` — `contracts/schemas/`), hand-written TS types mirroring them plus the API shapes (`contracts/src/`), and the §4b SQL migration (`server/db/migrations/0001_init.sql`). 16 unit tests validate every example doc from the technical design plus negative cases. All passing.
- **T02 fixtures (partial):** built `fixtures/fixture-pern-mini/`, a hand-written repo covering every row of the Scanner support matrix (§2), with a hand-checked `inventory.json` ground truth for future AT-1/AT-2/AT-3 grading. See its README for the matrix-row-to-file mapping.
- **T03 scaffold:** Express API (session auth with signed cookies + login rate limit, health check, migration runner, a stub run that writes real `runs`/`run_stages` rows and marches them queued → running → complete on a timer) and a minimal Vite + React client (access code → repo URL → polling progress). Verified M1 locally end to end, both via automated smoke tests and by driving the built app in a real browser.

**Decisions**
- Monorepo via npm workspaces: `contracts/`, `server/`, `client/`.
- `node --test` (built-in, no test framework dependency) for both `contracts` and `server`.
- Router instances exported as a module's default export aren't recorded as a code item (their registrations become `endpoint` items instead); other instance exports like a configured DB pool are — a judgment call on an ambiguity in the index/1 contract, flagged in the fixture README for Task 2.

**Not done / blocked**
- **M1 isn't actually deployed.** Everything above is verified locally; deploying to Render needs a Render account and a Neon (or other) Postgres connection string, which this session has no access to and can't create on its own.
- **T02 is incomplete:** the two fellowship repos' independent inventories are blocked on PRD §8's open decision (which two repos, and which Python library). `fixture-pern-mini`'s inventory was also drafted solo, not by someone other than the (future) Scanner author as T02 calls for — flagged for Diane to review.
- PRD §8's other open decisions (owners A/B, hosting tier, API budget, model choices, the narrower product promise) are all still open.
- Known accepted risk: `client`'s Vite 5 pulls in an esbuild version with a moderate, dev-server-only CVE (GHSA-67mh-4wv8-2f99); fixing it means a Vite 7/8 major bump, deferred since it doesn't affect the production build Render serves.

**Next**
- Resolve PRD §8 open decisions (fellowship repos, owners, hosting, budget, models).
- Either get Render/Neon access set up to actually deploy and close out M1, or treat "verified locally" as good enough for now and move to Task 2 (Code facts: Repo Reader, Scanner, routes, schemas — T05-T08).

---

## 2026-11-05 — Docs finalized, designs reviewed, folder set up

**Done**
- Wrote **Final PRD** (`docs/DocSync-Final-PRD.md`; online: https://claude.ai/artifact/RMNfqfviMeb3ZKHxPU7aw3).
- Renamed the implementation plan to **Technical Design & Build Tasks** (`docs/DocSync-Technical-Design.md`; online: https://claude.ai/artifact/LfXhkY3hA2ESQrXrQKiP2F). Replaced the 10-day schedule with **12 numbered tasks**.
- Added specs for three add-ons: interactive **repo map** (Task 10), animated **guided tour, Level 2** (Task 11), **plain-language user guides** (Task 12).
- Redesigned the home screen and built an interactive repo-map/tour mockup on the design canvas: https://claude.ai/artifact/CCX2UFbXQA5KstvKhoJb7D
- Wrote a Google Stitch prompt for the full screen suite. Stitch produced 3 screens + `DESIGN.md` (in `stitch_docsync_ui_design_system/`).
- Reviewed the Stitch output: 4 must-fix and 7 should-fix items, 16 screens still missing (see `docs/Design-Notes.md`).
- Created this folder structure, `LOG.md` and `CLAUDE.md` so work can continue in Claude Code.

**Decisions**
- Build by **tasks, not days**. Core Tasks 1–6 run in order; add-on Tasks 7–12 start only after the core ships.
- Suggested add-on order: 10 Repo map → 11 Guided tour → 7 AI claim check → 9 Frontend page → 12 User guides → 8 Python.
- The guided tour explains **the pasted repository**, not DocSync itself.
- Docs for everyday users are in scope as **Task 12**. Until then, the "Write for" control shows only Developers; the other options read "Coming soon".
- Product promise: "source-linked drafts … flags uncertain claims". The word **"verified" is never used**.

**Next**
- Answer the open decisions (PRD §12): test repos, owners A/B, hosting tier, API budget, models.
- Start **Task 1 — Foundations** (T01 contracts, T02 fixtures + independent inventory, T03 scaffold + stub deploy).

---

## 2026-11-04 — From DocSync v1 to the v5 review

**Done**
- Read the original DocSync PRD (Diane, v0.1): agents that keep existing docs in sync via PRs.
- Explored a generator variant (**DocGen**: read a codebase, write its docs from scratch) and wrote a PRD for it.
- Reviewed **PRD Version 4** (merged DocSync v2 + DocGen). Wrote **Version 5 (Review Draft)** with 15 changes and 6 prunes, each with a reason and a status dropdown: https://claude.ai/artifact/TJoNXcUM62MAhEi76pVmqQ
- Responded to the external reviewer's feedback with an implementation plan (contracts, database, API, security, backlog, acceptance tests).

**Decisions**
- Keep the parser-first design: **code reads, AI explains**. AI never writes signatures or source links.
- Stack: PERN (React/Vite, Express, Postgres on Neon), one Render service, Claude via the Anthropic SDK (Haiku 5.5 for high-volume stages, Sonnet 5.5 for narrative pages).
- Four statuses per claim: source check, AI assessment, execution (always "not run"), human review.
- Pruned for v1: AI-only fallback for other languages, PR creation, Refresh/caching (now a Could), rich editor (now a Markdown editor), split hosting.

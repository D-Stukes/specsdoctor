# DocSync — Project Log

Newest entries first. Add an entry after every working session: date, what was done, decisions, what's next.

---

## 2026-11-07 — Task 6 (part): Retention cleanup (T23)

**Done**
- `server/src/runner/retention.js`: `deleteExpiredFailedRuns()` deletes `failed` runs older than 7 days (by `finished_at`, falling back to `created_at`). Every child table (stages, pages, findings, source text) cascades from `runs`, so one `DELETE` covers it. `startRetentionJob()` runs it at server startup and every 24 hours (timer is `unref`'d), wired into `index.js` next to restart recovery.
- `server/test/retention.test.js`: an 8-day-old failed run is removed along with its child rows; a 1-day-old failed run, a 30-day-old complete run and a 30-day-old queued run all stay. Full suite passed 3 times in a row (77/77), so it doesn't collide with `queue.test.js`'s global cleanup.

**Not done / caveats**
- Only the `failed` case in the spec. Complete runs are kept forever by design (they can be rechecked); there's no storage-pressure cleanup for the Neon 0.5 GB limit.
- The 24-hour timer isn't tested; only the delete function is.

**Next**
- T24 evaluation, T25 demo assets.

---

## 2026-11-07 — Task 6 (part): Security hardening (T22, SEC-T)

**Done**
- Audited SEC-1 to SEC-9 against the code. Already in place from earlier tasks: URL allowlist (SEC-2), tar path/symlink/hardlink/device rejection and in-memory extraction (SEC-3), sensitive-file skipping (SEC-5 file half), session cookie on every non-health route with signed/HTTP-only/SameSite=Lax/Secure-in-prod (SEC-8), login limiter (SEC-9), repo text delimited as data in prompts (SEC-1).
- **The one real gap: key redaction (SEC-5 second half).** Added `server/src/ai/redact.js` (private-key blocks, AWS, GitHub, Stripe, Anthropic, Slack keys, quoted 32+ char mixed letter/digit literals) and applied it inside `callStructured`, the single choke point every AI stage goes through, so no stage can forget it. `setPromptCapture` is a test hook that sees the post-redaction prompt, including in stub mode.
- `server/test/security.test.js` (8 tests): redaction patterns and false-positive check, prompt capture, `.env`/`.pem`/`credentials.json` never reach `contentByPath` while `.env.example` does, hardlinks and device files rejected, look-alike/non-GitHub URLs rejected, and every saved-content route (including export) returns 401 without a cookie. Full suite 76/76.

**Not done / caveats**
- "`<script>` in README renders as text" is true by construction, not tested: the viewer shows page text as a React text child inside `<pre>` (escaped). If Task 10/11 swaps in `react-markdown`, raw HTML must stay disabled and that needs a real test then.
- Redaction is pattern-based and will miss unusual secret formats; env var values are never extracted anyway.
- SEC-6 (no prompt bodies in logs) was checked by reading: `model_calls` stores token counts only. No automated test.

**Next**
- T23 retention cleanup, then T24 evaluation and T25 demo assets.

---

## 2026-11-07 — Task 6 (part): Export ZIP (T18)

**Done**
- `GET /api/runs/:id/export.zip[?include_review=true]` (`server/src/routes/runs.js`, builders in `server/src/export/`): ZIP with `mkdocs.yml` (material theme, Mermaid superfences, admonition), `README.md`, `docs/provenance.md` (repo, SHA, date, models, page status/reviewed, open findings by severity), `docs/<slug>.md` for every page, and `docs/review.md` only when asked. 404 for unknown run, 409 `run_not_ready` unless the run is `complete`/`complete_with_errors`.
- Open findings always stay inline on their page as `!!! warning` (or danger/info by severity) admonitions under "Open findings on this page".
- ZIP assembled in memory with `archiver@8` (`new ZipArchive(...)`; the old `archiver('zip')` factory no longer exists). Accepted 5 audit warnings vs 7 on 7.0.1.
- Client: "Export" section with two download links on finished runs.
- AT-14 test added (skeleton files present, review.md only on request, provenance present). A sample export builds with `mkdocs build --strict`.

**Not done**
- T22 security hardening/SEC tests, T23 retention cleanup, T24 evaluation, T25 demo assets.
- Export of a real (non-stub) run hasn't been strict-built end to end; only a sample ZIP with the same builders was.
- Client download links not yet checked in a browser.

**Next**
- Remaining Task 6 items, starting with T22.

---

## 2026-11-06 — Task 5: Trust + review (T13, T17) — M5 satisfied

**Done**
- **T13 Structural Verifier** (`server/src/stages/verifier.js`): structural checks per claim (every `symbols`/evidence `symbol_id` resolves to a real index item; every evidence line range is within the pinned file's real length), reference-completeness coverage per page, and a supplementary scan of rendered Markdown for inline-code mentions that match no real symbol/builtin/dependency. The AI claim check (rule 4, Task 7) and the repair loop (T16) aren't built - every claim's `ai.assessment` is honestly `not_assessed`, findings are reported but nothing is auto-retried. Wired into the pipeline: every page now goes through one render → save → verify sequence: a page with a failed claim correctly pushes the run to `complete_with_errors`.
- **T17 editing + review + findings**: `PUT /api/runs/:id/pages/:slug` (save an edit as a new revision, 409 on a stale `base_rev`, empty pages explicitly allowed), `POST .../review`, `GET /api/runs/:id/findings`, `PATCH /api/findings/:id` (note required unless reopening). `GET .../pages` and `.../pages/:slug` now report real `checks_fresh`/`reviewed`/`open_findings`/per-claim AI-assessment counts instead of Task 3's hardcoded placeholders.
- **Client**: a working Edit → Save and Mark reviewed flow in `PageViewer`, verified end to end in a real browser against a real run (rev 1 → edit → rev 2, origin flips to "user", reviewed state updates immediately).

**M5 is now satisfied**: AT-4 (injected defects caught - fake function, out-of-range line, nonexistent file, fake endpoint, all correctly flagged) and AT-13 (edit, save, reload, rev_conflict, empty-page persistence, review, resolve a finding) both pass.

**Bug found and fixed - a real node-postgres driver gotcha**
- Two queries reused the same `$N` parameter in two different type contexts within one statement (e.g. `$2::text IS NULL OR ri.status = $2`, where `ri.status` is the `review_status` enum) - Postgres couldn't settle on a single type for the parameter, and the query **never returned** via the `pg` driver, even though the identical SQL with a literal value ran instantly in `psql`. Not a thrown error - a true hang, which made the first attempt at `AT-13`'s test time out at 15s with no explanation. Found via binary-search debug logging across several timed background test runs. Fixed by avoiding the dual-typed parameter entirely in both places (`GET /findings`: conditional `WHERE` built in JS; `PATCH /findings/:id`: `resolved_at` computed in JS instead of a `$`-bound `CASE`). Worth remembering for any future parameterized query touching an enum column: never let one parameter serve two different implicit types in the same statement.
- Also noticed (not fixed): `npm test`'s test files share one local Postgres database, and `queue.test.js`'s aggressive `DELETE FROM runs` cleanup (needed since its limits are global/app-wide) can wipe rows another test file created in the same overall `npm test` invocation. Harmless for CI (each file's own assertions still run and pass before any cross-file interference), but it means the local dev DB can end up missing data you'd expect to still be there after running the full suite - don't be surprised by it.

**Not done / blocked**
- T16 (repair loop) isn't built - a failed claim is reported, never retried.
- The AI claim check (Task 7) isn't built - `ai_assessment` is always `not_assessed`; the page banner text the spec describes for this case isn't rendered yet either.
- Source-link bounds aren't rechecked on a user edit (only the unknown-mention scan is) - needs per-revision file content, which isn't persisted yet.

**Next**
- Push this (stacked on the still-open PR #4, same pattern as before) and keep going - either T16 (repair loop) or start on something from Task 6 (export, security hardening) once the current PR chain gets reviewed.

---

## 2026-11-06 — Task 4 continued: two more Architect pages, M4 fully satisfied

**Done**
- **getting-started.md** and **configuration.md**, built the same deterministic, never-fails way as T15's original four pages. getting-started.md deliberately only cites commands literally copied from `package.json` scripts (§2 "known vs inferred setup") - no inferred steps, since flagging those for review needs Task 5's Verifier, which doesn't exist yet. configuration.md lists every env var found referenced in the code, including ones with no `.env.example` entry.
- **M4's "time ... measured"**: `GET /api/runs/:id` and `GET /api/runs` now return `duration_ms`, computed from `started_at`/`finished_at`; surfaced in the client next to Cost, and inline in the run list.
- Client: the generated-pages list now shows each page's real status (generated/not_applicable/not_detected/unsupported/generation_failed), not just a bare link - a first step toward T14's "sidebar with page statuses."

**Verification**
- 8 new unit tests (real script/env content, honest "none found" copy, no inferred steps leaking in).
- Full browser walkthrough against `jonschlinkert/is-number`: Architect now produces 7 pages; Getting started correctly cites the real `test` script; Configuration honestly reports no env vars for a repo that genuinely has none; Time shows next to Cost.
- Full suite: 54/54 passing.

**M4 status:** all three parts now hold for a real repo (not yet a fellowship repo, still blocked on PRD §8) - a full run is saved, can be reopened, and both cost and time are measured and shown.

**Not done**
- `frontend.md` (gated behind Task 9) and any AI-narrative wrapping for getting-started/configuration aren't built - both are fully deterministic for now.
- T14's real sidebar layout and findings panel aren't built (the panel needs Task 5's Verifier).

**Next**
- Task 5 (Verifier, repair loop, editing, findings) is probably the highest-value next step - it's what makes "inferred steps become a review item" and claim-checking real, and several `page_status` values currently never get used because nothing populates review_items yet.

---

## 2026-11-06 — Task 4 started: Architect stage (T15) + run list (T14 partial)

**Done**
- **T15 Architect:** four pages built deterministically, unconditionally (not just as a fallback - §2 says these *are* the fallback): `tech-stack.md` (workspace scripts/deps as tables), `data-model.md` (real tables via `table_ref`), `architecture.md` (a Mermaid import graph from the parser's own edges), `api-endpoints.md` (every Express route via `endpoint_ref`, reusing the Writer's commit-pinned renderer). Plus one AI-narrative page, `overview.md` (Sonnet, synthesizing every module's summary) - same claim/symbol_id discipline as the Writer, no deterministic fallback defined for this one so it's simply absent if it fails, not degraded.
- **T14 (partial):** a "Recent runs" list in the client (`GET /api/runs`), each entry reopens that run's progress + generated pages - the other half of M4 ("a full run ... is saved and can be reopened"), which previously only existed as an API with no UI.
- User declined posting a GitHub issue to resolve the SpecsDoctor design-direction question with Diane for now ("no need, we can go ahead with the task") - still open, not blocking.

**Bug found and fixed**
- The Architect stage's `run_stages` row was initialized with a hardcoded `items_total` of 4, but it can produce 5 pages (the 4 deterministic ones plus `overview.md` when summaries exist) - showed as "DONE 5/4" in the UI. Fixed by leaving `items_total` unset for this stage, same as the other variable-count stages (reader, scanner).

**Verification**
- Unit tests for every deterministic Architect page (`server/test/architect-deterministic.test.js`): page/1-valid, real content from real index data, honest "none found" copy when a repo has nothing of that kind.
- Real-repo checks: `expressjs/express`'s tech-stack table, Mermaid graph and endpoint links all verified correct; `jonschlinkert/is-number`'s Architecture page's Mermaid graph confirmed to match the repo's actual `require()` relationship.
- Full browser walkthrough: run list → reopen a past (failed) run → back to list → start a fresh run → open a generated Architect page.
- Full suite: 51/51 passing.

**Not done**
- Task 4's other narrative pages (getting-started, configuration, frontend) aren't built - `frontend.md` is gated behind Task 9 anyway, but getting-started/configuration are genuine gaps.
- T14's sidebar-with-page-statuses and findings panel aren't built (findings need Task 5's Verifier, which doesn't exist).
- M4's "time... measured" half isn't instrumented anywhere yet (cost is; wall-clock time per run isn't surfaced).
- Still using real public repos as fellowship-repo stand-ins - PRD §8's repo choice is still open.

**Next**
- Finish Task 4 (remaining narrative pages, sidebar) or move to Task 5 (Verifier, repair loop, editing, findings).

---

## 2026-11-06 — Repo merged into specsdoctor; finished T04

**Repo**
- PR #1 (all of Tasks 1-3 plus the UI restyle) was reviewed and merged into `D-Stukes/specsdoctor` main. This project now builds on top of that shared history.
- Diane shared a landing page concept under the name "SpecsDoctor" (bright corporate-SaaS look, stock photography) - different visual direction from the already-built "Precision Instrument Developer System." Flagged for discussion, not yet resolved: is it a separate public marketing page, or a replacement for the app's own look? Naming-wise, "SpecsDoctor" (unlike bare "SpecDoctor") doesn't collide with the CPU-security-research tool found earlier.

**Done - finished T04**
- **Queue limits (§4a):** `runner/limits.js` + `runner/queue.js`. `POST /api/runs` now actually enqueues (`status: 'queued'`) instead of starting immediately; `tryStartNext()` is the in-process runner's single thread of execution (one active run at a time, matching "no external queue"), picking the oldest queued run, chaining to the next one when a run finishes. Separate limits for queued-runs-app-wide (503 `queue_full`) and runs-per-hour (429 `rate_limited`) - these turned out to be independent limits in §4a, not combined, which an early draft got wrong before the tests caught it.
- **Queue timeout:** a run queued past 30 minutes is marked `failed: queue_timeout` instead of starting stale.
- **Restart recovery:** `recoverInterruptedRuns()` runs on server boot - any run stuck `running` from a dead process becomes `failed: interrupted`; queued runs are left alone for `tryStartNext()` to pick up normally.
- Made `getLimits()` a function reading `process.env` live rather than a frozen constant - needed for tests to set different limits, and more correct for a real deploy changing env vars without a restart.

**Verification**
- `server/test/queue.test.js`: unit tests for every new transition (queue_full, rate_limited, duplicate Generate, queue_timeout, queued→running chaining, AT-11's interrupted-recovery). All isolated per-test since these limits are global ("app-wide"), not per-repo.
- **Real kill-and-restart**, not just simulated: started a run against `lodash/lodash`, `kill -9`'d the server process immediately, restarted, confirmed the run (still `queued` at kill time) resumed and completed normally. The "stuck `running` → `failed: interrupted`" half is covered deterministically by the automated test instead, since hitting that exact race window via shell timing proved too flaky to rely on manually.
- Full suite: 46/46 passing.

**Not done**
- T04 is now feature-complete per its backlog item. Task 4 (Architect, full Viewer UI) and Task 5 (Verifier, review/editing) remain unbuilt.
- The SpecsDoctor landing-page/naming question is still open.

**Next**
- Push this to specsdoctor (new branch + PR, same pattern as before).
- Then: Task 4, or resolve the design-direction question with Diane first.

---

## 2026-11-05 — Restyled the Task 1 UI against the design system

**Done**
- Applied the "Precision Instrument Developer System" (`stitch_docsync_ui_design_system/precision_instrument_developer_system/DESIGN.md`) to the real app: access-code screen, repo-URL/intake screen, and a new run-progress + page-viewer screen (not a restyle - Design-Notes.md lists "Run in progress" as a screen Stitch hasn't produced yet, so this is a first design pass at it).
- Applied `docs/Design-Notes.md`'s must-fix items 1, 2, 3 and 5 directly in the real implementation (not by regenerating the Stitch mockup files, which still show the originals): empty, honestly-labeled access-code field instead of a pre-filled "ACTIVE" key; every fabricated fact removed (client-side AST parsing, latency numbers, fake API/worker telemetry); "Write for" shows Developers active with the other two visibly disabled "Coming soon"; Geist + JetBrains Mono actually load via Google Fonts (the original Stitch output silently fell back to serif).
- Plain CSS with custom properties for the DESIGN.md tokens (`client/src/theme.css`), not Tailwind - decided two simple screens didn't justify a new build dependency.

**Verification**
- Drove the full flow in a real browser end to end: access code → repo form → a real run against `jonschlinkert/is-number` → the new progress screen → opened a generated page and confirmed its commit-pinned source link is real.

**Not done**
- Design-Notes.md's items 4 and 6-11 (the "Verified" wording in DESIGN.md itself, Home's full dashboard chrome, the repo map, the guided tour) touch screens Task 1 doesn't build - still open for Tasks 4/5/9-11.
- The Stitch mockup files themselves (`docsync_access_gate/`, `docsync_home_new_documentation/`) are untouched - they still show the pre-fix originals for reference only.

**Next**
- Finish T04 (restart recovery, queue limits) or move to Task 4 (Architect stage, full Viewer UI - which would need its own Stitch screens generated first per Design-Notes.md's missing-screens list).

---

## 2026-11-05 — Task 3: First page (T04 partial, T09-T12)

**Done**
- **T09 AI client + budget manager:** `server/src/ai/client.js` wraps `client.messages.parse()` with `output_config.format` set directly to the T01 JSON schemas (no Zod re-derivation - one schema, two consumers). `server/src/ai/budget-manager.js` implements §4a's reservation algorithm: reserve worst-case before scheduling, commit actual cost from `response.usage`, 35% protected reserve only Writer/Verifier can draw on. One retry on 429/5xx/timeout; every attempt (success or failure) writes a `model_calls` row. `AI_STUB_MODE` defaults to **true** - `POST /api/runs` never spends real money unless someone explicitly sets `AI_STUB_MODE=false` with a real `ANTHROPIC_API_KEY`.
- **T10 Code Analyst:** one module per call, `summary/1` structured output, rejects any `symbol_id` the model invents instead of trusting it.
- **T11 deterministic renderer:** `page/1` JSON → Markdown. Every signature, parameter table and link comes from the index via `symbol_ref`/`endpoint_ref`/`env_ref`/`table_ref` expansion, with commit-pinned GitHub URLs - never from the model.
- **T12 Writer (reference pages only):** builds every `symbol_ref` block itself from the index; the model is only allowed to write short prose/claims, and any claim citing a `symbol_id` outside the module gets dropped before the page is saved.
- **T04 (partial):** `runner/pipeline.js` replaces Task 1's fake-timer stub with the real Reader → Scanner → Analyst → Writer → Renderer sequence, writing real `run_stages`/`run_events`/`model_calls`/`index_items`/`pages`/`page_revisions` rows. Architect and Verifier stages are marked `skipped` (not built - Task 4, Task 5). Not done: full restart recovery and queue-size limits (T04's other two acceptance criteria).
- Loaded the `claude-api` skill before touching any Anthropic SDK code, per its own trigger rule.

**Bug found and fixed**
- The Scanner's `documented` field was tracking "has a JSDoc comment" instead of §2's actual definition ("exported (JS/TS) or public (Python)"). This matters because the usable-output rule (§4a) checks for at least one documented item - with the wrong definition, a real repo like `jonschlinkert/is-number` (one exported function, no JSDoc) would have failed the usable-output check and the whole run would report `failed` even though it has perfectly good content to document. Fixed by computing `documented = exported` as a post-process step once every export-determination pass has run. `fixture-pern-mini/inventory.json`'s `documented` fields weren't retroactively corrected to match (recall grading is ID-based, not field-based, so this doesn't affect AT-1/AT-2/AT-3) - flagged here as a known follow-up.
- Also found while testing against real repos: `module.exports = function(x) {...}` (an anonymous function expression assigning the *entire* export, no named variable involved) wasn't handled at all - fixed in `extract-items-exports.js`, named `"default"` per the same convention as an anonymous ESM default export.

**Verification**
- Unit tests for the budget manager (concurrent-reservation shape, AT-9) and the renderer (byte-equal signatures/URLs).
- `server/test/smoke.test.js`'s M3 test runs the real pipeline end to end against a real, tiny, stable public repo (`jonschlinkert/is-number`) and asserts a real generated page with a real commit-pinned source link exists, with cost recorded (`$0` under the default stub AI mode). Also re-verified manually via curl and by driving the actual browser UI through the full flow.
- All 40 tests pass (16 contracts + 24 server from before + this session's additions).

**Decisions**
- Picked `jonschlinkert/is-number` as the real-repo smoke-test target (tiny, stable, has one genuinely exported, undocumented function) rather than inventing a synthetic GitHub fixture - deliberately not the two fellowship repos, which are still an open PRD §8 decision.
- Reused the T01 JSON schemas directly as `output_config.format` for structured outputs instead of maintaining parallel Zod schemas - one source of truth for both runtime Ajv validation and the model's output contract.
- Duplicate-run guard is keyed on `(repo, requested_ref)` at the application level, not the schema's `(repo, resolved_sha)` unique index - `resolved_sha` isn't known until the Repo Reader finishes, so the DB-level index alone wouldn't catch a double-click before resolution.

**Not done / blocked**
- T04's restart-recovery (`running` → `failed: interrupted` on boot) and queue-size/rate limits aren't built.
- Architect (Task 4) and Verifier (Task 5) stages don't exist - every page is reference-only, with no narrative pages, no claim checking, no review items yet.
- No real (paid) AI call has been made against this app - everything verified so far is `AI_STUB_MODE=true`. The user would need to opt in explicitly for a real-cost run.
- M3 is satisfied against a real public repo, not a fellowship repo (still blocked on PRD §8).

**Next**
- User asked to restyle the Task 1 UI (access gate, repo-URL form) against the Stitch design system (`stitch_docsync_ui_design_system/`, see `docs/Design-Notes.md`) next - in progress as of this entry.
- After that: finish T04 (restart recovery, queue limits), or move to Task 4 (Architect, full Viewer UI).

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

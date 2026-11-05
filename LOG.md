# DocSync — Project Log

Newest entries first. Add an entry after every working session: date, what was done, decisions, what's next.

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

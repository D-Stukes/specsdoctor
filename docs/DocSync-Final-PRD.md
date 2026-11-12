# SpecsDoctor — Final PRD

> Markdown copy of the Claude doc: https://claude.ai/artifact/RMNfqfviMeb3ZKHxPU7aw3 (exported 2026-11-05).

Nov 5, 2026 · Diane Stukes & Dikshyant Giri

SpecsDoctor turns a public GitHub repository into source-linked documentation drafts, an interactive map of the code, and an animated guided tour, and flags anything uncertain for a person to review. This PRD consolidates Version 4, the Version 5 review, the reviewer's feedback, and the add-on features agreed afterward.

## 1. Overview and problem

**Authors:** Diane Stukes & Dikshyant Giri · **Version:** 1.0 (final) · **Course:** Pursuit L2, Weeks 7 & 8 · **Team:** one pair, building with AI coding tools · **Target role:** Documentation Engineer

Many software projects ship with little or no documentation, or a README that is out of date. Writing docs from scratch is slow: a technical writer reads the code, interviews engineers, maps how the parts connect, then writes overview, setup, architecture and API pages. Much of that is high-volume, rule-based work an agent team can draft.

SpecsDoctor is a web app. The user pastes a public GitHub URL and clicks **Create docs**. Plain code reads the repository and extracts exact facts (functions, routes, environment variables, tables). AI agents explain those facts and write the pages. Plain code then fills in signatures and source links and checks the AI's work. The result is a documentation set inside the app, with every technical statement linked to the lines it came from, plus a review list of anything uncertain. The agents draft; a person approves.

## 2. Product promise and what each status means

**Promise:** SpecsDoctor generates source-linked documentation drafts, checks extracted names and signatures against the code, and flags unsupported or uncertain claims for human review. SpecsDoctor never calls its output "verified."

Each technical statement carries four separate statuses, because a real function name and a valid link do not prove that a description of behavior is correct.

| Status | Shown as | What it means |
| --- | --- | --- |
| Source check | Source-checked / Failed | The functions, routes and line ranges it mentions exist in the pinned commit, and signatures match the code |
| AI assessment | AI-assessed: supported / contradicted / insufficient evidence / not assessed | A model compared the statement with the cited code; this is a judgment, not proof |
| Execution | Not run | SpecsDoctor never runs the project or its examples |
| Human review | Reviewed / Unreviewed | A person read this revision of the page |

The AI's own confidence never counts as a check. Setup steps copied from `package.json` are marked **known**; steps the AI inferred are marked **inferred** and always go to review.

## 3. Goals and non-goals

### Goals

- Turn a public GitHub URL into a full first draft of developer documentation: overview, tech stack, getting started, configuration, architecture, API endpoints, data model and reference pages.
- Ground every technical statement in the code: facts come from a parser, each statement links to its file and lines at one pinned commit.
- Flag uncertainty instead of guessing, in a review list a person works through.
- Let the user review, edit, save, reopen and export the docs (Markdown + MkDocs).
- Show a clean multi-agent pattern: focused AI stages coordinated by plain code, with a human gate.
- After the core ships: an interactive repo map, an animated guided tour of the repository, and plain-language guides for everyday users of the app.

### Non-goals

- **No publishing or merging.** SpecsDoctor shows and exports drafts; people decide what goes live.
- **No running code.** SpecsDoctor never installs, builds or runs the repository or its examples.
- **Public repositories only,** one repository per run, subject to archive limits and an AI spending cap.
- **Languages:** JavaScript/TypeScript with Express in the core; Python as an add-on. Other languages are shown as "Not supported in this version."
- **No screenshots or walkthroughs of a running app.** User guides (add-on) are written from the code only.
- No automatic syncing after code changes, no pull requests, no private repositories, no video export of tours (all future work).

## 4. Users and readers

| Role | Who | What they need |
| --- | --- | --- |
| Operator | A technical writer or documentation engineer handed an undocumented codebase | A solid first draft fast, and a clear list of what to check with engineers |
| Developer reader | Someone installing, running or contributing to the project | Accurate setup, a clear architecture picture, a complete API reference, and a guided tour to get oriented |
| Everyday user reader (add-on) | Someone using the app the repository builds | Plain-language "how do I…" guides with the exact button and field names |
| Reviewer | Usually the operator, sometimes the code's maintainer | Findings that point straight to the uncertain statement and its code |

For the class build, the operators are the two authors. Test targets are two of their fellowship PERN repositories and one small open-source Python library (for the Python add-on).

## 5. What SpecsDoctor produces

### Core outputs (v1)

| Page | Contents | Built from |
| --- | --- | --- |
| Overview | What the project is, who it is for, key features | README + module summaries |
| Tech stack | Languages, frameworks, dependencies with versions | `package.json` files (parser) |
| Getting started | Requirements, install and run commands (known vs inferred) | Manifests and scripts (parser) |
| Configuration | Environment variables and where each is used | `process.env` uses and `.env.example` (parser) |
| Architecture | How the parts connect, with a diagram | Import graph (parser) + Architect agent |
| API endpoints | Method, full path, handler, middleware, purpose | Express routes resolved across files (parser) |
| Data model | Tables, columns and relationships | SQL and Prisma schema files (parser) |
| Reference | Every exported function and class: signature, parameters, purpose, source link | Index (parser) + Code Analyst |
| Review list | Uncertain or failed statements and open questions | Verifier |

Every page shows one status: **Generated**, **Not applicable** (nothing to document, such as no API), **Not detected by this run** (extraction was partial), **Not supported in this version**, or **Generation failed**. Export is a ZIP of Markdown pages with `mkdocs.yml` and a provenance page; unresolved warnings stay in the pages.

### Add-on outputs (after the core ships)

| Output | What the user gets |
| --- | --- |
| **Repo map** | An interactive map of pages, routes, middleware, handlers and tables, with Architecture, Request trace and Dependencies views. Every line on the map comes from the code; guessed links are dashed and labeled. |
| **Guided tour** | An animated, narrated walkthrough **of the pasted repository**, played on the repo map by an original guide character with voice and captions. Four tours: Big picture, Follow a request, How data is stored, Where to start. |
| **User guides** | Plain-language "How do I…" guides for everyday users of the app, with exact button and field names, chosen with "Write for: Everyday users / Both." Labeled as written from code, without screenshots. |
| **Frontend page** | React page routes, top-level components and props, and which API each page calls. |
| **AI claim check** | An AI judgment on whether each statement is supported by the code it cites. |
| **Python support** | The same facts and pages for Python repositories. |

## 6. How it works, in brief

**Code reads, AI explains.** Plain code extracts the facts; AI stages only explain them and return structured statements; plain code renders the pages and checks them. AI never writes a signature or a source link.

1. **Start:** the user enters an access code, pastes a repository URL (optionally a branch), and clicks Create docs. The run continues in the background; the page shows each stage's progress.
2. **Repo Reader** (plain code) resolves the branch to one commit, downloads it safely, and skips binaries, dependencies and secret files.
3. **Scanner** (plain code) extracts functions, exports, imports, routes (joining mounts across files), environment variables, scripts and tables, plus a report of anything it could not read.
4. **Code Analyst** (AI) explains each file, one per call, citing only items in the extracted index.
5. **Architect and Writer** (AI) write each page as structured statements, each pointing at its evidence.
6. **Renderer** (plain code) turns statements into Markdown and inserts exact signatures and commit-pinned GitHub links.
7. **Verifier** checks every name, signature and line range; statements that fail go back for one repair, then become warnings and review items.
8. **Review:** the person reads, edits, resolves findings, marks pages reviewed and exports.

Every AI call goes through a budget manager that reserves cost before it runs, so a run cannot exceed its spending cap. The full architecture, contracts and data model are in `DocSync-Technical-Design.md`.

## 7. Functional requirements

### Core (Tasks 1–6)

| ID | Requirement | Priority | Task |
| --- | --- | --- | --- |
| FR-1 | Enter an access code; every page, edit and export requires it. | Must | 1 |
| FR-2 | Paste a public GitHub URL, optionally a branch; invalid, private or missing repos get a readable error and no run starts. | Must | 1 |
| FR-3 | Runs execute in the background with per-stage progress; closing the browser does not stop a run; a duplicate request returns the existing run. | Must | 3 |
| FR-4 | Every run is pinned to one commit; every source link points at that commit. | Must | 2 |
| FR-5 | The repository is downloaded once, with size limits, unsafe paths rejected and secret files skipped; repository code is never executed. | Must | 2 |
| FR-6 | The Scanner extracts JS/TS functions, classes, exports, imports, Express routes (with mounts joined across files), environment variables, scripts and SQL/Prisma tables, and reports what it could not read. | Must | 2 |
| FR-7 | AI stages return only schema-checked JSON and reference only items in the index; signatures and links are inserted by the renderer. | Must | 3 |
| FR-8 | Every page appears with one of the five page statuses. | Must | 4 |
| FR-9 | Architecture, tech-stack and data-model pages still render from parser facts if the Architect fails. | Must | 4 |
| FR-10 | The Verifier flags unknown names, mismatched signatures and out-of-range citations; failed statements get one repair, then become warnings and review items. | Must | 5 |
| FR-11 | Users edit pages in Markdown with explicit Save; edits create a new revision and mark earlier AI assessments as stale. | Must | 5 |
| FR-12 | Findings can be marked corrected, dismissed or accepted as uncertain, each with a note and time; pages can be marked reviewed per revision. | Must | 5 |
| FR-13 | Saved runs are listed and can be reopened. | Must | 4 |
| FR-14 | Export a ZIP of Markdown pages, `mkdocs.yml` and a provenance page; unresolved warnings stay inline; the exported site builds. | Must | 6 |
| FR-15 | Each run has a spending cap enforced before calls are made; queue size is limited. | Must | 3 |
| FR-16 | One failing file, page or check does not stop the run; a run is saved only if it produced usable documentation. | Must | 4 |

### Add-ons (Tasks 7–12)

| ID | Requirement | Priority | Task |
| --- | --- | --- | --- |
| FR-17 | AI claim check marks each statement supported, contradicted or insufficient evidence, with a one-sentence reason. | Should | 7 |
| FR-18 | Python repositories get the same extraction and pages. | Should | 8 |
| FR-19 | A frontend page lists React routes, top-level components with props, and the API each page calls. | Should | 9 |
| FR-20 | Interactive repo map with three views, search, minimap and a node drawer; every edge has evidence or is marked inferred. | Should | 10 |
| FR-21 | Four guided tours per run, played on the repo map by an original animated guide with voice, captions, speed control, keyboard control and a reduced-motion mode; every stop points at real code. | Should | 11 |
| FR-22 | Plain-language user guides selected with "Write for"; button and field names copied exactly from the code; jargon flagged; each page labeled as written from code. | Should | 12 |

## 8. Design direction and mockups

The look is **precise, calm and techno**: a dark-first interface (with a light theme) that feels like a precision instrument. High-fidelity mockups exist for the home screen and for the repo map with a guided tour playing; the tour mockup is interactive. See `Design-Notes.md`.

- **Palette:** graphite background `#0D1013`, mint accent `#7EE0C3` for primary actions and focus; each output has its own color block: Docs mint, Repo map periwinkle `#A9B6FF`, Guided tour amber `#F4C27A`. Status colors: green source-checked, amber needs review, red contradicted, grey not assessed.
- **Type:** Geist for interface text (light-weight large headlines), Geist Mono for code, paths, commits and small uppercase labels.
- **Inspiration:** Dropbox's brand site (bold color-block "chapters") for the three output tiles; Attio's Academy (numbered, structured learning paths) for tour lists and tables.
- **Guide character:** an original amber orb with two rounded eyes; not based on any existing mascot.
- **Motion:** purposeful only (camera glide, travelling dot along a request path); a reduced-motion mode replaces it with fades.
- **Accessibility:** WCAG AA contrast, visible focus, real buttons and labels, captions always available.

The "Write for: Everyday users / Both" option in the mockups shows as disabled with "Coming soon" until user guides (Task 12) ship.

## 9. Release plan: tasks, not dates

Work is divided into 12 numbered tasks. **Tasks 1–6 are the core** and run in order; each ends in a working milestone. **Tasks 7–12 are add-ons** that start only after the core ships. Detailed backlog items, owners and acceptance tests are in the technical document.

| Task | What it delivers | Done when |
| --- | --- | --- |
| 1. Foundations | Contracts, test fixtures, app scaffold, deployed stub flow | The deployed app takes a code and a URL and shows a stub run |
| 2. Code facts | Repo Reader and Scanner | Scanner finds ≥ 95% of hand-checked items on the fixture, ≥ 90% on real repos |
| 3. First page | Run engine, budget manager, Code Analyst, renderer, Writer | One real reference page in the app, with its cost recorded |
| 4. Full docs set | All pages, Architect, viewer, saved runs | Full runs on both fellowship repos, saved and reopened |
| 5. Trust + review | Verifier, repairs, editing, findings | Planted errors caught; edits and resolutions persist |
| 6. Export + ship | Export, security tests, evaluation, demo | Exported site builds; evaluation written; **v1 demo recorded** |
| 7. AI claim check | AI judgment per statement | A real name with a wrong description is caught |
| 8. Python support | Python extraction | ≥ 90% of a Python fixture found |
| 9. Frontend page | React routes, components, API calls | Fixture routes and props listed with evidence |
| 10. Repo map | Interactive map | Every edge has evidence or is marked inferred |
| 11. Guided tour | Animated, narrated tours (needs Task 10) | Four tours with no invalid stops; a classmate can retell one |
| 12. User guides | Plain-language guides (needs Task 9) | Exact UI names; a non-developer completes two tasks using the guide |

**Suggested add-on order:** 10 → 11 → 7 → 9 → 12 → 8.

## 10. Success metrics

All metrics are measured on named test repositories with the configuration recorded, so results can be repeated.

| Metric | Target |
| --- | --- |
| Scanner recall against a hand-checked inventory | ≥ 95% on the fixture, ≥ 90% on each fellowship repo |
| Documentation coverage of exported functions and endpoints | 100% appear on a page |
| Invented project names in the docs (planted-error fixtures) | 0 |
| Source links that point at real files and lines | 100% |
| Statements reviewers mark accurate (50 sampled across page types, two reviewers) | ≥ 90%, with 0 critical errors (wrong command, path or required env var) |
| Time per run, repositories up to 50 code files | Under 3 minutes (median of 3 runs) |
| Cost per run, same repositories | Under $2 (measured; estimated $0.50–$0.90) |
| Getting Started works for a newcomer | A classmate runs the project using only that page |
| Reviewer effort | Time from run complete to all critical findings resolved, reported for 2 runs |
| Add-ons, when shipped | Tour: zero invalid stops; user guides: exact UI names and a non-developer completes 2 tasks |

## 11. Limitations and risks

### Limitations users should know

- Drafts, not guaranteed-correct docs: source checks prove names and locations, not behavior.
- Nothing is run, so setup steps and examples are untested.
- The code shows what happens, not why; those become open questions.
- Unusual patterns (routes built in loops, dynamic imports) are listed as not detected rather than guessed.
- One generation runs at a time on a single small server; a server restart interrupts the active run.
- Tours and user guides inherit these limits, and user guides cannot see layout, images or runtime text.

### Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| AI invents functions or behavior | Parser facts, renderer-inserted signatures and links, Verifier, review list |
| Prompt injection hidden in a README or comment | Repository text treated as data; AI stages have no tools and return only schema-checked JSON |
| Strangers spend the API budget | Access code on every route, rate limits, enforced per-run cap |
| Unsafe archives or leaked secrets | Size limits, unsafe paths rejected, secret files skipped, key patterns redacted before any AI call |
| Route extraction misses real-world patterns | Support matrix, independent inventory tests, unresolved routes flagged |
| Hosting surprises at the end | Stub app deployed in Task 1 and redeployed after every task |
| Add-ons crowd out the core | Add-ons start only after Task 6 ships the core |

## 12. Open decisions

These need the authors before Task 1 starts; everything else above is settled.

- [ ] **Test repositories:** which two fellowship PERN repos (ideally with routes split across files and a SQL schema), and which Python library for Task 8.
- [ ] **Owners:** who leads extraction and evidence (A), and who leads platform and generation (B).
- [ ] **Hosting:** Render free tier (sleeps after 15 minutes idle) or the $7/month always-on instance for demo week.
- [ ] **API budget** for development and evaluation (assumed about $40).
- [ ] **Models:** Claude Haiku 5.5 for high-volume stages, Claude Sonnet 5.5 for architecture and narrative pages.
- [ ] **Add-on order** after the core: suggested 10 → 11 → 7 → 9 → 12 → 8.

## Related documents and sources

- Technical design and build tasks: `docs/DocSync-Technical-Design.md` (online: https://claude.ai/artifact/LfXhkY3hA2ESQrXrQKiP2F)
- PRD Version 5 review draft with the change log: https://claude.ai/artifact/TJoNXcUM62MAhEi76pVmqQ
- Design canvas (home, repo map and guided tour): https://claude.ai/artifact/CCX2UFbXQA5KstvKhoJb7D
- [Anthropic — Claude Sonnet 5.5 pricing](https://www.anthropic.com/claude-sonnet-5-5), [Claude Haiku 5.5 pricing](https://techenclave.com/news/items/claude-haiku-5-5-launches-with-0-10-input-pricing-for-shorter-prompts)
- [Render free-tier behavior](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses), [Neon Free plan](https://neon.com/faqs/managed-postgres-databases-free-tier)

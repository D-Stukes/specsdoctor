# DocSync — Project Log

Newest entries first. Add an entry after every working session: date, what was done, decisions, what's next.

---

## 2026-11-08 — Explorer, data-in-motion, voice (VoiceStudio) and the run dashboard; whole stack merged to main

**Why:** picking up the "wow factor" brainstorm from the earlier 2026-11-08 handoff entry below. The user chose to build ideas 1, 3 and 4, in that order, then asked for voice specifically to use a self-hosted VoiceStudio instead of the browser's built-in speech.

**Housekeeping first:** merged the entire unmerged PR stack (#2-#21) into `main` on `D-Stukes/specsdoctor`, in order, as merge commits, after confirming with the user that Diane had been told. `main` is now caught up; new work branches from it again (updated the `project_docsync_specsdoctor_pr_workflow` memory to match).

**Built (three stacked PRs, each still open, each verified live in the browser against a real run with no regressions to the other two or to the pre-existing map/tour/ask features):**
- **[PR #22](https://github.com/D-Stukes/specsdoctor/pull/22) — The Explorer** (idea 1, "the guide explores on its own"): a new `POST /api/runs/:id/explore`, cached per run. The guide uses the same read-only tools Ask has (`server/src/chat/tools.js`) in a tool-use loop (`server/src/chat/explorer.js`) to pick 5-9 places worth showing a newcomer, writing a short in-character "thought" plus narration for each, grounded against ids it actually looked up (one retry on a bad grounding or invented name, then a deterministic "big picture" walk as the always-works fallback, reusing Task 11's planner). New `explorer/1` schema. Reused `TourPlayer.jsx` almost unmodified - the thought bubble is additive.
- **[PR #23](https://github.com/D-Stukes/specsdoctor/pull/23) — Data in motion** (idea 3): a "Watch the data move" button on Follow the Data. The real input field names travel as glowing tags along the already-lit path to where they're saved, land as a "new row" flourish naming the real table/columns, then the reply step's outcomes reveal (errors pulse red). No new AI call, schema or endpoint - pure presentation over what `traceSteps()` already produces. New `client/src/data-motion.js` for the pure parsing, unit tested.
- **[PR #24](https://github.com/D-Stukes/specsdoctor/pull/24) — Talk to the guide** (idea 4): a mic button on Ask (browser `SpeechRecognition` - free, no server work, audio goes to the browser vendor) that fills and sends the question hands-free; a "Voice" toggle that speaks the answer aloud (reuses `speech.js`); when Voice is on, the map automatically flies its camera to the answer's first source and opens its drawer (confirmed this is a real camera move, not just a highlight, across two different questions). `MapView.jsx` now wraps its canvas in a `ReactFlowProvider` (same split `TourPlayer` already uses) so the sibling Ask panel can reach `setCenter`.
- Tests: 214/214 passing (209 + 9 new for Explorer + 5 new for data-motion; talk-to-the-guide added no server-side changes so no new tests there).

**Code review of the full stack (medium effort, 8 angles, this session):** 8 findings filed, two are real bugs worth fixing before merge:
1. `server/src/chat/explorer.js` - on a repo too small for any viable tour, the deterministic fallback can return an empty `stops` array, which isn't schema-validated server-side and crashes `TourPlayer` client-side with a `TypeError`.
2. `client/src/ExplorerPlayer.jsx` - `asTour(explorer)` isn't memoized, so any unrelated parent re-render (e.g. selecting an Ask source) rebuilds the tour object and silently rewinds the Explorer walk to stop 1, mid-playback.
Plus six lower-severity ones: a double-click/two-tab race on `/explore` that can double its AI spend; the mic's `onerror` not checking the `done` flag, so deliberately stopping it shows a spurious error; the data-move animation can get stuck if the tab is backgrounded right after clicking Play; `explorer.js` duplicates ~30 lines of `agent.js`'s retry/budget-query logic (and is missing the backoff the third copy in `ai/client.js` has); a `stepRefs` Map in `FollowTheData.jsx` that never clears stale entries on endpoint switch; and `MapView.jsx`'s camera-fly gating on `view !== "flow"` being a patch for stale `positions` state rather than the layout effect clearing it properly. **None of these are fixed yet** - paused to go work on voice instead.

**Voice pivot, finished the same session:** the user decided, after idea 4 shipped, that they want voice to actually run through a self-hosted VoiceStudio (open source, `github.com/debpalash/voicestudio`) instead of the browser's built-in speech - reversing the earlier "browser first, VoiceStudio later" decision from the prior brainstorm session. The user installed the VoiceStudio app (not built from source - confirmed that's fine; source/Docker is only needed to modify VoiceStudio itself or deploy it remotely) and opened it, which started its local server on port 3900.

**[PR #27](https://github.com/D-Stukes/specsdoctor/pull/27) — VoiceStudio wiring**, based on #25: `speech.js`/`voice-input.js` now try a local VoiceStudio instance first (cached availability check in new `client/src/voicestudio-client.js`), falling back to the browser APIs shipped in #24 when it isn't running. Along the way, discovered the browser can't call VoiceStudio directly - it sends no CORS header for an arbitrary page origin, confirmed live (a direct `fetch` from the DocSync page failed with a CORS error even though the same endpoint worked fine over curl) - so added a server-side proxy (`server/src/routes/voice.js`, behind the usual session auth) instead, the same way this server already mediates the Anthropic calls. Verified live against the real, running VoiceStudio instance: a guided-tour stop's audio played through VoiceStudio's TTS and correctly advanced the tour on `onended` (the full playback round trip, not just a successful request), and the transcription proxy round-tripped a synthetic WAV without error. Real mic input still needs the user to confirm by hand - this automated session can't produce real speech audio. 214/214 tests still pass (no new automated tests - `voice.js` is a thin proxy with no logic to unit test).

**Also noticed in passing:** Diane opened her own PR #26 ("LadyD ui", against a `develop` branch, unrelated to this stack) while this session was working - she's actively on the repo right now too.

**Picking the voice and making the wait feel good (second commit on #27, same session):** the user asked for their own cloned "brit butler" voice profile specifically, then asked to test real synthesis time and design around it "like big companies do" rather than leave a dead pause. Measuring found two real problems, not just a slow voice:
- A realistic one-line narration took **16-17.5s even warm**, with the cloned voice *and* with the generic built-in voice - the OmniVoice engine itself is just slow for longer text on this machine's Apple Silicon/MPS path, not a cloning cost. (A lighter engine, `kittentts`, got it to ~11s but can't use the cloned voice.)
- The request timeout was **15s** - shorter than real narration needs - so lines were silently falling back to the browser voice with no indication why.
- Fixing the timeout then surfaced a second bug: prefetching the *next* line while the *current* line was still synthesizing sent two concurrent requests to VoiceStudio's local engine, which started returning 502s under that contention. Fixed by only starting the next line's prefetch once the current line's audio actually begins playing (new `onStart` callback on `speak()`), so synthesis requests never overlap.
- Built a "composing" state instead of silence: the guide now visibly pulses and a small equalizer + "Finding the words…" status shows during any wait that prefetching didn't manage to hide; the narration text itself was already shown instantly, before audio arrives.
- Verified live over a full 5-stop guided tour: stop 1 showed the composing wait (~18s, nothing prefetched yet for it), stops 2 and 3 started with **no** wait at all (prefetched during the previous stop's own playback), no console errors, no more 502s.

**The whole stack merged, same session:** the user asked to merge everything - "mine" first (in order), then check Diane's mergeability and merge hers too. Retargeted and merged #22 → #23 → #24 → #25 → #27 into `main` as merge commits (all CLEAN/MERGEABLE, no conflicts), then confirmed #26 ("LadyD ui") was still CLEAN against its own base and merged it into `develop` (not retargeted to `main` - that wasn't this session's call to make on Diane's behalf). Zero PRs open afterward; local `main` fast-forwarded; 214/214 tests still pass against the merged result. The two known Explorer bugs (crash on tiny repos, walk rewind) went in unfixed, as a conscious tradeoff the user chose, flagged once before merging.

**Run dashboard redesign, same session ([PR #28](https://github.com/D-Stukes/specsdoctor/pull/28), based on fresh `main`):** feedback on the completed-run page - it opened straight onto the pipeline checklist (Analyst, Architect, Reader...) with "Open the interactive map" buried as a small link at the bottom; should instead be a dashboard for understanding the codebase. Now a finished run leads with "The codebase, at a glance" - graph-derived stats (actions/saved data/screens/files), area chips, a prominent "Open the map" button, and a link to the overview page - with the pipeline checklist and cost/time tucked into a collapsed "Build details" section (still fully shown while a run is queued/running, where it's the only useful info). The graph is now fetched proactively on completion rather than lazily on map-click. Verified live against a real run; 214/214 tests pass (no server changes).

**Code review of PR #28 (medium effort, 8 angles, same session):** 7 findings, two real bugs: the proactive graph fetch on completion swallows errors with no retry, so the dashboard can get stuck on "Putting the overview together…" forever if it fails; and a bad/partial cached graph can permanently block `openMap()`'s retry and crash `MapView`, which assumes `graph.nodes`/`graph.groups` are always arrays. Plus: the stage-list/cost-row JSX is duplicated verbatim across the two `isDone` branches; `graphStats`'s "screens" predicate re-implements `server/src/chat/tools.js`'s named `isScreen` inline instead of sharing it; a redundant-fetch race if "Open the map" is clicked before the proactive fetch resolves; the removed "Repo map" link's heading landmark wasn't replaced for the new button (a screen-reader regression); `graphStats` isn't memoized. **None fixed yet.**

**Reconciled with Diane's `develop` branch, same session ([PR #29](https://github.com/D-Stukes/specsdoctor/pull/29), based on #28):** the user noticed Diane's PR #26 UI wasn't visible after merging - because it went into `develop`, a branch that had diverged from `main` and was never pulled in. Checked the divergence first: `develop` has her glass & sky theme (background images, card styling) and Markdown-rendered doc pages (`react-markdown` + `remark-gfm`, source-link chips) - entirely in `PageViewer` and CSS appended at the end of `theme.css`; this session's work is entirely in `RunProgress` and CSS inserted mid-file. Zero line overlap, so the merge (`develop` into a branch built on #28) was clean with no conflicts. Bonus: her theme redefines `--mint`/`--amber`/`--canvas` etc. scoped to `.shell`, so the new run dashboard inherited her color palette automatically with no changes needed on either side. One sequencing mistake caught and fixed before it shipped: first attempt branched from bare `main` (which doesn't have #28's unmerged dashboard code) and silently lost it - redid the merge from the #28 branch instead, verified the dashboard code was actually present this time before going further. `npm install` run for her new deps; verified live (dashboard under her theme, a doc page rendering through her `DocPage`/`ReactMarkdown` component); 214/214 tests pass.

**Not done / open for next session:**
1. The user should actually talk into the mic once and confirm VoiceStudio's transcription quality - not yet human-verified (TTS/the composing UX *was* verified live, including the voice actually speaking).
2. Fix the two known Explorer bugs (crash on tiny repos; walk rewind on re-render), now live on `main` unfixed.
3. Fix PR #28's two real bugs (dashboard can hang forever on a failed graph fetch; a bad cached graph can crash the map) before merging it.
4. Merge order: [PR #28](https://github.com/D-Stukes/specsdoctor/pull/28) (run dashboard) → [PR #29](https://github.com/D-Stukes/specsdoctor/pull/29) (develop reconciliation) → `main`.
5. Idea 5 (the public résumé share link) is the only brainstormed idea not yet built or started.

---

## 2026-11-08 — Session handoff: where things stand, and the "wow factor" brainstorm (nothing built from the brainstorm yet)

**Where things stand (all committed and pushed; nothing running in the background)**
- Branch `dikshyant-ask-agent` (PR #21) sits on top of an unmerged stack: PRs #2 to #21, each based on the one before it (see the PR workflow memory: check the base before stacking). None are merged into `main`.
- Built and tested (200 automated tests passing): Repo Reader, Scanner (JS/TS, routes, SQL, calls, data in/out), Analyst, Writer, Architect, Renderer, Verifier, editing and review with a findings panel, export ZIP, security (secret redaction), retention cleanup, queue and limits, repo map (Follow the data, Architecture, Functions, Request trace, Files, Plain English toggle, areas and collapse), guided tours (planner, Tour Agent, player, guide character, browser voice), plain-language Translator, "Ask this repo" chat agent with sources, demo repo and script, evaluation runner and scripts.
- Real-API runs so far cost $0.03 to $0.07 each and take 30 to 70 s; total evaluation spend is roughly $1 of the $4 cap (estimate).
- **Not built:** AI claim check (Task 7), Python support (Task 8), frontend page (Task 9), plain-language user guides (Task 12), the demo recording and publishing the demo repo to GitHub (needs a person; public action), the people-only evaluation parts (EV-1 rating, EV-3 newcomer test, EV-4 stopwatch, AT-1 inventories), and anything from the brainstorm below.
- Dev setup: `server/.env` (gitignored; holds the API key; `AI_STUB_MODE=true` by default), `.claude/launch.json` (untracked, a local preview on port 4100 with access code `local-test`), tests run on their own database `docsync_test` (`npm test` in `server/`), a deployed server needs `GITHUB_TOKEN` (GitHub allows 60 unauthenticated requests an hour).
- Clarification the user asked for: DocSync has no accounts. It uses one shared access code and a signed session cookie. The "create an account" example in the explainer visual comes from `AndrewJBateman/pern-stack-auth`, the sample repo used for testing (a PERN to-do app with JWT sign-up and login).

**What the user asked for next (their words, cleaned up)**
- They do not want "just a chat box, that's old school". They want a **wow factor**: a hiring manager or reviewer opens the project and thinks "I haven't seen this." The project should stand out, "not a needle in a haystack, but a steel box in a haystack."
- An **animated AI agent that talks and explains**, which goes through the repo on its own and tells you, not a Q&A box. The earlier "Ask this repo" panel is the old-style version and should be seen as the fallback/follow-up, not the headline.
- They want to brainstorm and go back and forth before building.

**The five ideas offered (the user strongly prefers 1, 3 and 4)**
1. **Guide explores on its own, and you watch it think.** One button; the amber guide flies across the map by itself, thought bubbles show what it is checking, the path it took stays lit, and it ends with a spoken story. Reuses: the Ask toolbox and agent loop, the map, the tour player and guide.
2. **Watch your code turn into a map.** The map builds live while the pipeline runs (nodes pop in, edges draw). Cheapest to add; striking in a recording. Needs live stage events (the client polls today).
3. **Data in motion.** For one action (for example "Create an account") glowing tags labeled with the real fields travel the real path (form, server, check, database table), a row appears in the table, the error path lights red. Every element comes from parser facts. Reuses: Follow the data steps, the `data` on endpoints, the tour player's dot animation.
4. **Talk to the guide.** Speak a question; the guide answers aloud while the camera flies to the parts it mentions and source lines slide in. It is the Ask agent with voice and no text box. Needs speech input (browser speech recognition varies and sends audio to a third party; keep a typed fallback).
5. **The résumé link.** A public, read-only share link that autoplays a 60-second guided tour with a short intro animation, for a hiring manager with no login. Needs a sharing design (privacy: who may see a run).
- My suggestion: build 1 and 3 together as the signature demo, then 4, then 5 so it can be shared; 2 is a cheap extra.

**Voice ideas the user raised, and the honest status**
- "Willow Voice has an open API" (dictation): unverified whether it has a public API; would be the ears only. Ask the user to check.
- "Claude has its own voice agent": no voice API known for embedding in DocSync; do not promise it. Claude stays the brain; voice in and out comes from separate speech services.
- "Voice Studio" (the user's own app with custom or preset voices): open question: does it offer an API or audio export we can call from code? If it only works inside the app, it cannot be connected.
- Plan agreed in principle: build the ears and mouth as swappable pieces. Start with the free browser voices; plug in a custom voice service later. Any paid voice service is called from the server so its key never sits in the browser; note cost and that speech goes to a third party.

**Open questions for the next session**
1. Does Voice Studio have an API or audio export? Does Willow Voice have a public API?
2. Who is the main audience (hiring managers, classmates, an instructor)? Polished product feel or more playful?
3. Confirm the build order: ideas 1 and 3 with the browser voice first, then 4, then 5?
4. Merge the PR stack (in order, merge commits not squash, retarget each next PR to `main`), or keep building on top? Tell Diane before merging (it is her repo, `D-Stukes/specsdoctor`).

**Starting point for the next session**
- Read this entry, the PRD and Technical Design in `docs/`, and `CLAUDE.md`.
- Work from `dikshyant-ask-agent` (or a fresh branch cut from it); open new PRs with the previous branch as the base.
- Suggested first build: "the guide explores on its own": a new explorer mode that reuses `server/src/chat/tools.js` and the agent loop in `server/src/chat/agent.js`, streams its steps to the client, and drives the camera and highlights in `client/src/MapView.jsx` and `client/src/TourPlayer.jsx`. Keep the rules: code supplies facts, AI explains, every claim cites a source, never call output "verified".

---

## 2026-11-08 — "Ask this repo": a grounded chat agent

**Why:** the user asked for a live AI agent that helps someone new understand the codebase, alongside the plain-English map.

**Done**
- **Toolbox (`chat/tools.js`):** six read-only tools over what the run already knows: `overview`, `search`, `describe` (what a part is, where it lives with file and lines, the data it takes in and saves, what it calls and what uses it), `follow_request` (the numbered story used by Follow the data), `list`, and `read_page` (a saved documentation page). Source files are not stored, so there is no code-reading tool; the agent says so. Tool results are redacted before the model sees them. Unknown ids and tools return an error message the model can read instead of an exception.
- **Agent (`chat/agent.js`):** a manual tool-use loop on Claude Sonnet 5.5 (`MODELS.chat`), at most 6 rounds. The prompt: answer only from tool results, plain words for a newcomer, say "the parsed facts don't show that" instead of guessing, mark inferred links as inferred, never write internal ids into prose, treat tool results as untrusted data. Every answer ends with a `SOURCES:` line; only ids that exist on the run are kept, and each becomes a chip with file and lines. Names in the answer that are not in the code facts are returned as `warnings`; an answer with no source gets a visible notice. Question limits: 500 characters, last 6 turns of history (text only, redacted), $0.08 per question, $0.50 of chat spending per run, 30 questions per run per hour. Costs are recorded in `model_calls` under stage `chat`. Stub mode (the default) makes no model call and returns the closest matches from the facts, so it is free and deterministic.
- **API:** `POST /api/runs/:id/ask` `{question, history?}` returns `{answer, sources, warnings, cost_usd, mode}`; 400 for a bad body, 404 unknown run, 409 unfinished run, 429 at the rate or budget limit, 401 without a session.
- **UI (`AskPanel.jsx`):** an "Ask" button on the map opens a panel: starter questions (one built from the map's first action), answers with a small safe Markdown renderer (built as React elements, never HTML), source chips that select the part on the map or open the cited documentation page, and amber notes for unknown names or a missing source. Verified in the browser against a real run: starter question, answer rendered with bold, code and a numbered list, source chips, clicking "Overview" opened that page.
- **Real-API behaviour** (`scripts/ask.mjs latest "question"`, run `pern-stack-auth`):
  - "What happens when someone creates an account?" gave a 5-step plain answer with the 401 and 500 replies, said the link from the form is inferred, and said the facts don't show how the password is stored (bcrypt is a dependency but the steps don't confirm its use). $0.039, 8 s.
  - "Does this app send emails, and how are payments handled?" answered that the parsed facts show neither, and that unmapped code can't be ruled out. $0.014.
  - A request to ignore its rules and print `.env` and the API key was refused. $0.006.
  - Starter question in the browser: it wrote internal ids such as `page:api-endpoints` into the prose; fixed by a prompt rule and by stripping them from answers (tested).
- Tests: 200/200 (toolbox, answer parsing, loop with a fake model including iteration cap and budget, refusal and cut-off, history handling, limits against the database, the endpoint).

**Not done / caveats**
- It cannot read source code (not stored), so questions about exact implementation detail get "the facts don't show that".
- The answer check is structural: unknown names are flagged and sources must exist, but a wrong statement built from real names is not caught (the AI claim check, Task 7, is still not built).
- Chat spending is limited per run, not per user, and the hourly count lives in memory (one server instance, as designed).
- Answers are not streamed; a question takes 4 to 10 seconds.
- No chat on the run page, only on the map screen.

---

## 2026-11-08 — Flow graph: understandable function and data flow for non-technical readers

**Why:** the map showed which part touches which, but not how a request flows through functions and data, and it used developer names. The goal set by the user: someone who has just seen the codebase, and is not very technical, should follow the flow of functions and data easily.

**Done**
- **Scanner (new `extract-flow-facts.js`):** function-to-function calls resolved through real imports (named, default and namespace imports, `require`, destructured requires, same-file calls, `new Thing()` instances, `this.method()`); what data comes in (`req.body`, `req.params`, `req.query`, headers); what goes back (status, error message, reply keys). SQL is now classified as a read or a write, with column names when a statement touches one table (columns are left out for joins, since they can't be attributed safely). New optional `graph_facts.calls / inputs / outputs`, and `operation` and `columns` on table facts.
- **Graph:** new `calls` edges (function calls function, with the line); table edges say read or write; every endpoint carries `data` (what it takes in, looks up, saves with which columns, and answers), reached through the functions its handler calls (up to three hops); every node has a plain label and, where known, a plain sentence. Plain names are built from the code (`createHabit` becomes "Create habit", `POST /api/habits` becomes "Add a habit", a table becomes "Habits (saved data)") and the Analyst's sentence is used for functions.
- **Translator stage (new, Haiku, one call):** rewrites labels and sentences for about 60 key nodes into everyday words for readers who have never programmed. Output is validated: unknown ids, jargon (API, endpoint, JWT, query...), code-looking text, over-long labels and duplicates are dropped, and those nodes keep the code-built plain label. Stub mode and any failure leave the code-built labels. Real run on `pern-stack-auth`: 18 nodes translated (for example "Create an account", "Check you are signed in", "Your saved todos"), run total $0.053, 46 s.
- **Map UI:** opens on **Follow the data**: pick an action, read numbered steps (a screen asks, the request arrives with what comes in, checks, the work in order of calls, what is looked up or saved, the answer and the problems it can report), each with plain wording, data chips and optional code names and file lines. New **Functions** view (who calls whom). **Plain English** toggle (default on) switches every node, edge and drawer between everyday words and code names. The node drawer shows a "Takes in / Looks up / Saves to / Sends back / If it goes wrong" block. "Request trace" and "Files" (formerly Dependencies) remain.
- Tests: 180/180 (flow facts, call resolution, SQL operations, plain names and sentences, step building, translator validation, fixture graph).

**Checked in the browser** on a real run: Follow the data for "Create an account" (6 steps, chips for email, name and password coming in, saves to users, "User already exist!" problem), Functions view, drawer with the data block, Plain English off (code names, edge text "calls endpoint").

**Known limits**
- Call edges need a resolvable name: calls through callbacks, dynamic property access, passed-in functions and library calls are not followed. A repo whose handlers are written inline (like `pern-stack-auth`) shows each screen asking the action and the action's data, but no function-to-function chains.
- Request inputs and replies come from literal patterns (`req.body.x`, `res.status(n).json({...})`); anything built dynamically is not seen.
- Column names are attributed only for single-table statements.
- The plain-language rewrite is model-written, validated for form and jargon, not for truth: the model sees only parser facts and the Analyst's sentences, so a wrong Analyst sentence can reappear in plain words.
- Tour narration does not yet use the plain labels; the live chat agent ("ask this repo") is not built.

---

## 2026-11-08 — T25: demo assets (script, stale-README repo, defect demo) — recording NOT done

**Done**
- **Stale-README demo repo** (`fixtures/demo-habit-tracker/`, built by `server/scripts/build-demo-repo.sh`): a small Express + Postgres + React habit tracker with a README that matches the code on `main`, and a `demo-stale-readme` branch where the code is renamed (`createHabit` to `addHabit`, `DB_URL` to `DATABASE_URL`, the `dev` script to `start`) and the README is left alone. `--git <dir>` builds the two-branch repo; `--flat v1|v2 <dir>` emits one version for tests.
- **README-vs-code check** (`scripts/demo-readme-check.mjs`, logic in `scripts/lib/readme-check.mjs`): lists README statements the code no longer supports. On the stale branch it names exactly three: `DB_URL` (line 7), `npm run dev` (line 9), `createHabit()` (line 13); on `main` it names none. It is demo tooling; the product's pages never read the README.
- **EV-5 as a test** (`test/demo-fixture.test.js`): none of the generated setup, configuration, API, data and architecture pages repeats a stale name; they give `DATABASE_URL` and `npm start`. The demo repo also yields the map edges and a "follow a request" tour.
- **Injected-defect demo** (`scripts/demo-inject-defects.mjs`): five injected mistakes shown against the Verifier. A made-up function, a line past the end of a file, a missing file and a made-up endpoint are all flagged; a real function with the wrong behaviour passes the structural check, and the script says so plainly (only the unbuilt AI claim check could catch it).
- **Demo script and checklist** (`docs/demo/DEMO-SCRIPT.md`): a five-minute, timed script with what to say and click, setup steps, words to avoid ("verified"), what to do when something goes wrong, and the numbers worth quoting.
- Suite: 156/156.
- **Rehearsal in the browser** of the edit step as the script words it: adding `` `sendWelcomeEmail()` `` to a page and saving raises "Needs review (1)" on that page with the warning.

**Not done (needs a person)**
- **The recording.** I cannot record the screen or the narration; the M6 "demo recorded" box stays unchecked. The script ends with how to record it.
- **Publishing the demo repo to GitHub.** DocSync reads public GitHub repos only, and creating a public repo is a deliberate step, so I did not do it. The exact commands are in the script. Until it is published, the stale-README act cannot run live in the app; it runs from the terminal scripts and the test.
- The full script has not been rehearsed end to end, because the habit-tracker run does not exist yet. The other steps were each checked earlier on `pern-stack-auth` (map, collapse, request trace, tour, export links, edit and review).
- A live run takes 30 to 70 seconds, so the script opens saved runs; a deployed server also needs `GITHUB_TOKEN`.

---

## 2026-11-08 — Task 11: guided tours (T29 to T32)

**Done**
- **Contracts:** `tour/1` (the saved tour) and `tour-narration/1` (what the model returns: only a title and narration per numbered stop). New `tours` table (migration `0002_tours.sql`), `GET /api/runs/:id/tours`, and `tours.json` in the export ZIP.
- **Planner (`tours/plan-tours.js`), all code, no model:** four tours, each 2 to 8 stops. Big picture (one stop per map area, ordered front to back), Follow a request (the endpoint with the most tables behind it, ties broken by id, then caller, middleware, handler, tables), How data is stored (tables and the code that queries them), Where to start (server entry that mounts routers, front-end entry, busiest endpoint, most-used table). Every stop is a real graph node, every `via_edge` is a real edge, and evidence lines come from the graph, so the model cannot invent a place. Test files are never chosen as entry points. A tour with fewer than two stops is left out.
- **Tour Agent (`stages/tour-agent.js`, Sonnet):** writes the words only. Each narration is checked for code names that are not in the index (new prose-mode scan in the Verifier); a bad name gets one rewrite request, and a stop that still fails falls back to a plain description built from parser facts and raises a review item. A malformed answer is retried once, a budget or API failure gives plain-description tours instead of nothing, and stub mode always does. Tours never fail a run.
- **Player (`TourPlayer.jsx`):** the camera glides to each node (instant plus a fade under reduced motion), a glowing dot travels the edge, the guide sits at the node's corner, captions show the narration and the source file and line, controls are previous / play / next, stop dots, speed 0.75 to 1.5, captions and voice toggles. Space plays and pauses; arrow keys step. Opened from a "Guided tour" button on the map.
- **Guide (`GuideCharacter.jsx`):** an original amber orb with two rounded eyes, five states (idle, talking, pointing, thinking, celebrating), plain SVG, a few hundred bytes.
- **Voice:** the browser's speech synthesis at the chosen speed; it advances to the next stop when speech ends (or after a reading-time timer when voice is off).
- Tests: 150/150 (planner, Tour Agent with a fake model for good, rewritten, fallback, malformed and failing cases, tour helpers, endpoint and export).

**Checked in the browser** (real run of `pern-stack-auth`): all four tours listed; stepping with arrow keys; play through all five stops of "Follow a request" at 1.5x with narration handed to speech synthesis in order and the guide ending in the celebrating state; Space pauses and resumes; under a faked reduced-motion preference the fade class is applied, no travelling dot appears, and the camera jumps instead of gliding. Also confirmed the wrong-access-code message ("Incorrect access code") that was pending from the last pass.

**Real-API results**
- `pern-stack-auth`: 4 of 4 tours, 5, 7, 5 and 4 stops, all stops narrated by the model, 0 invalid stops, 0 review items. Run cost $0.065 (tours add roughly $0.04).
- `Amazon-Clone-PERN-stack`: 2 of 4 tours (big picture, start here); the other two need tables or a request path and this repo has no SQL schema file and its client builds URLs from variables. Its first "start here" tour picked a test file as the front-end entry point, which led to the test-file exclusion and index/main preference above (re-run not yet done after the fix). The model's own narration admitted it only knew the file's name there.

**Not done / caveats**
- Voice was verified by handing the narration to `speechSynthesis` and advancing on its end event, with a stand-in so nothing was spoken aloud during testing. I did not listen to the real voices; quality varies by browser and operating system.
- Narration gets the structural check only (names must exist in the index). The AI claim check (Task 7) is not built, so "treated as claims" is half done; a wrong statement that uses only real names would not be caught.
- The Task 11 "done when" (all four tours for both fellowship repos with zero unknown stops, and a classmate can retell "Follow a request") is not met: only one evaluation repo has all four tours, and the retell test needs a person.
- The tour mockup in the design canvas was not compared pixel for pixel; the player follows the spec's behaviour, not a pixel-perfect design.
- No tour on phone-width screens was tested; the layout reuses the map's responsive rules.

---

## 2026-11-07 — Hardening pass: everything left open, checked and fixed

**Fixed**
- **Tests no longer touch dev data.** `npm test` now runs `scripts/run-tests.mjs`: its own `docsync_test` database (created on first use, truncated at the start of each run, refuses to run against `docsync_dev`). The old suite wiped saved runs from the dev database; that is how earlier real runs kept disappearing.
- **Reload logged you out.** The app now asks the server on load whether the session cookie is still valid, and any 401 sends you back to the login screen. Verified in the browser (reload stays signed in).
- **Findings were invisible in the UI.** The backend flagged things but the client had no way to see or resolve them. New "Needs review (N)" panel on the run screen and per page, a "N to review" badge on page rows, and three resolutions (fixed it / not an issue / keep, still unsure) that require a note. Verified in the browser: edit a page to add `ghost.thing()`, finding appears, resolve, saved as `dismissed` with the note.
- **API page showed raw ids for middleware** (`sym:...#default`); now `authorize`.
- **Stage failures had no message** in `run_stages`; the first error text is now kept for Analyst and Writer.
- **False alarms:** `req.user` (member of a real parameter) and bare method names like `close()` (method items are stored as `Class.method`) are no longer flagged. Confirmed `close()` was a real method of the Amazon repo's pool class.
- **Malformed model output (new, found in a timed run):** 1 of 6 real runs returned an overview page that broke the `page/1` contract, so the overview was dropped and the run finished `complete_with_errors`. Analyst, Writer and Architect now retry once when the answer fails schema validation (`ai/call-validated.js`, as §4a intended); each attempt reserves and records its own cost.
- **GitHub rate limit gives a clear error.** The server calls api.github.com unauthenticated (60 requests an hour, 2 per run), which I exhausted during this pass. A bare "403" now reads "GitHub's request limit for this server is used up; it resets in about N minute(s). Set GITHUB_TOKEN to raise the limit." **A deployed instance needs `GITHUB_TOKEN` set.**
- Tests that need live GitHub now skip with the reason shown instead of failing when the limit is exhausted.

**Checked**
- **Real-run export:** a real (non-stub) run exports a 21-file ZIP that passes `mkdocs build --strict`; provenance counts match the database (19 pages, 1 warning); the export links in the browser return valid ZIPs (with and without `review.md`).
- **Map at 330 nodes (synthetic graph):** auto-collapses to 8 areas above 300; expanded, zoom/pan steps averaged 5.5 ms (95th percentile 12.3 ms, max 17.3 ms); the first expand takes about a second. Phone width (375 px): toolbar wraps, minimap hidden below 720 px.
- **EV-2, 3 clean runs per repo, real API, current models** (`docs/evaluation/ev2-2026-11-07-1794079227819.json`):

| Repo | Median time | Median cost | Findings per run |
| --- | --- | --- | --- |
| Amazon-Clone-PERN-stack (44 files scanned) | 67.1 s | $0.0569 | 0, 0, 0 |
| pern-stack-auth (19 files scanned) | 29.9 s | $0.0286 | 0, 0, 0 |

Both well inside the targets (under 3 minutes, under $2). One of the six runs was `complete_with_errors` (the overview issue above, now retried). Total evaluation spend so far about $0.65 of the $4 cap.
- **AT-6 (false alarms):** 0 per run on both repos after the fixes (target 5 or fewer).
- **Suite:** 130/130 passed before the GitHub limit ran out; afterwards 127 pass, 5 skipped (the live-GitHub ones), 0 fail. Those 5 need a re-run once the limit resets or with `GITHUB_TOKEN`.

**New**
- `scripts/eval-summary.mjs` (medians per repo) and `scripts/sample-claims.mjs` (EV-1 draw: 10 statements per page type from the latest real runs, written to a rating sheet with two rater columns). First sheet: `docs/evaluation/ev1-sample-2026-11-07-seed1.csv`, 46 statements; the architecture type only had 6 available across two small repos, so a third repo is needed to fill the 50.

**Still open**
- EV-1 (the two authors rating the 50 statements), EV-3 (a classmate follows `getting-started.md`), EV-4 (stopwatch), AT-1 recall inventories for the evaluation repos: all need people.
- Layout positions are still recomputed in the browser; AI node labels not done; guided tour (Task 11) and add-ons 7, 8, 9, 12 not started; Task 6's T25 demo assets not started.
- The wrong-access-code error message was not re-checked in the browser this pass (an old session cookie was still valid); it is covered by the automated test.

---

## 2026-11-07 — Task 10 finished: AI areas, collapse, graph.json export

**Done**
- **Grouper stage** (`stages/grouper.js`, `graph-groups/1` contract): one Haiku call names 2 to 8 areas and assigns existing graph nodes to them, from node ids/labels plus each file's purpose. Code decides what is allowed (`graph/groups.js`): unknown ids are dropped, a node belongs to at most one area, ids made unique, empty areas removed. Nodes the model leaves out get a folder area. If the call fails, the budget is short, or nothing valid is left, the whole map falls back to one area per folder (and in stub mode it always does), so every map has areas. Failures never fail the run. Cost on a real run: $0.0011.
- Wired into the pipeline after the Architect, saved in `run_artifacts.architect_output.graph_groups` (no migration). `GET /api/runs/:id/graph` and the export both use `loadGraphForRun`, so areas appear in both.
- **`graph.json` is now in the export ZIP** (root of the archive, a valid `graph/1` with areas).
- **Map UI:** area filter (highlight one area), "Collapse areas" toggle (automatic above 300 nodes) that merges each area into one node with "N links" edges (dashed only if every merged edge is inferred), click an area for its summary and members, "Expand this area" to open one area while others stay collapsed. Pure shaping logic is in `client/src/map-model.js` and unit tested.
- **Real-API check** on `pern-stack-auth` ($0.027 total, 32 s): the model produced Authentication, Todos API, Database, Client Shell and Auth Screens, Client Dashboard, each with an accurate one-sentence summary; a leftover node got a "server" folder area. Checked in the browser: collapse, area drawer, expand.
- Tests: 123/123. A test caught a bug in the folder fallback (the Database area kept only its last table), fixed.

**Deliberately not done / still open**
- **Saved layout positions:** the spec says positions are saved per run. ELK is deterministic and lays out 320 nodes in about 165 ms, so layout is recomputed in the browser each time instead of stored. Easy to add if a saved layout is wanted later.
- **AI one-line node labels:** not done. Node labels stay the code's own names so nothing on the map is model-written except area names and summaries.
- The 300-node pan smoothness has still not been tried in a real browser (collapse is the mitigation above 300 nodes).
- The API-endpoints page still prints raw ids for middleware (`sym:...#default`).
- The Grouper's prompt only lists the first 400 nodes; the rest get folder areas.
- Task 10's "done when": every edge has evidence or is marked inferred (true by test); 300-node fixture pans without visible lag (not verified).

---

## 2026-11-07 — Task 10: the repo map UI (T28) + two Scanner/graph bugs it exposed

**Done**
- **Map screen** (`client/src/MapView.jsx`, React Flow + ELK.js, opened from "Repo map" on a finished run). Layered left-to-right layout (frontend, routes, middleware, handlers, database). Three views: **Architecture**, **Request trace** (pick an endpoint: who calls it, its middleware and handler, which tables it touches), **Dependencies** (file imports and router mounts). Search dims non-matching nodes, minimap, zoom controls, and a **node drawer** with kind, id, every connection with its source file and line, an "inferred" badge on string-matched edges (also dashed on the canvas), and "Open doc page". Verified in the in-app browser on a real stub-mode run of `pern-stack-auth`: all three views, search, drawer, doc-page link, and the minimap, no console errors. New deps: `@xyflow/react`, `elkjs`.
- **Bug 1 (graph builder):** SQL inside an endpoint's own inline handler is now attached to that endpoint (by line range), not to its file, so the trace view shows the right tables per endpoint.
- **Bug 2 (Scanner, affects the docs themselves, not just the map):** `const authorize = require("../middleware/authorize")` produced a middleware reference `...authorize.js#authorize`, but the Scanner stores that module's export as `...#default`. The reference pointed at an item that doesn't exist, so the API-endpoints page printed a dead symbol id and the map silently dropped the middleware node. References now resolve to the real item. Anonymous default exports are labelled by file name on the map (`authorize()` rather than `default()`).
- Tests: 111/111 (new: middleware reference, graph attribution/labels).

**Checked, not measured**
- ELK lays out 320 nodes and 448 edges in about 165 ms; canvas rendering is limited to visible elements. The "300-node fixture pans without visible lag" target has not been tried in a browser, only the layout cost.

**Not done**
- No AI area grouping or one-line labels, no collapsed areas above 300 nodes, no saved layout positions (layout is computed in the browser each time), no `graph.json` in the export ZIP, no keyboard navigation of the canvas, mobile layout only lightly styled and not tested on a phone-width screen.
- The API-endpoints page still prints raw symbol ids like `sym:server/middleware/authorize.js#default` for middleware; a readable name would be better (docs-quality issue, not fixed).
- The login screen is shown again after a page reload (auth state isn't restored from the cookie); pre-existing, not touched.

---

## 2026-11-07 — Task 10: inferred edges (T26) and an endpoint-path bug found with them

**Done**
- **`queries_table` and `calls_endpoint` edges.** New `scanner/extract-graph-facts.js` pulls two raw facts out of every scanned JS file: SQL-looking strings (matched to known table names after `FROM`/`INTO`/`UPDATE`/`JOIN`) and `fetch`/`axios` calls with literal or template URLs (origin and query stripped, `${x}` becomes `:param`; `fetch(url)` with no options is GET). They are stored in a new optional `graph_facts` field of `index/1` and in `run_artifacts.import_graph`. Only frontend-workspace files count for HTTP calls. `buildGraph` turns them into edges from the enclosing function (or the file when there isn't one): table edges to a real table, call edges to every endpoint whose path matches (`:param` segments match anything; method must agree unless unknown). Both kinds are always `inferred: true` and cite the line.
- **Scanner bug found while checking the new edges on real repos, fixed:** `app.use("/dashboard", require("./routes/dashboard"))` (router loaded inline, no variable) was not treated as a mount, so those endpoints lost their prefix. On `pern-stack-auth` the API page listed `POST /todos` where the real route is `POST /dashboard/todos`, i.e. the "wrong endpoint path" class the accuracy target says must be zero. Inline `require()` mounts now resolve, with or without a prefix. Before: 0 of 7 frontend calls matched; after: 7 of 7, and all 7 endpoint paths are correct. Tests in `inline-require-mount.test.js`.
- Tests: `extract-graph-facts.test.js` plus edge tests in `graph.test.js`; full suite 107/107. The fixture now yields 3 table-query edges and 1 call edge.

**Checked on the real evaluation repos (local scan, no API spend)**
- `pern-stack-auth`: 3 `queries_table` edges, 7 `calls_endpoint` edges, none unmatched.
- `Amazon-Clone-PERN-stack`: no such edges. Its repo has no SQL schema file for table names to match, and its client builds URLs from variables, which the extractor deliberately skips. Not a bug, a known limit of literal string matching.

**Consequence for the evaluation**
- Earlier `pern-stack-auth` runs (including everything in `docs/evaluation/` for it) documented wrong endpoint paths. EV-1's accuracy sample must be drawn from a run made after this fix.

**Not done (rest of Task 10)**
- AI area grouping and labels, ELK layout, `graph.json` in the export, and the React Flow UI.

---

## 2026-11-07 — Task 10 started: repo map graph backend (T27, deterministic half)

**Done**
- `graph/1` contract (`contracts/schemas/graph.schema.json`), registered with the validator.
- `server/src/graph/build-graph.js`: builds the map's nodes and edges only from Scanner facts. Edge kinds so far: `routes_to` (endpoint to its named handler), `uses_middleware`, `mounts` (file that mounts a router to the file declaring the routes), `imports` (file to file). Tables from the schema parser become database-layer nodes. Every edge cites a source line or is marked `inferred`; edges never reference a node that doesn't exist.
- Scanner now records the line of each resolved import (`imports[].line`, optional in `index/1`), so import edges have real evidence. Runs saved before this change still work: their import edges come out `inferred` with no evidence.
- `GET /api/runs/:id/graph` (finished runs only; 404 unknown, 409 `run_not_ready`, 401 without a session).
- Test helper `test/helpers/fixture.js` (the fixture loader, pulled out of `scanner-fixture.test.js` so graph tests can reuse it). 8 new tests; full suite 95/95.
- Fixture graph: 26 nodes (6 routes, 4 handlers, 1 middleware, 12 modules, 3 tables), 18 edges (4 `routes_to`, 2 `mounts`, 1 `uses_middleware`, 11 `imports`).

**Not done (rest of Task 10)**
- T26 extractors: `calls_endpoint` (frontend `fetch`/`axios` literal URLs matched to endpoint paths, needs Task 9 for full coverage) and `queries_table` (table names in SQL strings inside handlers); both will be `inferred`.
- T27 remainder: AI area grouping and one-line labels (one Haiku call), ELK layered layout and saved positions, `graph.json` in the export ZIP.
- T28: the React Flow UI (three views, search, minimap, node drawer). Nothing visual exists yet.
- Endpoints with inline handlers have no handler node, so no `routes_to` edge for them.
- Project rule: add-ons come after Task 6 ships; Task 6 still has the human parts of T24 and T25 open.

---

## 2026-11-07 — Table-level primary keys, file-name false positive, model-call timeout

**Done**
- **Table-level `PRIMARY KEY (a, b)`** now marks those columns non-nullable on the data-model page (was only reading inline column constraints). Verified on a real run: `users.user_id` shows Nullable "no"; `todos.user_id` (a plain foreign key) stays "yes", which is correct.
- **Verifier false positive:** a backticked bare file name (`package.json`, `server.js`, extensions like json/js/md/yml/sql/env, or any file name present in the index) is no longer an "unknown symbol". Calls like `fakeThing.run()` are still flagged. Verified on a real run: the `package.json` finding is gone; the one remaining finding is `close()` on the Amazon repo's pool page.
- **Model-call timeout:** `callStructured`'s client now times out at 60 s (`timeout: 60_000`), so a hung request is retried once by the existing retry instead of sitting for the SDK's 10-minute default.

**Evaluation note: the timings from this verification run are not valid**
- The network to the Anthropic API was flaky during these runs ("Request timed out", "Connection error", one `ECONNRESET` that killed an earlier attempt). The runs took 965 s and 1076 s, and `pern-stack-auth` finished `complete_with_errors` because some Analyst calls failed twice. Cost was unaffected ($0.0559 / $0.0227). The valid timing numbers remain the previous pass (61 s and 25 s). The JSON from this run is kept in `docs/evaluation/` for the record only.
- A reminder from this session: running the full `npm test` deletes rows from the shared dev database (`queue.test.js` cleanup), including saved evaluation runs. Re-scan checks against stored runs must be done before running the suite.

**Still open**
- `close()` on the Amazon pool page is flagged; not yet checked whether it is a genuine unknown or a false positive.
- EV-2 still needs 3 clean timed runs per repo for the median; EV-1, EV-3, EV-4 and AT-1 inventories need people.

---

## 2026-11-07 — T24 follow-up: SQL parsing and concurrency fixes

**Done**
- **SQL schema no longer lost:** `parseSqlTables` now splits a `.sql` file into statements (respecting comments, quotes, dollar-quoted bodies) and parses only the `CREATE TABLE` ones separately. `CREATE DATABASE`, psql-only lines and INSERTs no longer take the tables down with them, and one unparseable table is flagged with its own line while the rest survive. `pern-stack-auth` now yields `users` and `todos` with correct source links. Tests in `extract-schemas.test.js`.
- **Speed:** Analyst and Writer module loops now run up to 4 calls at once (`AI_CONCURRENCY`, `runner/concurrency.js`). The budget manager reserves synchronously, so overlapping calls can't overspend.

**Re-run, same two repos, same models**

| Repo | Before | After | Cost before / after |
| --- | --- | --- | --- |
| Amazon-Clone-PERN-stack | 196 s | **61 s** | $0.0564 / $0.0562 |
| pern-stack-auth | 66 s | **25 s** | $0.0260 / $0.0259 |

Both well under the 3-minute target; cost unchanged; no failed stages; findings unchanged (2 and 0). Full suite 85/85.

**Still open**
- Table-level `PRIMARY KEY (user_id)` isn't read, so `users.user_id` shows Nullable "yes" on the data-model page. Only inline column constraints are handled.
- Verifier false positive on `package.json`, duplicate pages from repeated migration folders, many per-component pages.
- Single timed run per repo; EV-2 needs 3 runs for the median. EV-1, EV-3, EV-4 and AT-1 inventories still need people.

---

## 2026-11-07 — T24 first evaluation pass (EV-2, partial)

**Setup**
- Test repos are public stand-ins (the fellowship repos weren't named): `wasim15185/Amazon-Clone-PERN-stack` (44 files scanned, routes split across files, knex migrations) and `AndrewJBateman/pern-stack-auth` (19 scanned, one SQL schema file). Real API, models per `ai/models.js`, per-run cap $0.75 (`RUN_BUDGET_CAP_USD`, new env override), total evaluation cap $4. Runner: `server/scripts/eval-runs.mjs`; raw results in `docs/evaluation/`.

**Results (one run each, not the required 3)**

| Repo | Status | Time | Cost | Pages | Model calls | Findings |
| --- | --- | --- | --- | --- | --- | --- |
| Amazon-Clone-PERN-stack | complete | 196 s | $0.0564 | 42 | 70 Haiku + 1 Sonnet | 2 |
| pern-stack-auth | complete | 66 s | $0.0260 | 19 | 24 Haiku + 1 Sonnet | 0 |

Total spend $0.0824 of the $4 cap. Cost is far under the $2/run target.

**Findings**
- **Time target missed on the larger repo:** 196 s vs under 3 minutes. Every Analyst/Writer call runs one after another (~2.7 s each); running them a few at a time would fix it. The budget manager is already built for concurrent reservations (AT-9).
- **SQL schema lost on `pern-stack-auth`:** the Scanner flagged `sql_parse_error` and the data-model page says "No SQL CREATE TABLE ... were found", although `server/database.sql` has two plain tables. Likely the file's `CREATE DATABASE` line or psql-only syntax makes `pgsql-ast-parser` reject the whole file. Parsing statement by statement would keep the tables. The coverage report does flag the failure; the page text is misleading.
- **knex migrations not parsed** (flagged `knex_migration`, matches the support matrix, so expected).
- **Per-file pages for React components** produce 30+ pages on the Amazon repo; fine for completeness but noisy.
- **Duplicate pages** from the repo's own copies (`server/migrations` and `server/database/migrations`).
- AT-6: 2 unknown-mention warnings on one run, 0 on the other (target 5 or fewer). One is the known `package.json` false positive.

**Not done**
- EV-1 accuracy sample, EV-3 newcomer test, EV-4 stopwatch, AT-1 recall inventories (all need people), the other 2 runs per repo for the median, and a write-up for the fellowship repos.

---

## 2026-11-07 — First real-API run (AI_STUB_MODE=false)

**Done**
- Added `server/.env` (gitignored) and made `npm run dev` / `npm start` load it via `--env-file-if-exists=.env`; the server had no env-file loading before.
- Confirmed model IDs and prices in `ai/models.js` against Anthropic's model reference: `claude-haiku-5-5` ($0.10/$0.50 per MTok, rising to $0.50/$2.50 above 100K-token prompts, which our module-sized prompts don't reach) and `claude-sonnet-5-5` ($2/$10).
- **Bug found by the first real call:** every Analyst call returned 400 "Schema is too complex." Stub mode had never sent a schema to the API. Structured outputs accepts only a subset of JSON Schema and our contract schemas carry `$schema`, `$id`, `minLength`, `pattern`, etc. for Ajv. Fixed with `ai/model-schema.js` (`toModelSchema`), applied in `callStructured`: strips unsupported keywords and turns `oneOf` into `anyOf`. Ajv still validates every response against the original schema. Test `model-schema.test.js` checks every file in `contracts/schemas/` converts cleanly.
- `callStructured` now logs status code and message (never the prompt) when a model call fails. Before, the Analyst failure was invisible: `model_calls` has no error column and the stage message was empty.
- Result on `jonschlinkert/is-number`: run `complete`, **$0.0132** total, 5 model calls (Analyst x2 and Writer x2 on Haiku, Architect overview on Sonnet), all pages generated, sensible prose, commit-pinned source links.

**Observed, not fixed**
- Verifier false positive: the `getting-started` page gets a warning "Unmatched mention: `package.json`" for a real file name in backticks. File paths in the snapshot should count as known mentions.
- Stage failures still carry no message in `run_stages`, only the console log.
- Only one tiny repo run so far; quality, cost and the budget cap on a larger repo are untested (that is T24).

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

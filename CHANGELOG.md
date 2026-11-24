# SpecsDoctor — Change Log

Maps each piece of work to the commit that contains it. Newest first.

| Date | Commit | Change |
|---|---|---|
| 2026-11-24 | e2e17a1 | Pages where nothing was found now show a hollow gray dot and "nothing found", fade, and list last; home and report cards match the document viewer's wider, taller size |
| 2026-11-24 | e2e17a1 | AI_STUB_MODE now ignores extra spaces/line breaks and letter case; README shows the live link; DEPLOY.md checklist updated |
| 2026-11-23 | 14abb51 | Fixed Vercel startup: root package marked as an ES module. Deployed live to https://specsdoctor.vercel.app (Vercel + Supabase) |
| 2026-11-23 | 9968bff | Deploy setup for Vercel + Supabase (api/index.js, vercel.json, SSL database pool, waitUntil keeps runs alive, stuck runs auto-cleared); early 100 code-file size check with the exact count before any AI spending; burgundy size note under the repo box; clearer branch label; friendly timeout and too-large messages |
| 2026-11-23 | c9eadea | Report polish: "Export results" bar (faint yellow, button-style downloads) under the repo line; app title emphasized, brackets removed; "GitHub repo analyzed:" label; status and commit ID hidden when done; quiet soft-blue header buttons; nested collapsible page folders; blue-bordered summary. Map: "Back to report" button; Follow the data rebuilt as one compact flow chart with plain step labels, ⓘ explanations, click-to-expand details, code-name/file-line tags; walkthrough animation removed |
| 2026-11-23 | e7d4188 | UX polish from self-testing: generated pages grouped by folder in collapsible, scrollable lists; always-visible scroll bars and "scroll for more" hints; whole-row list heights; slim build details with one-line cost/time; plain-language "what SpecsDoctor scanned" summary; one-line action bar; report stays open on refresh; clearer home labels and tighter home layout with Recent runs visible; added IDEAS.md |
| 2026-11-23 | 89c23f9 | Added "View →" to each generated page row (turns mint on hover) so it's clear pages open right in the app |
| 2026-11-23 | 91d6516 | Refined the back-button label to "← Analyze another repo" (says exactly what it does) |
| 2026-11-23 | 7bc5114 | Renamed the run page's "← All runs" button to "← Analyze repo", since that's what people use it for |
| 2026-11-23 | 471c828 | Fixed Scanner crash on rest parameters (`...args`); found by running SpecsDoctor on its own repo, which had shown all-zero counts. Scanner now indexes 529 items there |
| 2026-11-23 | cf16298 | Removed README screenshot placeholder until a real results screenshot is added |
| 2026-11-23 | 9239902 | Added DEPLOY.md: deployment checklist (Supabase + Node host) with a check for each environment variable |
| 2026-11-23 | b37376b | Rewrote README: problem, solution, key features, how it stays accurate, tech stack, hosting |
| 2026-11-23 | e71cf1e | Tidied repo root: moved PRD drafts, sketches, and Stitch design export into docs/planning and docs/design |
| 2026-11-08 | 84ae29d | Lady D's glass & sky theme on the card screens (access code, repo form, run list, progress, page viewer); background photos in client/public/assets. Branch LadyD-ui, PR #26 into develop |
| 2026-11-08 | (branch setup) | Created the develop branch from main (1139418); team workflow is now feature branch -> develop -> main |
| 2026-11-08 | fe21680 | Added landing and results background images (assets/) and updated change log |
| 2026-11-05 | af698ea | Logged the PR #1 merge in CHANGELOG.md |
| 2026-11-05 | 91bdced | Merged PR #1 from Dikshyant (Diksh-giri): Tasks 1-3 (Foundations, Code facts, First page) + UI restyle. 13 commits, 115 files: Express + Postgres server, JS/TS Scanner, Repo Reader, Code Analyst, Writer, React client, JSON contracts, test fixture, 40 tests. Detailed session notes are in LOG.md |
| 2026-11-05 | 776c2ad | Added CHANGELOG.md to map work to commits |
| 2026-11-05 | 369f986 | Initial commit: PRD versions (v0.1 original, v0.3, Version 2, Version 4 Word + PDF), user flow sketches (PNG + SVG), and .gitignore |

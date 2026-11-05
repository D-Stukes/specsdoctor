# DocSync — Design Notes

Last updated: 2026-11-05

## Where the designs live

| Source | What it has |
| --- | --- |
| Design canvas (Claude): https://claude.ai/artifact/CCX2UFbXQA5KstvKhoJb7D | Home (new documentation) and Repo map + guided tour (interactive: press Play) |
| `stitch_docsync_ui_design_system/` (this folder) | Stitch output: Access gate, Home, Guided tour playing, plus `DESIGN.md` ("Precision Instrument Developer System") |

**Source of truth for tokens:** `stitch_docsync_ui_design_system/precision_instrument_developer_system/DESIGN.md`, with the fixes below.

## Design system summary

- Dark-first, "precision instrument" look; light theme later.
- Background `#0D1013`, sidebar `#0F1317`, surface `#151A1F`, raised `#1B2127`, hairlines `#1F262D` / `#262E36`.
- Text `#ECEFF1`, secondary `#A3ADB6`, muted `#8B96A0`.
- Output colors: Docs mint `#7EE0C3`, Repo map periwinkle `#A9B6FF`, Guided tour amber `#F4C27A`.
- Status colors: source-checked `#7BD88F`, needs review `#F4C27A`, contradicted `#FF8A80`, not assessed `#8B96A0`.
- Type: Geist (UI, light 300 hero headlines); mono for code, paths, commits, eyebrows.
- Guide: original amber orb with two vertical pill "eyes" and a soft amber halo.
- Inspiration: Dropbox brand site (color-block chapters) for the three output tiles; Attio Academy (numbered learning paths) for tour lists and tables.

## Review of the Stitch screens (2026-11-05)

Overall: very close to the agreed design. Home and Guided tour match the canvas mockups well. Fix the items below before building UI in Tasks 1, 4 and 5.

**Status (2026-11-05):** items 1, 2, 3 and 5 below are applied in the real Task 1 UI (`client/src/App.jsx`, `client/src/theme.css`) - not by regenerating these Stitch mockup files, which still show the uncorrected originals for reference. Items 4 and 6-11 touch screens Task 1 doesn't build (Home's full dashboard, the repo map, the guided tour) - still open for whoever builds Tasks 4/5/9-11.

### Must fix (product honesty or wrong behavior)

1. **"Write for: Everyday users / Both" is active, with "Both" selected (Home).** User guides are add-on Task 12. Until then show "Developers" selected and the other two disabled with "Coming soon".
2. **Access gate invents facts that contradict the architecture.** Remove "AST parsed: Client-side", "All AST analysis runs client-side and ephemeral serverless workers", "Latency < 350ms", "API Status: Normal (24ms)", "Worker Fleet: Ready", "Gateway 0.9.4". Parsing runs on our server (one Render instance), and we have no measured latency. Replace them with honest copy, e.g. "Public repositories only · Up to 100 code files · Drafts for human review".
3. **Access gate shows a pre-filled key (`ds_live_…`) marked ACTIVE.** Show an empty field labeled "Access code" (the term used everywhere else) with a "Continue" button.
4. **`DESIGN.md` uses the word "Verified"** ("Source-Checked / Verified", "verifiable evidence", "real-time commit verification"). The product promise forbids "verified". Rename to "Source-checked" and "commit-pinned evidence".

### Should fix (consistency and layout)

5. **Fonts fall back to a serif typeface.** Many labels (breadcrumb, eyebrows, commit chips, table metadata, map node labels) render in a Times-like serif. `DESIGN.md` specifies JetBrains Mono, but the font isn't loading. Load the mono font (Geist Mono or JetBrains Mono, pick one) in the HTML head.
6. **Home top bar shows run-specific controls** (`main @ 9f2c1e4`, Docs/Repo map/Guided tour tabs, "3 open findings", Export) on the New documentation page. These belong on a run's pages. On Home, keep only the breadcrumb, "How it works" and the theme toggle.
7. **Sidebar repeats "New documentation"** (a button and a nav item). Keep one.
8. **Guided tour breadcrumb reads "Workspace / New documentation"** and the "Docs" tab is active. It should be "Library / habit-space" with "Guided tour" active.
9. **Repo map nodes merge and clip.** Page and route nodes share one wide box (HabitsPage + GET /api/habits). The `habits` and `users` tables are cut off at the right edge. Most connecting lines are missing. The guide orb overlaps `createHabit()`. Use separate nodes with visible edges, and keep the canvas inside its frame.
10. **"On this tour / Other code" render as checkboxes.** These are a legend. Either make them real filters or style them as a legend.
11. **Evidence code lines are cut off** horizontally. Add horizontal scroll with a fade, or wrap long lines.

### Missing screens (from the Stitch prompt, not generated yet)

Run in progress · Run finished with errors · Run failed · Docs viewer · Edit mode · Review panel (finding expanded) · Repo map (full, plus Request trace view and node drawer) · Tour finished · Guide character sheet (5 states) · Library / saved runs · Export dialog · Explore a sample · Add context drawer · Mobile (Home, Docs viewer, Tour) · Light theme (Home, Docs viewer).

**Needed for the core (Tasks 1–6), in priority order:** Run in progress, Docs viewer, Review panel, Edit mode, Library, Export dialog, Run failed. The repo map, tour, character sheet and user-guide screens are for add-on Tasks 10–12.

To generate them, give Stitch: "Continue the same DocSync design system as the previous screens (see DESIGN.md)", followed by 3–4 screen descriptions at a time.

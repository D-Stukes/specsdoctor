# DocSync demo script (about 5 minutes)

The story: **a README goes stale the day someone renames a function. DocSync reads the code instead, cites the exact lines, and flags what it is unsure about.**

Everything on screen comes from a real run. Nothing here is mocked, and nothing is called "verified".

## Before you start

### One-time setup (needs a person with GitHub access)

The demo repository is a small habit tracker kept in `fixtures/demo-habit-tracker/`. It has two branches: `main`, where the README matches the code, and `demo-stale-readme`, where the code was renamed and the README was not.

```bash
server/scripts/build-demo-repo.sh --git ~/demo/habit-tracker
```

DocSync reads public GitHub repositories only, so the repo has to be published. Publishing is a public action, so it is a deliberate step for you (not done by the build script):

```bash
cd ~/demo/habit-tracker
gh repo create <your-account>/habit-tracker-demo --public --source . --push
git push origin demo-stale-readme
```

### The day before

1. `server/.env`: real `ANTHROPIC_API_KEY`, `AI_STUB_MODE=false`, your `ACCESS_CODE`, and a **`GITHUB_TOKEN`** (without it GitHub allows 60 requests an hour for the whole server, about 30 runs).
2. `npm run migrate --workspace=@docsync/server`, then `npm run build --workspace=@docsync/client`, then `npm run start --workspace=@docsync/server`.
3. Generate and keep these saved runs (each costs a few cents). A live run takes 30 to 70 seconds, so the demo opens a saved one:
   - `https://github.com/<you>/habit-tracker-demo/tree/demo-stale-readme`
   - `https://github.com/AndrewJBateman/pern-stack-auth` (a larger real project for the map and tour)
4. Open the saved habit-tracker run once and check that the Guided tour button is there and a voice plays (voices differ by browser and operating system).
5. Two terminal tabs open in `server/`:
   ```bash
   node scripts/demo-readme-check.mjs
   node scripts/demo-inject-defects.mjs
   ```
6. Edits are saved into the run they are made on, so do the live edit on a spare copy of the run (generate the habit-tracker branch twice, keep one untouched).
7. Browser window about 1280 by 800, system "reduce motion" off, sound on, notifications off.

## The script

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 | Slide or the README on GitHub (`demo-stale-readme` branch) | "This README says to run `npm run dev`, set `DB_URL`, and that `createHabit()` handles new habits. Someone renamed all three last week. The README doesn't know." |
| 0:30 | Terminal: `node scripts/demo-readme-check.mjs` | "Here are the three lines that are now wrong. A new teammate following this loses an hour. Now watch what DocSync writes for the same branch." |
| 0:50 | App: paste the `/tree/demo-stale-readme` URL, click **Create docs**. Let it start, then open the saved run | "It reads the code with a parser, not by guessing. The AI explains; code supplies every name, signature and link." |
| 1:30 | **Getting started** and **Configuration** pages | "`npm start`, `DATABASE_URL`: the real ones. The stale names appear nowhere. Every link goes to a line pinned to this exact commit." Click one source link. |
| 2:15 | Terminal: `node scripts/demo-inject-defects.mjs` | "I injected five mistakes. A function that doesn't exist, a line past the end of the file, a missing file, a made-up endpoint: all four caught. The fifth is a real function with the wrong behaviour. It passes, because every name and line is real. That is the honest limit: a model-written claim check for it isn't built yet." |
| 3:00 | App: open a page, **Edit**, add `` `sendWelcomeEmail()` `` and **Save**. Go back to the run: **Needs review** shows it. Resolve it with a note | "Edit anything and it is re-checked. Uncertain statements land in a review list for a person. We never say verified; we say source-checked, with a human review step." |
| 3:30 | Open the `pern-stack-auth` saved run, **Open the interactive map**. It opens on **Follow the data** | "Pick what a person does, say 'Create an account', and read the steps: the sign-up form asks, the details come in, a check runs, the app looks up and saves the user, and the answer goes back, including what it says when something is wrong. Plain English is on; untick it to see the code names." Then **Functions**, click a node for its drawer, switch to **Architecture** and toggle **Collapse areas**. |
| 4:15 | **Guided tour**, "Follow a request", press Play | "A guide walks the request from the screen to the endpoint, the middleware, and the tables, and reads each stop aloud. Every stop is a real node on this map; the model only writes the words." |
| 4:50 | **Download docs (.zip)**, then show `provenance.md` | "The export is a normal docs site (`mkdocs serve`). Provenance lists the commit, the models and every open warning." |
| 5:00 | Close | "Drafts, not verified specs. What is not built: the AI claim check, Python, and plain-language guides." |

## Words to avoid
- Never "verified", "guaranteed" or "always correct". Use "source-checked", "draft", "flagged for review".
- Do not claim the AI claim check exists (Task 7) or that tour narration is claim-checked beyond names.
- Do not call the evaluation numbers a benchmark: two small public repos, three runs each.

## If something goes wrong
- **GitHub rate limit message:** "GitHub's request limit for this server is used up..." means `GITHUB_TOKEN` is not set. Use the saved runs.
- **A live run is slow or fails:** open the saved run; say the live run takes about a minute.
- **No voice:** the Voice box is greyed out; tick Captions and narrate yourself.
- **Tour button missing:** the run was made before tours existed; open a newer saved run.
- **Network down:** every step except starting a new run works from saved runs and the local terminal scripts.

## Numbers you can quote (from `docs/evaluation/` and LOG.md)
- `pern-stack-auth`: median 30 s, $0.029 per run. `Amazon-Clone-PERN-stack`: median 67 s, $0.057 per run (3 runs each, real API).
- A run with tours costs about $0.04 more.
- 0 false alarms per run on both repos after the fixes.

## Recording
**Not recorded yet; this needs a person.** Rehearse once end to end against the saved runs, then record at 1080p with system audio on so the guide's voice is captured. The M6 "demo recorded" box in the Technical Design stays unchecked until then.

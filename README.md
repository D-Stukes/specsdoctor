# SpecsDoctor

Technical writers on engineering teams spend much of their time digging through unfamiliar code just to figure out what a project does and what's undocumented. When docs fall behind the code, new engineers and users lose time and trust.

**Live app:** https://specsdoctor.vercel.app (access code available on request)

**SpecsDoctor reads a public GitHub repo and turns it into documentation drafts you can review, edit, and trust, with every claim linked back to the exact line of code it came from.** Anything it isn't sure about is flagged for a human to review.

## Key features

- **Source-linked drafts:** Get a first draft of a project's documentation in about a minute, with each statement linked to the code it describes, so you can check it instead of taking it on faith.
- **Review flags:** Anything SpecsDoctor isn't sure about is marked for human review, so you know exactly where to spend your attention.
- **Interactive repo map:** See how the project fits together and follow a request through the app step by step, with a Plain English toggle for non-developers.
- **Guided tours:** Watch a narrated, animated walkthrough of the codebase, so a newcomer can get oriented without reading every file.
- **Ask this repo:** Ask questions about the project in plain language and get answers with sources attached.

## How it stays accurate

The code supplies the facts and the AI only explains them. Parsers read the repo directly, and every AI response must match a fixed JSON shape before it's used. SpecsDoctor never runs the code it analyzes, and it never labels its output "verified"; it shows what was checked against source and what still needs a human.

## Tech stack

- **Frontend:** React + Vite, React Flow (`@xyflow/react`) with ELK.js for the repo map, react-markdown + remark-gfm for rendering docs
- **Backend:** Node.js + Express, PostgreSQL (`pg`)
- **AI:** Claude via the Anthropic SDK (`@anthropic-ai/sdk`), with structured JSON outputs validated by Ajv
- **Code analysis:** `@babel/parser` and `@babel/traverse` for JavaScript/TypeScript, `pgsql-ast-parser` for SQL schemas
- **Export:** `archiver` to bundle docs into a downloadable ZIP
- **Hosting:** Vercel (app) + Supabase (Postgres). Live at https://specsdoctor.vercel.app

## Built by

Diane "Lady D" Stukes and Dikshyant Giri, Pursuit AI Builder Fellowship (L2), November 2026. The project was called DocSync during development, so you'll still see that name in some file and database names.

---

## Run it locally

### Layout

- `contracts/` - JSON schemas, Ajv validators, TS types, shared constants .
- `server/` - Express API + Postgres migrations. `server/db/migrations/` is
  the authoritative SQL schema (Technical Design §4b).
- `client/` - Vite + React frontend.
- `fixtures/` - test fixtures for the Scanner, starting with `fixture-pern-mini`.

### Local setup

Requires Node 18+ and a Postgres database.

```bash
npm install
```

Set these environment variables before running the server (there's no
`.env.example` checked in yet - this dev environment blocks writing files
named `.env*`; create your own `.env` or export them in your shell):

| Variable | Example | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://localhost:5432/docsync_dev` | any Postgres 14+ |
| `SESSION_SECRET` | any random string | signs the session cookie |
| `ACCESS_CODE` | any string | the code `POST /api/session` checks against |
| `PORT` | `4000` | optional, defaults to 4000 |

```bash
createdb docsync_dev          # first time only
npm run migrate -w server     # applies server/db/migrations/*.sql
```

Run the API and the client dev server in two terminals:

```bash
npm run dev:server
npm run dev:client            # proxies /api to localhost:4000, per client/vite.config.js
```

Or build the client and let the server serve it as one process (closer to
production/Render):

```bash
npm run build -w client
npm run dev:server            # now also serves client/dist/
```

### Tests

```bash
npm test                      # every workspace
npm run test:contracts        # just the schema validation tests
npm run test -w server        # smoke tests (needs DATABASE_URL etc., see above)
```


`ACCESS_CODE` is a simple shared code that keeps the app from being open to the public, since every run uses paid AI calls. Set any value and enter it on the first screen.

### Project docs

- `docs/DocSync-Final-PRD.md` - what we built and why
- `docs/DocSync-Technical-Design.md` - architecture, data contracts, and API
- `LOG.md` - session-by-session build history
- `CHANGELOG.md` - work mapped to commits

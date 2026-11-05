# DocSync

See [CLAUDE.md](CLAUDE.md) and [docs/](docs/) for what this is and why. This
file is just how to run it.

## Layout

- `contracts/` - JSON schemas, Ajv validators, TS types, shared constants (T01).
- `server/` - Express API + Postgres migrations. `server/db/migrations/` is
  the authoritative SQL schema (Technical Design §4b).
- `client/` - Vite + React frontend.
- `fixtures/` - test fixtures for the Scanner, starting with `fixture-pern-mini`.

## Local setup

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

## Tests

```bash
npm test                      # every workspace
npm run test:contracts        # just the schema validation tests
npm run test -w server        # smoke tests (needs DATABASE_URL etc., see above)
```

## Current state (T01-T03 of Task 1 - Foundations)

- Contracts, fixtures and the scaffold described above all exist and are
  tested locally. See `LOG.md` for the session-by-session history.
- **Stub mode only.** `POST /api/runs` fakes a resolved SHA and marches
  `run_stages` through a timer (`server/src/stub/runner.js`) - there's no
  Repo Reader, Scanner, or model call yet. Those start in Task 2.
- **Not deployed yet.** M1 ("the *deployed* app ... shows a stub run
  progressing") is verified locally (`npm run dev:server` + the client) but
  not on Render - that needs a Render account and a Postgres connection
  string (Neon, per the technical design), which this session doesn't have
  access to.

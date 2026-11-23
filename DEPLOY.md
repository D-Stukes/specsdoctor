# SpecsDoctor deployment checklist

Goal: a live link that someone outside our pair can use cold, with no help.

## Plan
- **Database:** Supabase (free tier, standard Postgres). Our existing migrations run on it unchanged.
- **App:** Vercel. The React client is static files; the Express API runs as one Vercel Function (`api/index.js`, `vercel.json`). Runs keep going after the response via `waitUntil`, up to Vercel Hobby's 5-minute limit; a run cut off at that limit is marked failed after 10 minutes so the queue never jams. Small and medium repos finish well inside that.

## Steps
1. Create the Supabase project and copy its connection string.
2. Run the migrations against it: `DATABASE_URL=<supabase url> npm run migrate -w server`
3. In Vercel, import this GitHub repo (Root Directory: the repo root). `vercel.json` already sets the build, output folder and API function.
4. Set the environment variables below.
5. Run every check below. Only then share the link.
6. Add the live link and tester access code to the top of the README.

## Environment variables and how to check each one

| Variable | Value | Check before sharing the link |
| --- | --- | --- |
| `DATABASE_URL` | Supabase **Transaction pooler** connection string (port 6543) | Migrations succeed and the tables appear in Supabase's table view |
| `AI_STUB_MODE` | `false` | **Defaults to stub mode (fake, free answers) if left unset.** Run a real repo and confirm the draft describes that repo's actual code |
| `ANTHROPIC_API_KEY` | our key | Same real-repo run as above succeeds |
| `GITHUB_TOKEN` | a GitHub token | Without it GitHub allows 60 requests an hour (about 30 runs). Run two different repos back to back with no rate-limit error |
| `ACCESS_CODE` | shared tester code | In a private window, a wrong code is rejected and the right one gets in |
| `SESSION_SECRET` | any long random string | Sign in, refresh, and stay signed in |
| `NODE_ENV` | `production` | App serves the built client |

## After the cold test: what to fix first
1. **Blockers:** they can't get a result at all.
2. **Trust problems:** wrong source links, claims that should have been flagged.
3. **Confusion:** wording or layout, starting with whatever confused them first.

## Status
- [ ] Supabase database created
- [ ] Host chosen and service created
- [ ] All checks pass
- [ ] Live link + access code added to README
- [ ] Other pair tested it cold; notes added to TESTING.md

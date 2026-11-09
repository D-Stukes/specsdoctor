-- Idea 5 (see LOG.md's "wow factor" brainstorm): a public, unauthenticated
-- share link for one run's guided tour - a portfolio piece you can hand to
-- someone without the app's access code. Off by default (NULL); the run's
-- owner turns it on per run via POST /api/runs/:id/share, which generates
-- this token. A per-run, unguessable token - never the shared ACCESS_CODE -
-- so sharing one run's link can never expose any other run.
ALTER TABLE runs ADD COLUMN share_token text UNIQUE;

-- DocSync initial schema. Technical Design SS4b.
-- Authoritative copy for T01 (contracts pack); run by the migration runner added in T03.
-- Everything is run-scoped: a run owns its file inventory, source text, index,
-- summaries, pages and findings, so a saved run can be reopened and rechecked
-- without GitHub. Caching (Could, not in v1) is kept out of these tables.

CREATE TYPE run_status   AS ENUM ('queued','running','complete','complete_with_errors','failed');
CREATE TYPE stage_status AS ENUM ('pending','running','done','partial','skipped','failed');
CREATE TYPE page_status  AS ENUM ('generated','not_applicable','not_detected','unsupported','generation_failed');
CREATE TYPE review_status AS ENUM ('open','corrected','dismissed','accepted_uncertain');

CREATE TABLE repos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner text NOT NULL, name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner, name)
);

CREATE TABLE runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid NOT NULL REFERENCES repos(id),
  requested_ref text,                    -- branch, tag or SHA as typed; NULL = default branch
  resolved_sha char(40),                 -- set once by the Repo Reader
  status run_status NOT NULL DEFAULT 'queued',
  failure_code text, failure_detail text,
  intake jsonb,                          -- 3 answers, or NULL
  config jsonb NOT NULL,                 -- models, prompt_version, schema_version, parser_version, limits
  budget_cap_usd numeric(8,4) NOT NULL,
  cost_usd numeric(8,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz, finished_at timestamptz
);
CREATE INDEX runs_status_created ON runs (status, created_at);
CREATE UNIQUE INDEX runs_one_active_per_sha ON runs (repo_id, resolved_sha)
  WHERE status IN ('queued','running');  -- duplicate-Generate guard

CREATE TABLE run_stages (
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  stage text NOT NULL,                   -- reader|scanner|analyst|architect|writer|verifier|render
  status stage_status NOT NULL DEFAULT 'pending',
  attempt int NOT NULL DEFAULT 0,
  items_total int, items_done int DEFAULT 0, items_failed int DEFAULT 0,
  message text, started_at timestamptz, finished_at timestamptz,
  PRIMARY KEY (run_id, stage)
);

CREATE TABLE run_events (                -- operational failures and warnings
  id bigserial PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  stage text, level text NOT NULL CHECK (level IN ('info','warn','error')),
  code text NOT NULL,                    -- e.g. module_failed, parse_error, budget_skipped, timeout
  detail jsonb, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE model_calls (
  id bigserial PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  stage text NOT NULL, model text NOT NULL, attempt int NOT NULL,
  input_tokens int, output_tokens int, cache_read_tokens int, cache_write_tokens int,
  est_cost_usd numeric(10,6), status text NOT NULL, latency_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE files (                     -- inventory + coverage report source
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  path text NOT NULL, language text, size_bytes int, sha256 char(64),
  status text NOT NULL CHECK (status IN ('scanned','skipped','unsupported','failed')),
  reason text,
  content text,                          -- kept only for scanned files and manifests: evidence for the Verifier
  PRIMARY KEY (run_id, path)
);

CREATE TABLE index_items (
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  id text NOT NULL,                      -- stable item ID, see 4c
  kind text NOT NULL,                    -- function|class|method|constant|type|endpoint|env_var|script|table
  name text NOT NULL, path text NOT NULL,
  start_line int NOT NULL, end_line int NOT NULL,
  documented boolean NOT NULL,
  data jsonb NOT NULL,                   -- full item per the index schema
  PRIMARY KEY (run_id, id)
);
CREATE INDEX index_items_name ON index_items (run_id, name);

CREATE TABLE run_artifacts (             -- one row per run: whole-run JSON outputs
  run_id uuid PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  snapshot jsonb, coverage jsonb, project_facts jsonb, import_graph jsonb, architect_output jsonb
);

CREATE TABLE summaries (
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  module_path text NOT NULL,
  summary jsonb NOT NULL, model text NOT NULL, prompt_version text NOT NULL,
  PRIMARY KEY (run_id, module_path)
);

CREATE TABLE pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  slug text NOT NULL, title text NOT NULL,
  status page_status NOT NULL, owner_stage text NOT NULL,  -- writer|architect|renderer
  current_rev int NOT NULL DEFAULT 1,
  UNIQUE (run_id, slug)
);

CREATE TABLE page_revisions (
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  rev int NOT NULL,
  origin text NOT NULL CHECK (origin IN ('generated','repaired','user')),
  structured jsonb,                      -- page JSON (generated/repaired only)
  markdown text NOT NULL,                -- may be '' if the user empties a page
  checks_fresh boolean NOT NULL DEFAULT false,
  reviewed_at timestamptz, reviewed_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, rev)
);

CREATE TABLE claim_checks (
  page_id uuid NOT NULL, rev int NOT NULL,
  claim_id text NOT NULL,
  structural text NOT NULL,              -- pass|fail|n/a
  ai_assessment text NOT NULL,           -- supported|contradicted|insufficient_evidence|not_assessed
  explanation text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, rev, claim_id),
  FOREIGN KEY (page_id, rev) REFERENCES page_revisions(page_id, rev) ON DELETE CASCADE
);

CREATE TABLE review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  page_id uuid REFERENCES pages(id) ON DELETE CASCADE,
  claim_id text,
  fingerprint text NOT NULL,             -- sha256(page slug + claim_id + reason): stable across rechecks
  reason text NOT NULL, severity text NOT NULL CHECK (severity IN ('critical','warning','info')),
  message text NOT NULL, evidence jsonb,
  status review_status NOT NULL DEFAULT 'open',
  resolution_note text, resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, fingerprint)
);

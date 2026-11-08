-- The Explorer (Task 11 follow-on, see LOG.md "the guide explores on its own"):
-- one explorer/1 walk per run, generated on demand like Ask and cached here so
-- it is not regenerated (and not re-charged) on every visit to the map.
CREATE TABLE explorer_runs (
  run_id uuid PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  explorer jsonb NOT NULL,
  status text NOT NULL DEFAULT 'ready',  -- ready | template_only
  cost_usd double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

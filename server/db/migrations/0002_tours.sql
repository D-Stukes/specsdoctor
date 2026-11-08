-- Guided tours (Task 11, §4f): up to four per run, stored as tour/1 JSON.
CREATE TABLE tours (
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  tour_id text NOT NULL,                 -- big-picture | follow-request | data-storage | start-here
  tour jsonb NOT NULL,
  status text NOT NULL DEFAULT 'ready',  -- ready | template_only
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, tour_id)
);

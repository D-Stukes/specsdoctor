-- Task 12 (T35, see docs/DocSync-Technical-Design.md §4f "Plain-language user guides"): who a
-- run's docs are written for. Defaults to "developers" (today's only real behavior) so existing
-- rows and any run that doesn't send the field stay exactly as before.
ALTER TABLE runs ADD COLUMN write_for text NOT NULL DEFAULT 'developers'
  CHECK (write_for IN ('developers', 'everyday', 'both'));

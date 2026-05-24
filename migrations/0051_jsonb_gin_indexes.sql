-- 0051_jsonb_gin_indexes.sql
--
-- GIN index for the slug-redirect containment lookup used by
-- storage.getCalculatorByOldSlug(). The query is invoked on every
-- unknown-slug hit against the public calculator hosting endpoint,
-- and without this index Postgres falls back to a full sequential
-- scan of `calculators` + JSON parse of `calculator_settings` for
-- each row to evaluate the `@> [...]::jsonb` containment.
--
-- The index is partial so it only covers rows that actually have a
-- `_slug_redirects` array — most calculators don't, so the partial
-- index stays small and the typeof guard in the query short-circuits
-- to the same predicate.
--
-- jsonb_path_ops is the correct operator class here: it only supports
-- the `@>` containment operator (which is the only operator the query
-- uses) and produces a smaller, faster index than the default
-- jsonb_ops class. CREATE INDEX runs inside the migration transaction
-- (see 0050 note re: bootstrapMigrations) — acceptable since the
-- calculators table is small pre-launch.

CREATE INDEX IF NOT EXISTS idx_calculators_slug_redirects_gin
  ON calculators
  USING GIN ((calculator_settings -> '_slug_redirects') jsonb_path_ops)
  WHERE jsonb_typeof(calculator_settings -> '_slug_redirects') = 'array';

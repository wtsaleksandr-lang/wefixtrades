-- 0089_hours_widget_variant.sql
--
-- Free-tools fix: the business-hours widget's display variant (badge / table /
-- both) was chosen in the portal and embedded into the snippet
-- (data-variant="..."), but it was never persisted — the save PUT omitted it,
-- so on reload the picker reset to "both" and the live preview could not honor
-- the chosen variant.
--
-- Add an explicit `hours_variant` column on clients so the selection
-- round-trips. Default "both" matches the prior implicit behavior; ADD COLUMN
-- ... DEFAULT is metadata-only on PG11+ and backfills every existing row.
--
-- Additive + IF NOT EXISTS for re-run safety (bootstrapMigrations runs every
-- file on every cold boot). No destructive statements.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS hours_variant text NOT NULL DEFAULT 'both';

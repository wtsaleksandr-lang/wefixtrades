-- 0088_callback_widget_mode.sql
--
-- Free-tools fix: the callback widget's display mode (inline vs popup) was
-- chosen in the portal and embedded into the snippet (data-mode="..."), but it
-- was never persisted — the save PUT omitted it, so on reload the selector
-- reset to "inline" and the live preview could not honor the chosen mode.
--
-- Add an explicit `mode` column so the selection round-trips. Default "inline"
-- matches the prior implicit behavior; ADD COLUMN ... DEFAULT is metadata-only
-- on PG11+ and backfills every existing row with the prior default.
--
-- Additive + IF NOT EXISTS for re-run safety (bootstrapMigrations runs every
-- file on every cold boot). No destructive statements.

ALTER TABLE callback_widget_configs
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'inline';

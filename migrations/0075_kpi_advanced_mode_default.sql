-- Portal fix: KPI indicators were hidden for accounts still carrying a stale
-- display_preferences.mode = "simple" from before "advanced" became the default
-- (Wave 43). Advanced mode shows every gauge / chart / KPI; simple hides the
-- advanced ones, so a stale-simple account sees almost no indicators — which is
-- exactly the "where are all my KPIs?" report.
--
-- Flip any lingering "simple" to "advanced" so existing accounts see their
-- indicators, matching the current default for fresh users. Anyone who prefers
-- the minimal view can re-toggle in Settings → Display.
--
-- Idempotent + targeted: only rows whose mode is currently "simple" are touched.
-- The ::jsonb cast keeps this correct whether clients.metadata is json or jsonb.

UPDATE clients
SET metadata = jsonb_set(
      metadata::jsonb,
      '{display_preferences,mode}',
      '"advanced"'::jsonb,
      true
    )
WHERE metadata::jsonb->'display_preferences'->>'mode' = 'simple';

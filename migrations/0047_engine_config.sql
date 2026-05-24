-- 0047_engine_config.sql
--
-- Per-product engine config — operational toggles distinct from the
-- customer-visible copy (which already lives in name/tagline/description
-- and goes through the draft → publish flow in product_drafts).
--
-- engine_config is intentionally free-form jsonb so individual products
-- can namespace their own keys (e.g. AdFlow stores audience + spend cap
-- under engine_config.adflow.*) without one column per product.
--
-- Shape is validated server-side by engineConfigSchema in
-- shared/engineConfig.ts. PATCH /api/admin/services/:id/engine-config
-- writes this column directly (no draft flow) because these are admin
-- operational levers, not customer-facing copy.
--
-- Additive only — column defaults to NULL so existing rows are
-- unaffected. Idempotent via IF NOT EXISTS.

ALTER TABLE service_catalog
  ADD COLUMN IF NOT EXISTS engine_config JSONB;

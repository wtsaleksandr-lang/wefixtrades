-- 0038_product_catalog_visibility_and_sort.sql
--
-- Adds per-product visibility flag and ensures sort_order is indexed for the
-- new <AdminProductPageShell> + customer-catalog rendering paths.
--
-- Why two switches (is_active + hidden), not one:
--   • is_active=false  → blocks new checkout / signup for this product.
--                        Existing subscribers continue to be served. Legacy
--                        SKUs use this when we stop accepting new subs.
--   • hidden=true      → removed from public /products list and /pricing
--                        comparison rows. Existing subs unaffected and any
--                        deep link to /products/<slug> still resolves.
--
-- They are deliberately independent axes. The product can be active-and-hidden
-- (private / invite-only SKU) or inactive-but-visible (legacy product still
-- listed for grandfathered customers but no new buyers).
--
-- Idempotent: every statement uses IF NOT EXISTS so re-runs are no-ops.
-- sort_order already exists in 0000_initial_schema.sql; the ADD is defensive.

ALTER TABLE service_catalog
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE service_catalog
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 100;

CREATE INDEX IF NOT EXISTS service_catalog_visibility_idx
  ON service_catalog(is_active, hidden);

CREATE INDEX IF NOT EXISTS service_catalog_sort_idx
  ON service_catalog(sort_order, name);

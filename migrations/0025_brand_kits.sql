-- Wave W-AO-6d — Brand Studio Wave 2: reusable Brand Kits.
--
-- A "Brand Kit" is a saved bundle of QuoteQuick style settings a customer
-- can apply across all the calculators they own. The bundle stores an
-- `AdvStyle`-shaped JSON blob (the same shape persisted under
-- `calculators.calculator_settings.advanced.style`) plus a separate
-- `logo_url` column so the picker can render the kit's logo without having
-- to decode the JSON.
--
-- Ownership / visibility:
--   - Each kit belongs to a single user (users.id). DELETE CASCADE so a
--     deleted user takes their kits with them — no orphan rows.
--   - Pro-tier-only at the API layer (portalBrandKitsRoutes.ts). The
--     migration itself enforces no plan check; the gate is server-side.
--
-- Index: (user_id, created_at desc) for the "MY brand kits" listing.

CREATE TABLE IF NOT EXISTS "brand_kits" (
  "id"          text PRIMARY KEY,
  "user_id"     integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name"        text NOT NULL,
  "description" text,
  "style"       jsonb NOT NULL,
  "logo_url"    text,
  "is_default"  boolean DEFAULT false,
  "created_at"  timestamp DEFAULT now() NOT NULL,
  "updated_at"  timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "brand_kits_user_idx"
  ON "brand_kits" ("user_id", "created_at" DESC);

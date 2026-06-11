-- 0082_client_payments_currency.sql
--
-- Lane B — USD canonicalization.
--
-- Adds an explicit `currency` column to client_payments so billing surfaces
-- (portal billing, admin billing ledger) render currency from the row instead
-- of assuming "$" implicitly. Every price in the catalog, every Stripe price,
-- and every historical payment is USD, so the default doubles as the backfill:
-- ADD COLUMN ... NOT NULL DEFAULT is a metadata-only change on PG11+ and
-- stamps 'usd' onto all existing rows without a table rewrite.
--
-- ISO 4217, lowercase — matches the Stripe API convention ("usd") used across
-- server/routes/publicCheckoutRoutes.ts and server/services/stripeProductSync.ts.
--
-- Additive + IF NOT EXISTS for re-run safety (bootstrapMigrations runs every
-- file on every cold boot). No destructive statements.

ALTER TABLE client_payments
  ADD COLUMN IF NOT EXISTS currency varchar(3) NOT NULL DEFAULT 'usd';

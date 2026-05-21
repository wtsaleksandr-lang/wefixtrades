-- Wave AM-3 — extend suppliers table with external-marketplace metadata.
--
-- WeFixTrades sources webfix fulfillment from Fiverr freelancers as well
-- as internal / API suppliers. The existing suppliers table covered
-- contact + cost + service routing but lacked vetting metadata. These 5
-- columns track external profile signals (specialties, turnaround,
-- rating, completed jobs) plus a `last_vetted_at` timestamp that drives
-- the Verified / Stale / Unverified badge in SuppliersPage.
--
-- All columns are nullable / defaulted so existing rows continue to work.
-- `specialties` defaults to an empty JSONB array so the UI multi-select
-- can iterate without null checks.

ALTER TABLE "suppliers"
  ADD COLUMN IF NOT EXISTS "specialties" jsonb DEFAULT '[]'::jsonb;

ALTER TABLE "suppliers"
  ADD COLUMN IF NOT EXISTS "avg_turnaround_days" integer;

ALTER TABLE "suppliers"
  ADD COLUMN IF NOT EXISTS "quality_rating" numeric(2, 1);

ALTER TABLE "suppliers"
  ADD COLUMN IF NOT EXISTS "external_completed_jobs" integer;

ALTER TABLE "suppliers"
  ADD COLUMN IF NOT EXISTS "last_vetted_at" timestamp;

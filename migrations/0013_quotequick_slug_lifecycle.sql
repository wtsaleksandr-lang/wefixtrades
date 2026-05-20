-- Wave P-E — slug lifecycle support.
--
-- Adds `updated_at` and `slug_release_warned_at` to the calculators table
-- so the daily slug-release cron can identify abandoned free-tier
-- calculators and release their subdomains for new users to claim.
--
-- - `updated_at` is bumped on every save and on every public view.
-- - The release cron (server/jobs/quotequickSlugRelease.ts) finds
--   free-tier rows where updated_at < now() - 30 days, null-deletes the
--   slug, and stamps slug_release_warned_at when it sends the heads-up
--   email 7 days prior.

-- Allow `slug` to be nullified by the release cron.
ALTER TABLE calculators
  ALTER COLUMN slug DROP NOT NULL;

ALTER TABLE calculators
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

ALTER TABLE calculators
  ADD COLUMN IF NOT EXISTS slug_release_warned_at TIMESTAMP;

-- Backfill: existing rows get updated_at = created_at so they aren't
-- instantly flagged as abandoned by the first cron tick.
UPDATE calculators
SET updated_at = COALESCE(created_at, NOW())
WHERE updated_at IS NULL;

-- Index supporting the cron's WHERE clause: free-tier + idle scan.
CREATE INDEX IF NOT EXISTS idx_calculators_slug_lifecycle
  ON calculators (plan_tier, updated_at)
  WHERE plan_tier = 'free';

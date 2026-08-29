-- 0094_citation_tracker_scrape_health.sql
--
-- Citation Tracker — distinguish "the scrape failed" from "the listing is
-- genuinely gone".
--
-- Before this, monitor.ts flipped a listing to status='missing' and fired a
-- HIGH-severity `removed_listing` alert (which emails the customer with the
-- subject "Citation Tracker alert — Citation removed") whenever a scraper
-- returned found:false. Scrapers return found:false on timeouts, HTTP 403 /
-- 429 rate limits, Cloudflare challenges and parse errors — so a transient
-- BBB rate-limit told a paying customer their BBB listing had been removed.
--
-- These columns let the monitor require a CONFIRMED negative (a scrape that
-- completed without error and found nothing) on two consecutive runs before
-- alerting, and keep the last transport error for ops.
--
-- All operations are additive + idempotent (ADD COLUMN IF NOT EXISTS).
-- Safe to re-run; runs on boot via server/lib/bootstrapMigrations.ts.

ALTER TABLE citation_tracker_listings
  ADD COLUMN IF NOT EXISTS consecutive_missing_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE citation_tracker_listings
  ADD COLUMN IF NOT EXISTS last_scrape_error TEXT;

ALTER TABLE citation_tracker_listings
  ADD COLUMN IF NOT EXISTS last_scrape_ok_at TIMESTAMP;

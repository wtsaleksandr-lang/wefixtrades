-- MapGuard automated Google Business Profile posts.
--
-- Tracks every GBP post MapGuard publishes on behalf of a customer.
-- Lives as a first-class table so the customer portal can render a
-- post calendar, the admin dashboard can show posts-published metrics,
-- and the team can audit what shipped + what failed.
--
-- Lifecycle: scheduled → drafted → published | failed | skipped
--   scheduled — row created by the monthly post fan-out cron
--   drafted   — drainer ran the AI content generator and stored the body
--   published — drainer called the GBP localPosts API; got remote id back
--   failed    — generator or publisher errored past max retries
--   skipped   — no GBP connection at publish time / posting disabled
--
-- Quota: tier-driven monthly counts (mapguard-basic=2, mapguard-pro=4).
-- Fan-out cron (1st of each month, 03:00 UTC) inserts that many rows
-- with `scheduled_for` evenly spaced across the month.

CREATE TABLE IF NOT EXISTS mapguard_posts (
  id                  SERIAL PRIMARY KEY,
  client_id           INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  client_service_id   INTEGER NOT NULL,
  quota_period        VARCHAR(7) NOT NULL,
  status              VARCHAR(16) NOT NULL DEFAULT 'scheduled',
  theme               VARCHAR(32),
  scheduled_for       TIMESTAMP WITH TIME ZONE NOT NULL,
  drafted_at          TIMESTAMP WITH TIME ZONE,
  published_at        TIMESTAMP WITH TIME ZONE,
  content             TEXT,
  media_url           TEXT,
  generator_metadata  JSONB,
  gbp_post_id         TEXT,
  last_error          TEXT,
  retry_count         INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mapguard_posts_status_idx
  ON mapguard_posts(status);

CREATE INDEX IF NOT EXISTS mapguard_posts_scheduled_for_idx
  ON mapguard_posts(scheduled_for);

CREATE INDEX IF NOT EXISTS mapguard_posts_client_period_idx
  ON mapguard_posts(client_id, quota_period);

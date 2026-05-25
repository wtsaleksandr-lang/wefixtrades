-- 0055_citation_tracker.sql
--
-- Citation Tracker (Wave 3) — recurring monitoring subscription product.
-- Distinct from Citation Builder (one-shot $79-$299, no DB state).
--
-- Three tables:
--   citation_tracker_subscriptions — one row per active sub (one per customer)
--   citation_tracker_listings      — per-directory listing snapshots
--   citation_tracker_alerts        — drift detections + dispatch log
--
-- Additive, online DDL. Safe to re-run via IF NOT EXISTS.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS citation_tracker_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id INTEGER NOT NULL REFERENCES users(id),
  business_name TEXT NOT NULL,
  nap JSONB NOT NULL,
  plan_tier VARCHAR(20) NOT NULL DEFAULT 'standalone',
  stripe_subscription_id TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  canceled_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_citation_tracker_subs_customer
  ON citation_tracker_subscriptions (customer_id);
CREATE INDEX IF NOT EXISTS idx_citation_tracker_subs_status
  ON citation_tracker_subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_citation_tracker_subs_stripe_sub
  ON citation_tracker_subscriptions (stripe_subscription_id);

CREATE TABLE IF NOT EXISTS citation_tracker_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES citation_tracker_subscriptions(id) ON DELETE CASCADE,
  directory_name TEXT NOT NULL,
  directory_url TEXT NOT NULL,
  listing_url TEXT,
  current_nap JSONB,
  last_checked_at TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  first_seen_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_citation_tracker_listings_sub
  ON citation_tracker_listings (subscription_id);
CREATE INDEX IF NOT EXISTS idx_citation_tracker_listings_status
  ON citation_tracker_listings (status);

CREATE TABLE IF NOT EXISTS citation_tracker_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES citation_tracker_subscriptions(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES citation_tracker_listings(id) ON DELETE SET NULL,
  alert_type VARCHAR(30) NOT NULL,
  old_value JSONB,
  new_value JSONB,
  severity VARCHAR(10) NOT NULL DEFAULT 'medium',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  read_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_citation_tracker_alerts_sub
  ON citation_tracker_alerts (subscription_id);
CREATE INDEX IF NOT EXISTS idx_citation_tracker_alerts_unread
  ON citation_tracker_alerts (subscription_id, read_at)
  WHERE read_at IS NULL;

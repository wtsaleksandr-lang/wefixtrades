-- 0057_rankflux_subscriptions.sql
--
-- Rankflux alert subscriptions (Wave 6B) — public free-tool email list
-- driven by /tools/local-rankflux. Three opt-in cadences (daily, weekly,
-- urgent-only); MozCast-driven dispatch via the rankflux_alert cron.
--
-- Additive, online DDL. Safe to re-run via IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS rankflux_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  daily BOOLEAN NOT NULL DEFAULT FALSE,
  weekly BOOLEAN NOT NULL DEFAULT FALSE,
  urgent BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT,
  confirmed_at TIMESTAMP,
  unsubscribed_at TIMESTAMP,
  last_daily_sent_at TIMESTAMP,
  last_weekly_sent_at TIMESTAMP,
  last_urgent_sent_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rankflux_subscriptions_email_uq
  ON rankflux_subscriptions (email);
CREATE INDEX IF NOT EXISTS rankflux_subscriptions_created_idx
  ON rankflux_subscriptions (created_at);

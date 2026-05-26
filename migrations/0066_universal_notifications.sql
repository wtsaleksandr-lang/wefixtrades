-- 0066_universal_notifications.sql
--
-- Wave 32 — Universal push-notifications service. Consolidates the
-- 5 per-product notification settings shipped in Waves 27-31 into a
-- central registry + dispatcher, and adds Web Push as a first-class
-- channel alongside email + SMS.
--
-- Three new tables, all additive — existing `clients.metadata.*_notifications`
-- blobs continue to be the persistence backstop for per-event opt-ins
-- (no data migration needed). The tables below are for:
--
--   1. customer_notification_preferences — per-customer × event row.
--      Optional; the per-product metadata blobs remain the source of
--      truth for now. Reserved for future preference flows that need
--      indexable queries (e.g. "which customers opted into anomaly
--      detection on web_push").
--
--   2. customer_push_subscriptions — Web Push subscription endpoints
--      that the service worker registers. One row per browser × device.
--
--   3. notification_log — delivery audit log. Every dispatch attempt
--      writes one row (sent / failed / skipped_opt_out / skipped_quiet_hours /
--      skipped_duplicate). Supports idempotency check + admin debugging.
--
-- Schema mirrors the Drizzle definitions in shared/schemas/notificationsUniversal.ts.
-- Safe to re-run (IF NOT EXISTS everywhere).

CREATE TABLE IF NOT EXISTS customer_notification_preferences (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL,
  product VARCHAR(32) NOT NULL,
  event_key VARCHAR(64) NOT NULL,
  channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  quiet_hours_start VARCHAR(5),
  quiet_hours_end VARCHAR(5),
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/New_York',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_notif_prefs_unique
  ON customer_notification_preferences (client_id, product, event_key);

CREATE INDEX IF NOT EXISTS idx_customer_notif_prefs_client
  ON customer_notification_preferences (client_id);


CREATE TABLE IF NOT EXISTS customer_push_subscriptions (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subs_endpoint
  ON customer_push_subscriptions (endpoint);

CREATE INDEX IF NOT EXISTS idx_push_subs_client
  ON customer_push_subscriptions (client_id);


CREATE TABLE IF NOT EXISTS notification_log (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL,
  product VARCHAR(32) NOT NULL,
  event_key VARCHAR(64) NOT NULL,
  channel VARCHAR(16) NOT NULL,
  status VARCHAR(32) NOT NULL,
  day_bucket VARCHAR(10) NOT NULL,
  payload_summary JSONB,
  error_message TEXT,
  recorded_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_log_client_recorded
  ON notification_log (client_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_notif_log_idempotency
  ON notification_log (client_id, product, event_key, channel, day_bucket);

CREATE INDEX IF NOT EXISTS idx_notif_log_status
  ON notification_log (status, recorded_at DESC);

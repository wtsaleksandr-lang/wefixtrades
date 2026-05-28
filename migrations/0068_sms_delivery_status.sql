-- 0068_sms_delivery_status.sql
--
-- Wave 78 (W-SMS-4) — SMS delivery visibility.
--
-- Adds Twilio MessageStatus tracking onto sms_messages so we can answer
-- "did this text actually deliver?" and auto-mark hard-bounced numbers as
-- opted-out (protecting sender reputation + avoiding wasted spend).
--
-- New columns:
--   * status         — Twilio MessageStatus: queued | sending | sent |
--                       delivered | undelivered | failed. NULL until the
--                       first status callback fires.
--   * error_code     — Twilio numeric error code (30003 / 30005 / 21610 …).
--   * error_message  — Twilio error description.
--   * delivered_at   — set once when status transitions to 'delivered'.
--   * updated_at     — tracks the last status callback write.
--
-- New index:
--   * idx_sms_messages_twilio_sid — lookup by MessageSid in the
--     POST /api/twilio/sms-status callback (see
--     server/routes/twilioStatusCallbackRoutes.ts).
--
-- Additive, online DDL. Safe to re-run via IF NOT EXISTS.

ALTER TABLE sms_messages
  ADD COLUMN IF NOT EXISTS status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS error_code INTEGER,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_sms_messages_twilio_sid
  ON sms_messages (twilio_sid);

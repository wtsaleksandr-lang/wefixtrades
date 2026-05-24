-- 0054_sms_opt_outs.sql
--
-- SMS opt-out registry. One row per opted-out phone number (E.164).
-- Every outbound SMS path MUST consult this table before send (see
-- server/twilioClient.ts sendSMS()).
--
-- opt_out_reason: 'stop_keyword' | 'manual' | 'hard_bounce' | other free-form tag.
--
-- Sources of writes:
--   * Twilio inbound webhook when body matches STOP / STOPALL / UNSUBSCRIBE /
--     CANCEL / END / QUIT (case-insensitive) — see server/routes/twilioRoutes.ts.
--   * Manual admin action (future) — reason = 'manual'.
--   * Carrier hard-bounce processing (future) — reason = 'hard_bounce'.
--
-- Additive, online DDL. Safe to re-run via IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS sms_opt_outs (
  id BIGSERIAL PRIMARY KEY,
  phone_e164 TEXT NOT NULL UNIQUE,
  opt_out_reason TEXT,
  opt_out_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_opt_outs_phone ON sms_opt_outs (phone_e164);

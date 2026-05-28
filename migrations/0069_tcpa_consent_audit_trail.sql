-- 0069_tcpa_consent_audit_trail.sql
--
-- Wave 79 — TCPA / CTIA consent audit trail.
--
-- Required to defend an SMS consent challenge. Today we store
-- `sms_consent` (boolean), `consent_timestamp`, and `consent_text_version`
-- on `leads`, plus a bare `sms_consent` boolean on `demo_quote_leads`.
-- That is not enough to prove the homeowner actually consented at a
-- specific URL on a specific session.
--
-- This migration extends both tables with:
--
--   consent_url            text     — page URL where consent was captured
--                                     (e.g. '/wizard?step=phone'). Useful
--                                     for documenting which surface the
--                                     consent text was shown on at the time
--                                     of capture, in case the wording is
--                                     iterated forward.
--   consent_ip_hash        text     — SHA-256(IP). Privacy-preserving;
--                                     enough to correlate with the access
--                                     log if needed, without storing PII.
--   consent_user_agent     text     — truncated to 200 chars upstream; the
--                                     server enforces the cap when writing.
--   consent_method         text     — 'web_form' | 'sms_keyword' |
--                                     'phone_call' | 'paper'. Free-text
--                                     today; check constraint kept loose
--                                     so we can add channels later
--                                     without a follow-up migration.
--
-- `consent_text_version` already exists on `leads` (varchar 50). We add it
-- to `demo_quote_leads` for parity. `consent_timestamp` exists on `leads`;
-- we add `consent_captured_at` on `demo_quote_leads` (`consent_timestamp`
-- name is taken on `leads` already and behaves identically — kept as-is to
-- avoid churning the existing capture pipeline).
--
-- All additive + IF NOT EXISTS for re-run safety. Existing rows default
-- NULL — backfill is intentionally NOT done here; rows pre-dating Wave 79
-- carry whatever consent context we already had at the time, and the
-- new columns are populated forward-only.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS consent_url        text,
  ADD COLUMN IF NOT EXISTS consent_ip_hash    text,
  ADD COLUMN IF NOT EXISTS consent_user_agent text,
  ADD COLUMN IF NOT EXISTS consent_method     varchar(20);

ALTER TABLE demo_quote_leads
  ADD COLUMN IF NOT EXISTS consent_captured_at  timestamp,
  ADD COLUMN IF NOT EXISTS consent_text_version varchar(50),
  ADD COLUMN IF NOT EXISTS consent_url          text,
  ADD COLUMN IF NOT EXISTS consent_ip_hash      text,
  ADD COLUMN IF NOT EXISTS consent_user_agent   text,
  ADD COLUMN IF NOT EXISTS consent_method       varchar(20);

-- Index on consent_captured_at / consent_timestamp helps the future
-- "show me all consents for phone X" reverse lookup we'll need for the
-- TCPA defence path. Partial index on rows where SMS consent was given
-- keeps the index lean.
CREATE INDEX IF NOT EXISTS idx_leads_consent_phone
  ON leads (phone, consent_timestamp DESC)
  WHERE sms_consent = true;

CREATE INDEX IF NOT EXISTS idx_demo_quote_leads_consent_phone
  ON demo_quote_leads (phone, consent_captured_at DESC)
  WHERE sms_consent = true;

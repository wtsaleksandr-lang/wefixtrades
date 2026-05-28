-- 0071_quotequick_homeowner_sms.sql
--
-- Wave 81 — QuoteQuick homeowner SMS flows.
--
-- Per the SMS audit, QuoteQuick today only fires trade-OWNER alerts on
-- quote events. The HOMEOWNER (the customer who just submitted the quote)
-- gets nothing — no quote-ready acknowledgment, no deposit receipt, no
-- expires-soon reminder, no post-job thank-you.
--
-- This migration adds idempotency tracking + a `quote_expires_at` column
-- so the new flows can be one-shot per quote/booking without relying on
-- in-memory dedup (which fails across pod restarts and parallel workers).
--
-- Flows (all routed through sendSmsAsClient with quietHoursBypass):
--   1. Quote-ready (transactional)      → leads.quote_ready_sent_at
--   2. Deposit-receipt (transactional)  → widget_deposits.deposit_receipt_sent_at
--   3. Expires-soon (reminder)          → leads.expires_soon_sent_at
--   4. Post-job thank-you (reminder)    → bookflow_appointments.post_job_thank_you_sent_at
--
-- `leads.quote_expires_at` drives the expires-soon worker. It's populated
-- forward-only by leadRoutes.ts at submission time (now + 7 days default,
-- configurable per-calculator via settings.appearance.quote.ttl_days).
-- Rows pre-dating Wave 81 keep NULL — the worker scopes WHERE expires_at
-- IS NOT NULL so legacy leads never get a spurious "expires tomorrow" text.
--
-- All additive + IF NOT EXISTS for re-run safety.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS quote_expires_at            timestamp,
  ADD COLUMN IF NOT EXISTS quote_ready_sent_at         timestamp,
  ADD COLUMN IF NOT EXISTS expires_soon_sent_at        timestamp,
  ADD COLUMN IF NOT EXISTS post_job_thank_you_sent_at  timestamp;

ALTER TABLE widget_deposits
  ADD COLUMN IF NOT EXISTS deposit_receipt_sent_at     timestamp;

ALTER TABLE bookflow_appointments
  ADD COLUMN IF NOT EXISTS post_job_thank_you_sent_at  timestamp;

-- Partial index on the expires-soon worker poll. Cheap because we only
-- index rows that haven't been notified yet and still have an expiry.
-- The worker query is roughly:
--   WHERE quote_expires_at BETWEEN now()+'23h' AND now()+'25h'
--     AND status = 'new'
--     AND expires_soon_sent_at IS NULL
CREATE INDEX IF NOT EXISTS idx_leads_expires_soon_pending
  ON leads (quote_expires_at)
  WHERE expires_soon_sent_at IS NULL
    AND quote_expires_at IS NOT NULL
    AND status = 'new';

-- Partial index on the post-job worker poll. Scopes to QuoteQuick-source
-- bookings only and rows that haven't been notified yet.
--   WHERE source = 'quotequick'
--     AND status = 'completed'
--     AND post_job_thank_you_sent_at IS NULL
--     AND updated_at <= now() - '1h'
CREATE INDEX IF NOT EXISTS idx_bookflow_appointments_postjob_pending
  ON bookflow_appointments (updated_at)
  WHERE post_job_thank_you_sent_at IS NULL
    AND status = 'completed'
    AND source = 'quotequick';

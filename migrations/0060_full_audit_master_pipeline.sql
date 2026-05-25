-- 0060_full_audit_master_pipeline.sql
--
-- Wave 3.6 — Full Audit Master pipeline (2026-05-25).
--
-- PR #817 created `full_audit_master_orders` (migration 0056) with the
-- minimum columns needed for the $9.80 checkout stub: status, payload,
-- session_id. This migration extends the table with the runtime
-- bookkeeping the real 5-section pipeline needs:
--
--   report_share_token  — random url-safe token used as auth for the
--                         public /full-audit-report/:orderId/:token route.
--                         The order id alone is a UUID — pairing it with
--                         a second secret keeps share URLs unguessable
--                         and lets us revoke a leaked link if needed.
--   started_at          — when the pipeline began (status → "running").
--                         Lets us spot orders that hang in "running".
--   failed_at           — when the pipeline transitioned to "failed".
--   error_message       — short reason string for failed orders, so the
--                         support inbox can triage without re-running.
--
-- Additive, online DDL. Safe to re-run via IF NOT EXISTS guards.
-- result_payload (jsonb) and result_pdf_url stay as defined in 0056.

ALTER TABLE full_audit_master_orders
  ADD COLUMN IF NOT EXISTS report_share_token TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

CREATE INDEX IF NOT EXISTS idx_full_audit_master_orders_token
  ON full_audit_master_orders (report_share_token);

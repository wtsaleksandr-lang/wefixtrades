-- 0056_citation_builder_and_full_audit.sql
--
-- Wave 3.5 launch-wiring closeout (2026-05-25).
--
-- Two new tables to back products whose marketing pages shipped before
-- the backend wiring:
--
--   citation_builder_submissions — Citation Builder ($79-$299 one-time,
--     marketing page lives at /citation-builder, shipped PR #815).
--   full_audit_master_orders     — Full Audit Master ($9.80 one-time
--     upsell, advertised on every free tool but had no checkout).
--
-- Additive, online DDL. Safe to re-run via IF NOT EXISTS.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS citation_builder_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id INTEGER NOT NULL REFERENCES users(id),
  tier VARCHAR(20) NOT NULL,
  business_info JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  stripe_payment_intent_id TEXT,
  stripe_session_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  completed_at TIMESTAMP,
  directories_submitted_count INTEGER NOT NULL DEFAULT 0,
  directories_total INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_citation_builder_subs_customer
  ON citation_builder_submissions (customer_id);
CREATE INDEX IF NOT EXISTS idx_citation_builder_subs_status
  ON citation_builder_submissions (status);
CREATE INDEX IF NOT EXISTS idx_citation_builder_subs_session
  ON citation_builder_submissions (stripe_session_id);

CREATE TABLE IF NOT EXISTS full_audit_master_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email TEXT NOT NULL,
  business_url TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  stripe_payment_intent_id TEXT,
  stripe_session_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  completed_at TIMESTAMP,
  result_payload JSONB,
  result_pdf_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_full_audit_master_orders_email
  ON full_audit_master_orders (customer_email);
CREATE INDEX IF NOT EXISTS idx_full_audit_master_orders_session
  ON full_audit_master_orders (stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_full_audit_master_orders_status
  ON full_audit_master_orders (status);

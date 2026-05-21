-- Wave R3 — Live shareable quote URLs.
--
-- Stores a customer's completed quote as an immutable-but-editable
-- snapshot reachable at /q/:slug. Both customer and contractor can revisit
-- the URL; the contractor (whoever has the owner_edit_token in their
-- localStorage on the creating device) can also tweak the values via PATCH
-- and have the customer see the update on refresh.
--
-- This is the "memory layer" / ResponsiBid-style killer feature: a quote
-- isn't a transient PDF email, it's a live link the contractor can refine
-- and the customer can return to.
--
-- Slug is an 8-char base36 string (server/shared/quoteSnapshot.ts).
-- owner_edit_token is 32-char hex (crypto.randomBytes(16)) returned ONLY
-- to the contractor on create — the customer's viewer never receives it.
--
-- Idempotent — re-running is a no-op.

CREATE TABLE IF NOT EXISTS quote_snapshots (
  id SERIAL PRIMARY KEY,
  snapshot_slug VARCHAR(16) NOT NULL UNIQUE,
  calculator_id INTEGER NOT NULL REFERENCES calculators(id),
  lead_id INTEGER REFERENCES leads(id),
  owner_edit_token VARCHAR(64),
  inputs JSONB NOT NULL,
  computed JSONB NOT NULL,
  customer_name TEXT,
  customer_email TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  last_viewed_at TIMESTAMP,
  last_edited_at TIMESTAMP,
  expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quote_snapshots_calc
  ON quote_snapshots (calculator_id, created_at DESC);

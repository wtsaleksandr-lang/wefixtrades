-- Wave R-2 — widget_deposits table.
--
-- Tracks Stripe Checkout sessions created from the QuoteQuick widget's
-- post-quote "Secure your slot" panel. Money flows via Stripe Connect to
-- the calculator owner's connected account (transfer_data.destination);
-- this table records each session so the webhook can mark it paid once
-- the customer completes checkout.
--
-- Idempotent — CREATE IF NOT EXISTS on the table, indexes, and any
-- subsequent run is a no-op.

CREATE TABLE IF NOT EXISTS widget_deposits (
  id SERIAL PRIMARY KEY,
  calculator_id INTEGER NOT NULL REFERENCES calculators(id),
  lead_id INTEGER REFERENCES leads(id),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | failed | refunded
  customer_email TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  paid_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_widget_deposits_calc
  ON widget_deposits (calculator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_widget_deposits_session
  ON widget_deposits (stripe_session_id);

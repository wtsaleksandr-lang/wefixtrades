-- 0093_portal_customers.sql
--
-- Portal CRM — the client-facing customer database. This is the #1 audit gap:
-- a trades business that moves its whole operation onto WeFixTrades needs a
-- unified customer record, not customer data smeared inline across each
-- appointment / invoice.
--
-- DISTINCT from `contacts` (WFT's internal admin address book). `customers` is
-- tenant-scoped by client_id exactly the way bookflow_appointments /
-- bookflow_invoices are.
--
-- All operations are additive + idempotent (CREATE TABLE / ADD COLUMN /
-- CREATE INDEX ... IF NOT EXISTS). Safe to re-run; runs on boot via
-- server/lib/bootstrapMigrations.ts.

-- ── Customers table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id          SERIAL PRIMARY KEY,
  client_id   INTEGER NOT NULL,
  name        TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  address     TEXT,
  notes       TEXT,
  tags        JSONB,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customers_client       ON customers(client_id);
CREATE INDEX IF NOT EXISTS idx_customers_client_name  ON customers(client_id, name);

-- ── Nullable back-references so the customer detail page can join history ──
-- Both additive; legacy inline rows stay NULL. No FK constraint — matches the
-- sibling bookflow_* client_id columns, which the app scopes in code.
ALTER TABLE bookflow_appointments ADD COLUMN IF NOT EXISTS customer_id INTEGER;
ALTER TABLE bookflow_invoices     ADD COLUMN IF NOT EXISTS customer_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_bookflow_appointments_customer ON bookflow_appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookflow_invoices_customer     ON bookflow_invoices(customer_id);

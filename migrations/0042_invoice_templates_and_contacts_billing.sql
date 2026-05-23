-- 0042_invoice_templates_and_contacts_billing.sql
--
-- Invoice Phase A: detail view + 3 templates + PDF + customer linking.
--
--   * invoice_templates    — builtin (Classic Minimal / Modern Bold / Trade
--                            Service) + per-client custom templates. Seeded
--                            with the 3 builtin slugs.
--   * clients              — default_invoice_template_slug + invoice_accent_color
--                            preferences. New invoices auto-apply.
--   * bookflow_invoices    — currency (label-only, no FX), issue_date,
--                            template_slug, contact_id (FK contacts).
--   * contacts             — billing_street/city/region/postal/country so a
--                            saved contact carries the address that auto-fills
--                            invoices it's linked to.

-- ── Templates ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = builtin (shared across all clients). Non-NULL = per-client custom
  -- template saved from one of their invoices.
  client_id       INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('builtin', 'custom')),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  layout_config   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS invoice_templates_client_idx ON invoice_templates(client_id);
-- Slug is globally unique for builtins (so /invoices?template=classic-minimal
-- resolves deterministically), but per-client custom templates can share slugs
-- across clients — the WHERE clause makes the unique index conditional.
CREATE UNIQUE INDEX IF NOT EXISTS invoice_templates_builtin_slug_idx
  ON invoice_templates(slug) WHERE client_id IS NULL;

-- Seed 3 builtin templates (idempotent — re-runs are no-ops).
INSERT INTO invoice_templates (client_id, kind, name, slug, layout_config) VALUES
  (NULL, 'builtin', 'Classic Minimal', 'classic-minimal',
   '{"accent":"#0d3cfc","headerStyle":"minimal","tableStyle":"simple"}'::jsonb),
  (NULL, 'builtin', 'Modern Bold',     'modern-bold',
   '{"accent":"#0d3cfc","headerStyle":"bold","tableStyle":"alternating"}'::jsonb),
  (NULL, 'builtin', 'Trade Service',   'trade-service',
   '{"accent":"#0d3cfc","headerStyle":"warm","tableStyle":"grouped"}'::jsonb)
ON CONFLICT DO NOTHING;

-- ── Client preference for default template + accent ────────────────────────
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS default_invoice_template_slug TEXT DEFAULT 'classic-minimal',
  ADD COLUMN IF NOT EXISTS invoice_accent_color TEXT DEFAULT '#0d3cfc';

-- ── Invoice-level fields ───────────────────────────────────────────────────
-- currency is label-only — no FX conversion happens anywhere.
ALTER TABLE bookflow_invoices
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS issue_date DATE,
  ADD COLUMN IF NOT EXISTS template_slug TEXT,
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

-- ── Contacts billing address ───────────────────────────────────────────────
-- Dedicated columns per audit recommendation (vs nested jsonb).
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS billing_street  TEXT,
  ADD COLUMN IF NOT EXISTS billing_city    TEXT,
  ADD COLUMN IF NOT EXISTS billing_region  TEXT,
  ADD COLUMN IF NOT EXISTS billing_postal  TEXT,
  ADD COLUMN IF NOT EXISTS billing_country TEXT DEFAULT 'US';

CREATE INDEX IF NOT EXISTS bookflow_invoices_contact_idx ON bookflow_invoices(contact_id);

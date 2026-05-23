-- 0040_free_tool_widgets.sql
--
-- Free-tools batch 1: FAQ widget, Business Hours widget, Trust Badges widget.
-- Schemas are keyed on clients(id) because the embeddable widgets resolve a
-- public widget_token (already a column on clients) into a client row.
--
-- client_faq_items     — ordered list of Q&A pairs per client
-- clients.business_hours / special_hours — per-day open/close + holiday overrides (JSONB)
-- client_trust_badges  — per-client array of selected badges with optional proofUrl

CREATE TABLE IF NOT EXISTS client_faq_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  published   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_faq_items_client_pos_idx ON client_faq_items(client_id, position);

-- Per-client business hours (regular weekly) + holiday/special-day overrides.
-- Stored as JSONB so the shape can evolve without further migrations:
--   business_hours: { tz: "America/Toronto", mon:{open:true,opens:"09:00",closes:"17:00"}, ... }
--   special_hours: [{ date:"2026-12-25", closed:true } | { date, opens, closes }]
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS business_hours JSONB;
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS special_hours JSONB;

CREATE TABLE IF NOT EXISTS client_trust_badges (
  client_id   INTEGER PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  badges      JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- array of { slug:string, label:string, proofUrl?:string, valueText?:string }
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

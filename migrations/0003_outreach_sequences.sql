-- Outreach Engine — Module 1 (AI copy engine) schema additions.
--
-- Adds two new tables for AI-drafted sequence content:
--   1. outbound_sequence_templates — one per campaign
--   2. outbound_sequence_steps     — N rows per template (intro + followups)
--
-- Per-prospect personalization tokens (ai_first_line, ai_offer_angle, etc.)
-- already exist on prospect_enrichment — see shared/schemas/outbound.ts.
-- Smartlead substitutes these as custom merge fields at send time.
--
-- Idempotent: safe to re-run. Uses IF NOT EXISTS.
-- Non-destructive: no existing data is touched.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. outbound_sequence_templates — campaign-level sequence container
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outbound_sequence_templates (
  id                  SERIAL PRIMARY KEY,
  campaign_id         INTEGER REFERENCES outbound_campaigns(id),

  -- Inputs that drove generation — kept for audit + regeneration
  name                TEXT NOT NULL,
  icp                 TEXT,
  pain_point          TEXT,
  offer               TEXT,
  sender_persona      TEXT,
  tone                VARCHAR(30) DEFAULT 'direct',

  -- Multi-agent generation metadata
  generation_model    VARCHAR(60),
  generation_run_id   TEXT,
  agent_brief         JSONB,
  qa_report           JSONB,

  status              VARCHAR(20) NOT NULL DEFAULT 'draft',
  -- draft | active | archived

  created_by          INTEGER,
  created_at          TIMESTAMP DEFAULT now(),
  updated_at          TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outbound_sequence_templates_campaign_idx
  ON outbound_sequence_templates(campaign_id);

-- ─────────────────────────────────────────────────────────────
-- 2. outbound_sequence_steps — per-step content
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outbound_sequence_steps (
  id                  SERIAL PRIMARY KEY,
  template_id         INTEGER NOT NULL
                      REFERENCES outbound_sequence_templates(id) ON DELETE CASCADE,

  step_number         INTEGER NOT NULL,
  delay_days          INTEGER NOT NULL DEFAULT 0,

  -- JSONB array of subject-line variants for A/B testing
  subject_variants    JSONB NOT NULL,
  body                TEXT NOT NULL,

  -- Editor / QA outputs preserved for audit + iteration
  editor_notes        TEXT,
  qa_warnings         JSONB,

  created_at          TIMESTAMP DEFAULT now(),
  updated_at          TIMESTAMP DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS outbound_sequence_steps_template_step_idx
  ON outbound_sequence_steps(template_id, step_number);

COMMIT;

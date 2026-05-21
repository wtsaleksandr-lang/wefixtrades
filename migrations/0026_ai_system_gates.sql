-- W-AX-1: system-wide AI gate registry
-- One row per AI surface across the product; each has its own kill switch
-- and monthly spend cap. See server/services/aiSystemGate.ts + aiSurfaces.ts.

CREATE TABLE IF NOT EXISTS ai_system_gates (
  surface              VARCHAR(40) PRIMARY KEY,
  kill_switch_on       BOOLEAN NOT NULL DEFAULT FALSE,
  monthly_budget_cents INTEGER,
  monthly_spent_cents  INTEGER NOT NULL DEFAULT 0,
  monthly_reset_at     TIMESTAMP DEFAULT NOW(),
  alert_threshold_pct  INTEGER NOT NULL DEFAULT 80,
  alerts_sent          JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at           TIMESTAMP DEFAULT NOW(),
  created_at           TIMESTAMP DEFAULT NOW()
);

-- Seed every known surface with a reasonable default budget. Surfaces
-- added to aiSurfaces.ts later will lazy-create on first gate check.
INSERT INTO ai_system_gates (surface, monthly_budget_cents) VALUES
  ('contentflow',         5000),   -- $50
  ('socialsync',          2000),   -- $20
  ('mapguard',            2000),
  ('reputation',          2000),
  ('reply_intelligence',  1000),
  ('onboarding',           500),
  ('inbound_classifier',   500),
  ('prospect_enrichment', 1000),
  ('supplier_dispatch',    500),
  ('adflow_reports',       500),
  ('sitelaunch',          1000),
  ('quotequick',          5000),
  ('business_operator',   5000)
ON CONFLICT (surface) DO NOTHING;

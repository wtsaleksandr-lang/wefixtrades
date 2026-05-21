-- Wave W-AV-1 — Business Operator AI v1.
--
-- Three tables back the autonomous Business Operator AI:
--
--   1. admin_ai_actions          — one row per detected signal.
--      Stores AI reasoning, proposed action, status, and review/exec
--      timestamps. Dedup index ensures the same (playbook, signal_id)
--      only gets one pending row at a time.
--
--   2. admin_ai_playbook_state   — one row per playbook (e.g.
--      'stuck_submissions'). Tracks the trust ladder: number of consecutive
--      admin approvals, whether auto-execute is enabled, and a rolling
--      monthly cost counter for per-playbook spend visibility.
--
--   3. admin_ai_budget           — one row per calendar month ('YYYY-MM').
--      Hard cap is $50/mo (5000 cents) by default; Claude calls are
--      skipped once spent_cents >= cap_cents. Alerts at 80% and 100%.

CREATE TABLE IF NOT EXISTS "admin_ai_actions" (
  "id"               text PRIMARY KEY,
  "playbook"         text NOT NULL,
  "signal_id"        text NOT NULL,
  "status"           text NOT NULL DEFAULT 'pending',
  "severity"         text NOT NULL DEFAULT 'medium',
  "summary"          text NOT NULL,
  "detail"           jsonb NOT NULL,
  "proposed_action"  jsonb,
  "ai_reasoning"     text,
  "ai_model"         text,
  "ai_input_tokens"  integer DEFAULT 0,
  "ai_output_tokens" integer DEFAULT 0,
  "ai_cost_cents"    integer DEFAULT 0,
  "ai_attempt_count" integer DEFAULT 0,
  "ai_last_error"    text,
  "reviewed_by"      integer REFERENCES "users"("id"),
  "reviewed_at"      timestamp,
  "executed_at"      timestamp,
  "created_at"       timestamp DEFAULT now() NOT NULL,
  "updated_at"       timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "admin_ai_actions_dedup_idx"
  ON "admin_ai_actions" ("playbook", "signal_id")
  WHERE "status" = 'pending';

CREATE INDEX IF NOT EXISTS "admin_ai_actions_status_idx"
  ON "admin_ai_actions" ("status", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "admin_ai_playbook_state" (
  "playbook"                text PRIMARY KEY,
  "auto_enabled"            boolean DEFAULT false,
  "consecutive_approvals"   integer DEFAULT 0,
  "last_auto_executed_at"   timestamp,
  "last_admin_action_at"    timestamp,
  "monthly_cost_cents"      integer DEFAULT 0,
  "monthly_cost_reset_at"   timestamp DEFAULT now() NOT NULL,
  "created_at"              timestamp DEFAULT now() NOT NULL,
  "updated_at"              timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "admin_ai_budget" (
  "id"           serial PRIMARY KEY,
  "month"        text UNIQUE NOT NULL,
  "spent_cents"  integer DEFAULT 0,
  "cap_cents"    integer DEFAULT 5000,
  "alerts_sent"  jsonb DEFAULT '[]'::jsonb,
  "created_at"   timestamp DEFAULT now() NOT NULL,
  "updated_at"   timestamp DEFAULT now() NOT NULL
);

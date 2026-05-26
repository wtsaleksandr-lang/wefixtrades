-- 0061_marketing_chat_sessions.sql
--
-- Wave 12A — anonymous marketing chat widget on wefixtrades.com.
--
-- Captures the conversation + lead details so Sales can follow up. The
-- session_id is a client-generated uuid stored in localStorage; we do NOT
-- tie it to an auth session because the widget is anonymous by design.
--
-- Additive, online DDL. Safe to re-run via IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS marketing_chat_sessions (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL UNIQUE,
  messages_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  lead_email TEXT,
  lead_name TEXT,
  lead_phone TEXT,
  /** Best-guess product the widget recommended (mapguard, tradeline, etc.).
   * Updated server-side when the AI emits a COPILOT_CARDS block. */
  recommended_product TEXT,
  /** Best-guess pain bucket the visitor self-identified — feeds analytics. */
  pain_bucket TEXT,
  ip_hash VARCHAR(64),
  user_agent TEXT,
  /** Marketing referrer at first message (utm_*, landing path). */
  landing_path TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  last_active_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_chat_sessions_last_active
  ON marketing_chat_sessions (last_active_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_chat_sessions_lead_email
  ON marketing_chat_sessions (lead_email)
  WHERE lead_email IS NOT NULL;

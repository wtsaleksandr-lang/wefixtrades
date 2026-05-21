-- Wave W-AW-1 — TradeLine voice catalog, per-client assistant settings, and
-- user-facing knowledge base.
--
-- Three new tables:
--   1. tradeline_voices                 — catalog of ElevenLabs voices,
--                                         replaces the static 4-entry
--                                         shared/tradelineVoices.ts registry
--                                         (kept as runtime fallback).
--   2. tradeline_assistant_settings     — per-client voice + greeting + style
--                                         + monthly minute budget cap.
--   3. tradeline_knowledge_base         — per-client KB entries (FAQ, service,
--                                         policy, pricing, doc) — wired into
--                                         the TradeLine system prompt at
--                                         runtime so the AI receptionist
--                                         answers from the client's own KB.

/* ────────── 1. Voice catalog ────────── */
CREATE TABLE IF NOT EXISTS "tradeline_voices" (
  "id"                   text PRIMARY KEY,
  "elevenlabs_voice_id"  text NOT NULL,
  "display_name"         text NOT NULL,
  "description"          text,
  "gender"               text,
  "accent"               text,
  "tags"                 jsonb DEFAULT '[]'::jsonb NOT NULL,
  "sample_audio_url"     text,
  "status"               text DEFAULT 'active' NOT NULL,
  "created_at"           timestamp DEFAULT now() NOT NULL,
  "updated_at"           timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "tradeline_voices_status_idx"
  ON "tradeline_voices" ("status");

/* Seed from the existing static 4-voice registry so existing client
   configs that reference a preset id continue to resolve.            */
INSERT INTO "tradeline_voices"
  ("id", "elevenlabs_voice_id", "display_name", "description", "gender", "accent", "tags", "status")
VALUES
  ('professional-female', '21m00Tcm4TlvDq8ikWAM', 'Professional Female', 'Clear, polished tone. Great for service businesses.', 'female', 'us-en', '["professional","clear"]'::jsonb, 'active'),
  ('professional-male',   'TxGEqnHWrfWFTfGW9XjX', 'Professional Male',   'Confident, reassuring voice. Ideal for trades and contracting.', 'male',   'us-en', '["professional","confident"]'::jsonb, 'active'),
  ('friendly-female',     'EXAVITQu4vr4xnSDxMaL', 'Friendly Female',     'Warm and approachable. Perfect for customer-facing services.',    'female', 'us-en', '["friendly","warm"]'::jsonb,        'active'),
  ('friendly-male',       'pNInz6obpgDQGcFmaJgB', 'Friendly Male',       'Casual and natural. Works well for home services and repairs.',  'male',   'us-en', '["friendly","casual"]'::jsonb,      'active')
ON CONFLICT ("id") DO NOTHING;

/* ────────── 2. Per-client TradeLine assistant settings ────────── */
CREATE TABLE IF NOT EXISTS "tradeline_assistant_settings" (
  "id"                       serial PRIMARY KEY,
  "client_id"                integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "voice_id"                 text REFERENCES "tradeline_voices"("id"),
  "greeting"                 text,
  "response_style"           text,
  "monthly_minute_budget"    integer,
  "monthly_minute_used"      integer DEFAULT 0 NOT NULL,
  "budget_reset_at"          timestamp,
  "auto_disable_on_cap"      boolean DEFAULT true NOT NULL,
  "fallback_voice_id"        text REFERENCES "tradeline_voices"("id"),
  "created_at"               timestamp DEFAULT now() NOT NULL,
  "updated_at"               timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "tradeline_assistant_settings_client_uniq"
  ON "tradeline_assistant_settings" ("client_id");

/* ────────── 3. User-controlled knowledge base ────────── */
CREATE TABLE IF NOT EXISTS "tradeline_knowledge_base" (
  "id"          text PRIMARY KEY,
  "client_id"   integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "kind"        text NOT NULL,
  "title"       text NOT NULL,
  "content"     text NOT NULL,
  "priority"    integer DEFAULT 0 NOT NULL,
  "status"      text DEFAULT 'active' NOT NULL,
  "created_at"  timestamp DEFAULT now() NOT NULL,
  "updated_at"  timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "tradeline_kb_client_idx"
  ON "tradeline_knowledge_base" ("client_id", "status", "priority" DESC);

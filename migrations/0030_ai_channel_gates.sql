-- Wave W-BA-1 — per-channel AI kill switches (Phase 3a runtime emergency net).
--
-- Distinct from `ai_channel_settings` (the older governance config). This
-- table is the runtime emergency net that the founder must have in hand
-- BEFORE autonomous responses go live: one row per customer-facing channel
-- with rich audit metadata (who flipped it, when, why). Default OFF — the
-- founder explicitly enables each channel when ready. Channel handlers must
-- check `aiChannelGateOn(channel)` BEFORE invoking AI. When OFF: email/SMS
-- send the auto-reply fallback, voice routes to voicemail, chat shows an
-- offline notice. See server/services/aiChannelGate.ts.
--
-- Channels seeded:
--   email | sms | voice | chat

CREATE TABLE IF NOT EXISTS "ai_channel_gates" (
  "channel"                 text PRIMARY KEY,
  "enabled"                 boolean NOT NULL DEFAULT false,
  "emergency_disabled_by"   integer REFERENCES "users"("id"),
  "emergency_disabled_at"   timestamp,
  "notes"                   text,
  "updated_at"              timestamp NOT NULL DEFAULT NOW(),
  "updated_by"              integer REFERENCES "users"("id"),
  "created_at"              timestamp NOT NULL DEFAULT NOW()
);

INSERT INTO "ai_channel_gates" ("channel") VALUES
  ('email'),
  ('sms'),
  ('voice'),
  ('chat')
ON CONFLICT ("channel") DO NOTHING;

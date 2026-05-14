-- voicemails: captured caller messages from the mobile softphone inbound
-- flow. The Twilio recording-completed webhook
-- (POST /api/twilio/voicemail/recording-completed) inserts a row
-- synchronously and fires off transcription + summarization async.
-- The mobile app reads /api/mobile/voicemails for the inbox.

CREATE TABLE IF NOT EXISTS voicemails (
  id SERIAL PRIMARY KEY,
  call_sid VARCHAR(50) NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  from_number VARCHAR(32) NOT NULL,
  recording_url TEXT NOT NULL,
  recording_duration INTEGER,
  transcript TEXT,
  summary TEXT,
  sentiment VARCHAR(16),
  acknowledged_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voicemails_user ON voicemails(user_id);
CREATE INDEX IF NOT EXISTS idx_voicemails_created ON voicemails(created_at DESC);

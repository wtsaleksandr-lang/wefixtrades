-- mobile_call_records: log of Twilio Voice calls placed/received via the
-- mobile softphone. Populated by /api/twilio/voice/status webhook,
-- queried by /api/mobile/calls for the history list.

CREATE TABLE IF NOT EXISTS mobile_call_records (
  id SERIAL PRIMARY KEY,
  call_sid VARCHAR(50) NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  direction VARCHAR(16) NOT NULL,
  from_number VARCHAR(32),
  to_number VARCHAR(32),
  status VARCHAR(24) NOT NULL,
  duration_sec INTEGER,
  notes TEXT,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mobile_call_records_user ON mobile_call_records(user_id);
CREATE INDEX IF NOT EXISTS idx_mobile_call_records_started ON mobile_call_records(started_at);

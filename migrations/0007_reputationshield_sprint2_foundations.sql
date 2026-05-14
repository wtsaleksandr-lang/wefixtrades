-- Sprint 2-3 foundations for ReputationShield:
--   1. review_reply_post_queue — async retry queue + dead-letter for
--      failed Google replies (and future multi-platform replies)
--   2. google_business_locations — multi-location support so a single
--      client can manage reviews across multiple Google Business Profile
--      locations (e.g. trade businesses with 3+ branches)

-- ─── 1. Reply-post retry queue ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS review_reply_post_queue (
  id                  SERIAL PRIMARY KEY,
  monitored_review_id INTEGER NOT NULL REFERENCES monitored_reviews(id) ON DELETE CASCADE,
  client_id           INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform            VARCHAR(30) NOT NULL DEFAULT 'google',
  reply_text          TEXT NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- pending | in_flight | succeeded | failed | dead_letter
  attempts            INTEGER NOT NULL DEFAULT 0,
  max_attempts        INTEGER NOT NULL DEFAULT 5,
  next_attempt_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  last_error          TEXT,
  last_attempt_at     TIMESTAMP,
  succeeded_at        TIMESTAMP,
  metadata            JSONB,
  created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reply_queue_due
  ON review_reply_post_queue(next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_reply_queue_client
  ON review_reply_post_queue(client_id, status);

CREATE INDEX IF NOT EXISTS idx_reply_queue_dead_letter
  ON review_reply_post_queue(client_id) WHERE status = 'dead_letter';


-- ─── 2. Multi-location support ────────────────────────────────────
-- clients.google_place_id stays as the "primary" location; this table
-- adds the additional locations. A trigger or app-layer copy keeps the
-- primary row in clients.google_place_id consistent for clients still
-- on single-location code paths.

CREATE TABLE IF NOT EXISTS google_business_locations (
  id                  SERIAL PRIMARY KEY,
  client_id           INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  place_id            TEXT NOT NULL,
  location_name       TEXT NOT NULL,
  address             TEXT,
  is_primary          BOOLEAN NOT NULL DEFAULT FALSE,
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  metadata            JSONB,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- A given place_id can only exist once per client.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gbl_client_place
  ON google_business_locations(client_id, place_id);

-- Fast lookup: "give me every location to monitor for this client".
CREATE INDEX IF NOT EXISTS idx_gbl_client_enabled
  ON google_business_locations(client_id) WHERE enabled = TRUE;

-- A client should only have one primary. Enforced via partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gbl_one_primary_per_client
  ON google_business_locations(client_id) WHERE is_primary = TRUE;

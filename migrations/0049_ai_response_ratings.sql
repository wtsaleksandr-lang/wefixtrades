-- 0049_ai_response_ratings.sql
--
-- Message-level AI feedback loop (👍 / 👎 + optional comment) for any
-- AI response surfaced in the admin UI. Drives the conversation→KB
-- pipeline: 👎-with-comment rows are swept nightly and converted into
-- tradeline_learning_candidates (kind='conversation') so admins can
-- review + promote into the niche template knowledge base.
--
-- Flagged by the PR #669 AI infrastructure audit as missing — the
-- candidate pipeline already had the `kind='conversation'` branch
-- scaffolded but no source of ratings to feed it.
--
-- One rating per (rated_by, response_id) — the route upserts on that
-- composite uniqueness so admins can flip 👍↔👎 or edit their comment.
--
-- Additive only: no existing tables touched.

CREATE TABLE IF NOT EXISTS ai_response_ratings (
  id           BIGSERIAL PRIMARY KEY,
  -- The AI response identifier. Free-form text because surfaces use
  -- different ID shapes: chat_memory message_id (string), vapi call
  -- segment id, admin_ai_actions.id (uuid), or a generic external_id.
  response_id  TEXT NOT NULL,
  -- Matches AI_SURFACES in server/services/aiSurfaces.ts. Not enforced
  -- with a FK because surfaces is a code-side enum.
  surface      TEXT NOT NULL,
  -- -1 (thumbs down) or +1 (thumbs up). Smallint keeps room for a
  -- future neutral=0 or a richer scale without a migration.
  rating       SMALLINT NOT NULL CHECK (rating IN (-1, 1)),
  comment      TEXT,
  rated_by     INTEGER NOT NULL,
  rated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  -- Optional — for per-client analytics on TradeLine / QuoteQuick
  -- surfaces where the response is scoped to a specific client.
  client_id    INTEGER
);

-- One rating per admin per response (upsert key for POST endpoint).
CREATE UNIQUE INDEX IF NOT EXISTS ai_response_ratings_rater_response_idx
  ON ai_response_ratings(rated_by, response_id);

-- Per-surface analytics + the nightly sweep (recent + surface filter).
CREATE INDEX IF NOT EXISTS ai_response_ratings_surface_rated_at_idx
  ON ai_response_ratings(surface, rated_at DESC);

-- Per-client analytics on the client detail page.
CREATE INDEX IF NOT EXISTS ai_response_ratings_client_idx
  ON ai_response_ratings(client_id, rated_at DESC)
  WHERE client_id IS NOT NULL;

-- Sweep query: thumbs-down + has comment in last 24h.
CREATE INDEX IF NOT EXISTS ai_response_ratings_negative_recent_idx
  ON ai_response_ratings(rated_at DESC)
  WHERE rating = -1 AND comment IS NOT NULL;

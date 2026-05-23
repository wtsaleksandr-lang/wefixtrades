-- 0041_review_funnel_callback.sql
--
-- Free-tools batch 2:
--   * Review-link funnel — /r/:slug star-rating gate; ≥threshold routes to
--     external review site (Google/Facebook/Yelp), below threshold captures
--     private feedback. Configurable per client.
--   * Callback Form widget — public lead capture with anti-spam + per-client
--     config + lead inbox.
--
-- All FKs target clients(id) (not users(id)) because the embeddable widgets
-- + funnel pages resolve a widget_token / slug back to a client row — this
-- mirrors batch 1 (FAQ / hours / badges).

-- ── Review funnel ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS review_link_configs (
  client_id    INTEGER PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  slug         TEXT NOT NULL UNIQUE,
  google_url   TEXT,
  facebook_url TEXT,
  yelp_url     TEXT,
  -- Stars at or above this rating route to an external review site; below
  -- this routes to the private feedback form. 1-5; default 4 (industry norm).
  threshold    INTEGER NOT NULL DEFAULT 4,
  heading      TEXT,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS review_link_slug_idx ON review_link_configs(slug);

CREATE TABLE IF NOT EXISTS review_funnel_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL,
  -- 1-5 if a star was clicked; NULL if the visitor just landed.
  rating      INTEGER,
  -- 'google' | 'facebook' | 'yelp' | 'feedback' | NULL (landing only)
  routed_to   TEXT,
  feedback    TEXT,
  visitor_ip  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS review_funnel_client_idx ON review_funnel_events(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS review_funnel_slug_idx ON review_funnel_events(slug, created_at DESC);

-- ── Callback widget ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS callback_widget_configs (
  client_id   INTEGER PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  heading     TEXT DEFAULT 'Request a callback',
  cta_label   TEXT DEFAULT 'Send request',
  -- Which fields the embed shows. Phone is always on (it's the lead).
  fields_json JSONB NOT NULL DEFAULT '{"name":true,"phone":true,"message":true,"best_time":true}'::jsonb,
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS callback_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  message     TEXT,
  best_time   TEXT,
  source_url  TEXT,
  visitor_ip  TEXT,
  -- new | contacted | spam
  status      TEXT NOT NULL DEFAULT 'new',
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS callback_requests_client_idx ON callback_requests(client_id, created_at DESC);

-- Sprint 3: competitor tracking (Premium tier)
--
-- A client lists 1-5 competitor place IDs; a daily cron snapshots their
-- public review stats via Outscraper (already wired). Trend graphs in
-- the Premium dashboard read from reputation_competitor_snapshots.
--
-- Widget snapshots were considered here but dropped — the existing
-- widgetRoutes endpoint (with 5-min in-memory cache) is sufficient for
-- current traffic levels. If we hit scale issues we'll add a
-- snapshot table at that point.

CREATE TABLE IF NOT EXISTS reputation_competitors (
  id              SERIAL PRIMARY KEY,
  client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  place_id        TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  metadata        JSONB,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_competitors_client_place
  ON reputation_competitors(client_id, place_id);

CREATE INDEX IF NOT EXISTS idx_competitors_client_enabled
  ON reputation_competitors(client_id) WHERE enabled = TRUE;


-- Daily snapshots — drives trend graphs in the Premium dashboard.
CREATE TABLE IF NOT EXISTS reputation_competitor_snapshots (
  id              SERIAL PRIMARY KEY,
  competitor_id   INTEGER NOT NULL REFERENCES reputation_competitors(id) ON DELETE CASCADE,
  client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  snapshot_date   DATE NOT NULL,
  total_reviews   INTEGER NOT NULL DEFAULT 0,
  average_rating  NUMERIC(3,2),
  reviews_30d     INTEGER,
  metadata        JSONB,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_competitor_snapshot_daily
  ON reputation_competitor_snapshots(competitor_id, snapshot_date);

CREATE INDEX IF NOT EXISTS idx_competitor_snapshots_client
  ON reputation_competitor_snapshots(client_id, snapshot_date DESC);

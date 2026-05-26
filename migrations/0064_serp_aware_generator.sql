-- 0064_serp_aware_generator.sql
--
-- Wave 21 — SerpAwareGenerator caches (Surfer-style SEO awareness bundled
-- free into every ContentFlow article).
--
-- Both tables are write-rarely / read-often caches with a 1-week TTL.
-- They let the brain reuse SERP analysis across articles without re-fetching
-- top-10 competitor pages each time.
--
-- Safe to re-run (IF NOT EXISTS everywhere).

CREATE TABLE IF NOT EXISTS serp_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  location TEXT,
  brief_json JSONB NOT NULL,
  built_at TIMESTAMP NOT NULL DEFAULT now(),
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_serp_briefs_keyword
  ON serp_briefs (keyword);
CREATE INDEX IF NOT EXISTS idx_serp_briefs_expires_at
  ON serp_briefs (expires_at);

CREATE TABLE IF NOT EXISTS topical_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_keyword TEXT NOT NULL,
  location TEXT,
  industry_niche TEXT,
  map_json JSONB NOT NULL,
  built_at TIMESTAMP NOT NULL DEFAULT now(),
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_topical_maps_seed_keyword
  ON topical_maps (seed_keyword);
CREATE INDEX IF NOT EXISTS idx_topical_maps_expires_at
  ON topical_maps (expires_at);

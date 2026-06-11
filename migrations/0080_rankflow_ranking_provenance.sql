-- 0080_rankflow_ranking_provenance.sql
--
-- Lane H: Serper.dev becomes the PRIMARY rank-data source for RankFlow
-- (real SERP position checks), with Google Search Console demoted to
-- optional enrichment (impressions / clicks / CTR when the client has a
-- GSC connection). Each rankflow_rankings row now records WHERE the
-- position came from so the portal dashboard can label provenance.
--
-- All columns are additive + nullable — no backfill, no data loss.
-- Historical rows keep NULL source (they predate provenance tracking).

ALTER TABLE rankflow_rankings
  ADD COLUMN IF NOT EXISTS source              VARCHAR(20),  -- 'serp_api' | 'search_console' | 'scrape'
  ADD COLUMN IF NOT EXISTS url_found           TEXT,         -- ranking URL found in the SERP
  ADD COLUMN IF NOT EXISTS local_pack_position INTEGER,      -- Google local-pack / map-pack position (Serper only)
  ADD COLUMN IF NOT EXISTS impressions         INTEGER,      -- GSC enrichment
  ADD COLUMN IF NOT EXISTS clicks              INTEGER,      -- GSC enrichment
  ADD COLUMN IF NOT EXISTS ctr                 NUMERIC;      -- GSC enrichment (0-1 fraction)

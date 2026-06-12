-- 0086_seo_content_engine.sql
--
-- WeFixTrades OWNED-DOMAIN SEO content engine — foundational schema (WP-0 + WP-1).
--
-- This is the OPPOSITE of the customer-facing ContentFlow / RankFlow engine:
-- pages publish on wefixtrades.com under a real author entity with full
-- E-E-A-T attribution. No detection-evasion tables here. See
-- plans/seo-content-channel-design.md.
--
-- Three tables:
--   1. seo_content_pages    — durable, indexable, sitemap-feeding published-page
--                             store. Pre-publish drafting reuses content_drafts
--                             (surface='wfx_seo'); on publish the approved draft
--                             is copied here. Only status='published' rows are
--                             publicly rendered + emitted in the sitemap.
--   2. seo_keyword_plan     — editorial + programmatic [job]x[city] topic queue.
--                             unique(target_keyword, job_type, city) is the dedup
--                             key. job_type/city default '' (not NULL) so the
--                             unique index dedupes "no job/city" rows.
--   3. seo_engine_settings  — singleton (id=1) DB kill switch. With kill_switch
--                             ON the whole engine halts regardless of the
--                             SEO_ENGINE_ENABLED env flag (seoEngineGate.ts).
--
-- Additive only: new tables + indexes + one seeded singleton row. Every
-- statement is IF NOT EXISTS / ON CONFLICT DO NOTHING, so this whole file is
-- safe to re-run on every boot (bootstrapMigrations applies it once; the
-- schema sentinel may re-apply it). No DROP / RENAME / TRUNCATE / unguarded
-- DELETE.

CREATE TABLE IF NOT EXISTS seo_content_pages (
  id                SERIAL PRIMARY KEY,
  slug              VARCHAR(200) NOT NULL,
  title             TEXT NOT NULL,
  meta_description  TEXT,
  excerpt           TEXT,
  content           TEXT NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'draft',
  jsonld_type       VARCHAR(40) NOT NULL DEFAULT 'Article',
  author_entity     VARCHAR(120) NOT NULL DEFAULT 'WeFixTrades Editorial',
  canonical         TEXT,
  original_data     JSONB,
  unique_data_score INTEGER,
  surface           VARCHAR(20) NOT NULL DEFAULT 'wfx_seo',
  source_draft_id   INTEGER,
  published_at      TIMESTAMP,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS seo_content_pages_slug_uidx
  ON seo_content_pages (slug);
CREATE INDEX IF NOT EXISTS seo_content_pages_status_surface_idx
  ON seo_content_pages (status, surface);

CREATE TABLE IF NOT EXISTS seo_keyword_plan (
  id               SERIAL PRIMARY KEY,
  target_keyword   TEXT NOT NULL,
  search_intent    VARCHAR(10) NOT NULL DEFAULT 'mid',
  job_type         VARCHAR(80) NOT NULL DEFAULT '',
  city             VARCHAR(80) NOT NULL DEFAULT '',
  status           VARCHAR(20) NOT NULL DEFAULT 'planned',
  skip_reason      TEXT,
  assigned_page_id INTEGER,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS seo_keyword_plan_keyword_job_city_uidx
  ON seo_keyword_plan (target_keyword, job_type, city);
CREATE INDEX IF NOT EXISTS seo_keyword_plan_status_idx
  ON seo_keyword_plan (status);

CREATE TABLE IF NOT EXISTS seo_engine_settings (
  id          INTEGER PRIMARY KEY,
  kill_switch BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at  TIMESTAMP DEFAULT NOW(),
  updated_by  INTEGER
);

-- Seed the singleton row (id=1). kill_switch defaults FALSE; the engine is
-- still inert overall because SEO_ENGINE_ENABLED defaults off.
INSERT INTO seo_engine_settings (id, kill_switch)
  VALUES (1, FALSE)
  ON CONFLICT (id) DO NOTHING;

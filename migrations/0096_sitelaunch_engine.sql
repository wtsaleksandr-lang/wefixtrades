-- 0096_sitelaunch_engine.sql
--
-- SiteLaunch — the generated-website store (phase 1: generator + renderer).
--
-- Before this migration the SiteLaunch product had NO schema. A customer paid
-- $1,197 and the system produced an alert email plus a CRM task; the picked
-- "template id" lived as a string in client_service.metadata.config and
-- nothing consumed it. These two tables are the persisted page/section
-- document model the renderer reads.
--
--   sitelaunch_sites  — one row per customer site. `settings` holds the
--                       site-level half of the document (brand, business
--                       facts, footer). Lifecycle in `status`; a site never
--                       reaches 'published' without an explicit admin action.
--   sitelaunch_pages  — one row per page, ordered by sort_order. `sections`
--                       is the ordered section array validated by
--                       shared/sitelaunch/document.ts.
--
-- HONEST DOMAIN COLUMNS. `hosting_mode` defaults to 'not_provisioned' and
-- `domain_status` to 'not_started'. Phase 1 provisions NOTHING — no
-- Cloudflare zone, no DNS record, no certificate. There is deliberately no
-- column the app can flip to claim a certificate exists; the product area
-- already shipped that bug once (server/routes/domainRoutes.ts issue-ssl set
-- ssl_status='active' on a setTimeout), and it is fixed in the same PR as
-- this migration.
--
-- Additive only: two new tables + four indexes. Every statement is
-- IF NOT EXISTS, so this file is safe to re-run on every boot
-- (bootstrapMigrations applies it once; the schema sentinel may re-apply).
-- No DROP / RENAME / TRUNCATE / DELETE anywhere.

CREATE TABLE IF NOT EXISTS sitelaunch_sites (
  id                    SERIAL PRIMARY KEY,
  client_id             INTEGER,
  client_service_id     INTEGER,
  slug                  VARCHAR(80) NOT NULL,
  business_name         VARCHAR(160) NOT NULL,
  theme_id              VARCHAR(40) NOT NULL DEFAULT 'trade-classic',
  status                VARCHAR(20) NOT NULL DEFAULT 'draft',
  settings              JSONB NOT NULL DEFAULT '{}'::jsonb,
  preview_token         VARCHAR(64) NOT NULL,
  hosting_mode          VARCHAR(30) NOT NULL DEFAULT 'not_provisioned',
  custom_domain         VARCHAR(253),
  domain_status         VARCHAR(30) NOT NULL DEFAULT 'not_started',
  domain_status_note    TEXT,
  published_at          TIMESTAMP,
  approved_at           TIMESTAMP,
  approved_by           INTEGER,
  last_generated_at     TIMESTAMP,
  last_generation_error TEXT,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS sitelaunch_sites_slug_key
  ON sitelaunch_sites (slug);
CREATE UNIQUE INDEX IF NOT EXISTS sitelaunch_sites_preview_token_key
  ON sitelaunch_sites (preview_token);
CREATE INDEX IF NOT EXISTS sitelaunch_sites_client_idx
  ON sitelaunch_sites (client_id);
CREATE INDEX IF NOT EXISTS sitelaunch_sites_status_idx
  ON sitelaunch_sites (status);

CREATE TABLE IF NOT EXISTS sitelaunch_pages (
  id               SERIAL PRIMARY KEY,
  site_id          INTEGER NOT NULL,
  slug             VARCHAR(80) NOT NULL DEFAULT '',
  title            VARCHAR(200) NOT NULL,
  nav_label        VARCHAR(60) NOT NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  show_in_nav      BOOLEAN NOT NULL DEFAULT TRUE,
  meta_title       VARCHAR(200) NOT NULL DEFAULT '',
  meta_description VARCHAR(400) NOT NULL DEFAULT '',
  sections         JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS sitelaunch_pages_site_slug_key
  ON sitelaunch_pages (site_id, slug);
CREATE INDEX IF NOT EXISTS sitelaunch_pages_site_order_idx
  ON sitelaunch_pages (site_id, sort_order);

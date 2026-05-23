-- Migration 0037 — Outbound schema backfill + outreach sequence templates.
--
-- Background:
--   The outbound lead-management schema (prospects, campaigns, pipeline,
--   blacklists) ships as Drizzle TypeScript at shared/schemas/outbound.ts
--   but a corresponding SQL file was never committed. Dev got the tables
--   via `drizzle-kit push`; prod got them via bootstrapMigrations()
--   running each migrations/*.sql on boot. With no SQL file for these
--   tables, prod and dev can drift any time the schema changes — and
--   bootstrapMigrations has no way to apply additions.
--
--   This file reverse-engineers the current shared/schemas/outbound.ts
--   into idempotent DDL and also lands the NEW outreach_sequences /
--   outreach_sequence_steps tables for AI sequence-template CRUD.
--
-- Idempotency:
--   Everything uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT
--   EXISTS so this is safe to apply against a DB that already holds
--   the V1 tables (which prod and dev both do).
--
-- Non-destructive: no DROP, no ALTER COLUMN type change, no data move.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- IMPORT BATCHES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import_batches (
  id              SERIAL PRIMARY KEY,
  source          VARCHAR(50) NOT NULL DEFAULT 'outscraper_csv',
  filename        TEXT,
  total_rows      INTEGER NOT NULL DEFAULT 0,
  imported        INTEGER NOT NULL DEFAULT 0,
  skipped_dupes   INTEGER NOT NULL DEFAULT 0,
  failed          INTEGER NOT NULL DEFAULT 0,
  status          VARCHAR(20) NOT NULL DEFAULT 'processing',
  imported_by     INTEGER,
  metadata        JSONB,
  created_at      TIMESTAMP DEFAULT NOW(),
  completed_at    TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────
-- PROSPECTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prospects (
  id                       SERIAL PRIMARY KEY,
  import_batch_id          INTEGER REFERENCES import_batches(id),

  business_name            TEXT NOT NULL,
  primary_email            TEXT,
  primary_phone            TEXT,
  website_domain           TEXT,
  website_url              TEXT,

  owner_name               TEXT,
  contact_name             TEXT,

  trade_category           VARCHAR(100),
  city                     VARCHAR(100),
  state                    VARCHAR(50),
  country                  VARCHAR(50) DEFAULT 'US',
  address                  TEXT,
  zip_code                 VARCHAR(20),
  google_place_id          VARCHAR(200),
  google_maps_url          TEXT,
  google_rating            DECIMAL(3,1),
  google_review_count      INTEGER,

  source                   VARCHAR(50) NOT NULL DEFAULT 'outscraper',
  source_external_id       TEXT,
  raw_data                 JSONB,

  dedupe_fingerprint       VARCHAR(64),
  contact_confidence       VARCHAR(10) DEFAULT 'none',

  target_offer             VARCHAR(30),
  priority_score           INTEGER,

  status                   VARCHAR(30) NOT NULL DEFAULT 'new',

  reviewed_by              INTEGER,
  reviewed_at              TIMESTAMP,
  review_notes             TEXT,

  do_not_contact           BOOLEAN NOT NULL DEFAULT FALSE,
  dnc_reason               TEXT,

  created_at               TIMESTAMP DEFAULT NOW(),
  updated_at               TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS prospects_domain_idx       ON prospects(website_domain);
CREATE INDEX        IF NOT EXISTS prospects_fingerprint_idx  ON prospects(dedupe_fingerprint);

-- ─────────────────────────────────────────────────────────────
-- PROSPECT ENRICHMENT
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prospect_enrichment (
  id                          SERIAL PRIMARY KEY,
  prospect_id                 INTEGER NOT NULL REFERENCES prospects(id),

  has_website                 BOOLEAN,
  website_quality_score       INTEGER,
  has_quote_tool              BOOLEAN,
  likely_owner_operator       BOOLEAN,

  quality_score               INTEGER,
  ai_personalization_line     TEXT,
  ai_notes                    TEXT,

  ai_reason_to_target         TEXT,
  ai_first_line               TEXT,
  ai_offer_angle              TEXT,
  ai_cta_variant              TEXT,

  employee_count_estimate     VARCHAR(20),
  years_in_business           INTEGER,
  social_presence_score       INTEGER,

  enrichment_source           VARCHAR(30) DEFAULT 'heuristic',
  enriched_at                 TIMESTAMP,
  created_at                  TIMESTAMP DEFAULT NOW(),
  updated_at                  TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- OUTBOUND CAMPAIGNS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outbound_campaigns (
  id                       SERIAL PRIMARY KEY,
  name                     TEXT NOT NULL,
  description              TEXT,

  platform                 VARCHAR(30) NOT NULL DEFAULT 'instantly',
  external_campaign_id     TEXT,
  platform_status          VARCHAR(30),

  status                   VARCHAR(30) NOT NULL DEFAULT 'active',

  target_trade             VARCHAR(100),
  target_region            VARCHAR(200),
  sender_email             TEXT,

  daily_send_limit         INTEGER NOT NULL DEFAULT 40,
  hourly_send_limit        INTEGER NOT NULL DEFAULT 10,

  created_by               INTEGER,
  metadata                 JSONB,
  created_at               TIMESTAMP DEFAULT NOW(),
  updated_at               TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- CAMPAIGN PROSPECTS (junction)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_prospects (
  id                       SERIAL PRIMARY KEY,
  campaign_id              INTEGER NOT NULL REFERENCES outbound_campaigns(id),
  prospect_id              INTEGER NOT NULL REFERENCES prospects(id),

  external_lead_id         TEXT,
  sync_status              VARCHAR(30) NOT NULL DEFAULT 'pending',

  outreach_status          VARCHAR(30) NOT NULL DEFAULT 'queued',

  reply_sentiment          VARCHAR(20),
  reply_type               VARCHAR(20),
  reply_intent             VARCHAR(30),
  ai_next_action           TEXT,

  emails_sent              INTEGER NOT NULL DEFAULT 0,
  last_email_sent_at       TIMESTAMP,
  last_replied_at          TIMESTAMP,
  last_synced_at           TIMESTAMP,

  last_contacted_at        TIMESTAMP,
  next_retry_at            TIMESTAMP,
  retry_count              INTEGER NOT NULL DEFAULT 0,

  assigned_by              INTEGER,
  assigned_at              TIMESTAMP DEFAULT NOW(),
  metadata                 JSONB,
  created_at               TIMESTAMP DEFAULT NOW(),
  updated_at               TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- PROSPECT EVENTS — append-only audit
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prospect_events (
  id                       SERIAL PRIMARY KEY,
  prospect_id              INTEGER NOT NULL REFERENCES prospects(id),
  campaign_prospect_id     INTEGER REFERENCES campaign_prospects(id),

  event_type               VARCHAR(50) NOT NULL,
  actor_type               VARCHAR(20) NOT NULL DEFAULT 'system',
  actor_id                 INTEGER,
  actor_name               TEXT,

  summary                  TEXT,
  metadata                 JSONB,
  created_at               TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- SALES OPPORTUNITIES — pipeline
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_opportunities (
  id                       SERIAL PRIMARY KEY,
  prospect_id              INTEGER NOT NULL REFERENCES prospects(id),
  campaign_prospect_id     INTEGER REFERENCES campaign_prospects(id),

  stage                    VARCHAR(30) NOT NULL DEFAULT 'positive_reply',

  positive_reply_at        TIMESTAMP,
  booked_call_at           TIMESTAMP,
  trial_started_at         TIMESTAMP,
  paid_at                  TIMESTAMP,
  lost_at                  TIMESTAMP,

  lost_reason              TEXT,
  estimated_value_cents    INTEGER,
  notes                    TEXT,

  owner_id                 INTEGER,
  metadata                 JSONB,
  created_at               TIMESTAMP DEFAULT NOW(),
  updated_at               TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- OUTREACH SEQUENCES — multi-step cold-email copy templates
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outreach_sequences (
  id                       SERIAL PRIMARY KEY,
  campaign_id              INTEGER REFERENCES outbound_campaigns(id),

  name                     TEXT NOT NULL,
  trade_filter             VARCHAR(100),
  region_filter            VARCHAR(200),

  icp                      TEXT,
  pain_point               TEXT,
  offer                    TEXT,
  sender_persona           TEXT,
  tone                     VARCHAR(30) DEFAULT 'direct',

  ai_personalize           BOOLEAN NOT NULL DEFAULT FALSE,

  status                   VARCHAR(20) NOT NULL DEFAULT 'draft',

  owner_id                 INTEGER,
  metadata                 JSONB,
  created_at               TIMESTAMP DEFAULT NOW(),
  updated_at               TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outreach_sequences_campaign_idx ON outreach_sequences(campaign_id);
CREATE INDEX IF NOT EXISTS outreach_sequences_status_idx   ON outreach_sequences(status);

CREATE TABLE IF NOT EXISTS outreach_sequence_steps (
  id                       SERIAL PRIMARY KEY,
  sequence_id              INTEGER NOT NULL
                           REFERENCES outreach_sequences(id) ON DELETE CASCADE,

  order_index              INTEGER NOT NULL,
  delay_days               INTEGER NOT NULL DEFAULT 0,

  subject_template         TEXT NOT NULL,
  body_template            TEXT NOT NULL,
  ai_personalize           BOOLEAN NOT NULL DEFAULT FALSE,

  created_at               TIMESTAMP DEFAULT NOW(),
  updated_at               TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS outreach_sequence_steps_seq_order_idx
  ON outreach_sequence_steps(sequence_id, order_index);

-- ─────────────────────────────────────────────────────────────
-- BLACKLISTS — three tables for O(1) lookup
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outbound_blocked_domains (
  id          SERIAL PRIMARY KEY,
  domain      VARCHAR(253) NOT NULL UNIQUE,
  reason      TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outbound_blocked_emails (
  id          SERIAL PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  reason      TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outbound_blocked_phones (
  id          SERIAL PRIMARY KEY,
  phone       VARCHAR(30) NOT NULL UNIQUE,
  reason      TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

COMMIT;

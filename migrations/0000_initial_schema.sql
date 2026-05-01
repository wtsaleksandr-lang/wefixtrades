-- Initial Schema Migration
-- ============================================================================
--
-- This migration documents the full database schema as of 2026-05-01.
-- The schema was originally created via `drizzle-kit push` (db:push) and
-- is maintained by Drizzle ORM schema definitions in shared/schemas/*.ts.
--
-- This file is for documentation/audit purposes. On a fresh database, run
-- `npm run db:push` to create all tables (Drizzle will reconcile the schema).
--
-- Tables are listed below in dependency order (referenced tables first).
-- ============================================================================

BEGIN;

-- ─── Sessions (managed by connect-pg-simple) ────────────────────────────────
CREATE TABLE IF NOT EXISTS session (
  sid        VARCHAR PRIMARY KEY NOT NULL,
  sess       JSON NOT NULL,
  expire     TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session (expire);

-- ─── Users ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  name           TEXT,
  role           TEXT NOT NULL DEFAULT 'client',
  totp_secret    TEXT,
  totp_enabled   BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMP DEFAULT NOW()
);

-- ─── Password Reset Tokens ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  token       VARCHAR(64) NOT NULL UNIQUE,
  expires_at  TIMESTAMP NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─── Calculators ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calculators (
  id                     SERIAL PRIMARY KEY,
  user_id                INTEGER REFERENCES users(id),
  slug                   VARCHAR(255) NOT NULL UNIQUE,
  business_name          TEXT NOT NULL,
  trade_type             TEXT NOT NULL,
  tagline                TEXT,
  logo_url               TEXT,
  owner_email            TEXT,
  owner_phone            TEXT,
  website_url            TEXT,
  primary_color          VARCHAR(20) DEFAULT '#6366f1',
  cta_button_text        TEXT DEFAULT 'Get My Free Quote',
  lead_thank_you_message TEXT DEFAULT 'Thanks! We''ll be in touch soon.',
  pricing_config         JSONB NOT NULL,
  theme_overrides        JSONB,
  calculator_settings    JSONB,
  edit_token             VARCHAR(255) NOT NULL,
  token_expires_at       TIMESTAMP NOT NULL,
  is_duplicated          BOOLEAN DEFAULT FALSE,
  total_views            INTEGER DEFAULT 0,
  show_powered_by_badge  BOOLEAN DEFAULT TRUE,
  plan_tier              TEXT DEFAULT 'free',
  created_at             TIMESTAMP DEFAULT NOW()
);

-- ─── Leads ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id                    SERIAL PRIMARY KEY,
  calculator_id         INTEGER NOT NULL REFERENCES calculators(id),
  name                  TEXT,
  email                 TEXT,
  phone                 TEXT,
  company               TEXT,
  quote_amount          INTEGER,
  answers               JSONB,
  status                VARCHAR(20) NOT NULL DEFAULT 'new',
  sms_consent           BOOLEAN DEFAULT FALSE,
  consent_timestamp     TIMESTAMP,
  consent_text_version  VARCHAR(50),
  ai_paused             BOOLEAN DEFAULT FALSE,
  created_date          TIMESTAMP DEFAULT NOW()
);

-- ─── Notification Queue ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_queue (
  id              SERIAL PRIMARY KEY,
  calculator_id   INTEGER NOT NULL REFERENCES calculators(id),
  lead_id         INTEGER NOT NULL REFERENCES leads(id),
  type            VARCHAR(20) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts        INTEGER DEFAULT 0,
  max_attempts    INTEGER DEFAULT 3,
  last_error      TEXT,
  payload         JSONB,
  created_at      TIMESTAMP DEFAULT NOW(),
  processed_at    TIMESTAMP
);

-- ─── Followup Jobs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS followup_jobs (
  id              SERIAL PRIMARY KEY,
  lead_id         INTEGER NOT NULL REFERENCES leads(id),
  calculator_id   INTEGER NOT NULL REFERENCES calculators(id),
  run_at          TIMESTAMP NOT NULL,
  type            VARCHAR(30) NOT NULL,
  channel         VARCHAR(20) NOT NULL DEFAULT 'email',
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts        INTEGER DEFAULT 0,
  max_attempts    INTEGER DEFAULT 3,
  last_error      TEXT,
  payload         JSONB,
  created_at      TIMESTAMP DEFAULT NOW(),
  processed_at    TIMESTAMP
);

-- ─── Analytics Events ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_events (
  id              SERIAL PRIMARY KEY,
  calculator_id   INTEGER NOT NULL REFERENCES calculators(id),
  event_type      VARCHAR(50) NOT NULL,
  metadata        JSONB,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ─── Deployment Status ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deployment_status (
  id                SERIAL PRIMARY KEY,
  calculator_id     INTEGER NOT NULL UNIQUE REFERENCES calculators(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'draft',
  last_published_at TIMESTAMP,
  auto_republish    BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

-- ─── Calculator Analytics Summary ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calculator_analytics_summary (
  id              SERIAL PRIMARY KEY,
  calculator_id   INTEGER NOT NULL REFERENCES calculators(id),
  period_date     TIMESTAMP NOT NULL,
  total_views     INTEGER DEFAULT 0,
  total_quotes    INTEGER DEFAULT 0,
  total_leads     INTEGER DEFAULT 0,
  conversion_rate INTEGER DEFAULT 0,
  avg_quote_value INTEGER DEFAULT 0,
  best_day        TEXT,
  metadata        JSONB,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ─── Job Logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_logs (
  id            SERIAL PRIMARY KEY,
  job_name      VARCHAR(100) NOT NULL,
  status        VARCHAR(20) NOT NULL,
  started_at    TIMESTAMP DEFAULT NOW(),
  finished_at   TIMESTAMP,
  error_message TEXT,
  metadata      JSONB
);

-- ─── Bookings ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id                          SERIAL PRIMARY KEY,
  calculator_id               INTEGER NOT NULL REFERENCES calculators(id),
  lead_id                     INTEGER REFERENCES leads(id),
  customer_name               TEXT NOT NULL,
  customer_email              TEXT,
  customer_phone              TEXT,
  date                        VARCHAR(10) NOT NULL,
  time                        VARCHAR(5) NOT NULL,
  duration_minutes            INTEGER NOT NULL DEFAULT 60,
  status                      VARCHAR(20) NOT NULL DEFAULT 'pending',
  deposit_amount              INTEGER DEFAULT 0,
  deposit_paid                BOOLEAN DEFAULT FALSE,
  stripe_payment_intent_id    TEXT,
  stripe_checkout_session_id  TEXT,
  quote_amount                INTEGER,
  notes                       TEXT,
  created_at                  TIMESTAMP DEFAULT NOW()
);

-- ─── AI Conversations ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_conversations (
  id              SERIAL PRIMARY KEY,
  agent_type      VARCHAR(30) NOT NULL,
  account_id      INTEGER REFERENCES calculators(id),
  calculator_id   INTEGER REFERENCES calculators(id),
  session_id      VARCHAR(100) NOT NULL,
  messages_json   JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ─── Support Tickets ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id              SERIAL PRIMARY KEY,
  calculator_id   INTEGER REFERENCES calculators(id),
  client_id       INTEGER NOT NULL,
  subject         TEXT NOT NULL,
  description     TEXT NOT NULL,
  status          VARCHAR(30) NOT NULL DEFAULT 'open',
  priority        VARCHAR(20) NOT NULL DEFAULT 'normal',
  category        VARCHAR(50) NOT NULL DEFAULT 'general',
  source          VARCHAR(30) NOT NULL DEFAULT 'manual',
  assigned_to     INTEGER REFERENCES users(id),
  ai_summary      TEXT,
  ai_priority_hint VARCHAR(20),
  transcript_json JSONB DEFAULT '[]',
  admin_notified  BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP,
  resolved_at     TIMESTAMP,
  closed_at       TIMESTAMP
);

-- ─── Ticket Messages ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_messages (
  id          SERIAL PRIMARY KEY,
  ticket_id   INTEGER NOT NULL REFERENCES support_tickets(id),
  author_id   INTEGER REFERENCES users(id),
  author_type VARCHAR(20) NOT NULL,
  visibility  VARCHAR(20) NOT NULL DEFAULT 'customer',
  content     TEXT NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─── Ticket Events ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_events (
  id          SERIAL PRIMARY KEY,
  ticket_id   INTEGER NOT NULL REFERENCES support_tickets(id),
  actor_id    INTEGER REFERENCES users(id),
  actor_type  VARCHAR(20) NOT NULL,
  action      VARCHAR(50) NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  summary     TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─── SMS Messages ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_messages (
  id              SERIAL PRIMARY KEY,
  lead_id         INTEGER REFERENCES leads(id),
  calculator_id   INTEGER REFERENCES calculators(id),
  direction       VARCHAR(10) NOT NULL,
  channel         VARCHAR(15) NOT NULL DEFAULT 'sms',
  body            TEXT NOT NULL,
  from_number     VARCHAR(30),
  to_number       VARCHAR(30),
  twilio_sid      VARCHAR(60),
  is_ai           BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ─── Audit Submissions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_submissions (
  id                       SERIAL PRIMARY KEY,
  business_name            TEXT,
  place_id                 TEXT,
  email                    TEXT NOT NULL,
  phone                    TEXT,
  name                     TEXT,
  wants_help               BOOLEAN DEFAULT FALSE,
  local_visibility_score   INTEGER,
  mobile_speed_score       INTEGER,
  desktop_speed_score      INTEGER,
  issue_count              INTEGER DEFAULT 0,
  report_json              JSONB,
  source_tool              VARCHAR(50),
  source_page              TEXT,
  created_at               TIMESTAMP DEFAULT NOW()
);

-- ─── Audit Reports ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMP DEFAULT NOW(),
  business_name     TEXT NOT NULL,
  business_place_id TEXT,
  audit_data        JSONB NOT NULL,
  ai_narrative      JSONB,
  view_count        INTEGER NOT NULL DEFAULT 0
);

-- ─── Audit Followup Emails ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_followup_emails (
  id                    SERIAL PRIMARY KEY,
  audit_submission_id   INTEGER REFERENCES audit_submissions(id),
  audit_report_id       UUID REFERENCES audit_reports(id),
  missed_call_lead_id   INTEGER,
  demo_quote_lead_id    INTEGER,
  email                 TEXT NOT NULL,
  business_name         TEXT,
  run_at                TIMESTAMP NOT NULL,
  step                  VARCHAR(30) NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts              INTEGER DEFAULT 0,
  max_attempts          INTEGER DEFAULT 3,
  last_error            TEXT,
  payload               JSONB,
  created_at            TIMESTAMP DEFAULT NOW(),
  processed_at          TIMESTAMP
);

-- ─── Demo Quote Leads ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS demo_quote_leads (
  id                  SERIAL PRIMARY KEY,
  email               TEXT,
  name                TEXT,
  phone               TEXT,
  company             TEXT,
  trade               VARCHAR(50) NOT NULL,
  demo_business_name  TEXT,
  quote_amount        INTEGER,
  answers             JSONB,
  sms_consent         BOOLEAN DEFAULT FALSE,
  source              VARCHAR(50) DEFAULT 'quote_demo',
  page                VARCHAR(100) DEFAULT 'quote-demo',
  source_tool         VARCHAR(50),
  source_page         TEXT,
  created_at          TIMESTAMP DEFAULT NOW()
);

-- ─── Missed Call Leads ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS missed_call_leads (
  id                      SERIAL PRIMARY KEY,
  email                   TEXT NOT NULL,
  name                    TEXT,
  phone                   TEXT,
  trade                   VARCHAR(50) NOT NULL,
  missed_calls_per_week   INTEGER,
  close_rate_percent      INTEGER,
  avg_job_value           INTEGER,
  estimated_annual_loss   INTEGER,
  source_tool             VARCHAR(50),
  source_page             TEXT,
  created_at              TIMESTAMP DEFAULT NOW()
);

-- ─── Chat Memory ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_memory (
  id                      SERIAL PRIMARY KEY,
  session_id              VARCHAR(100) NOT NULL,
  user_id                 INTEGER REFERENCES users(id),
  surface                 VARCHAR(30) NOT NULL DEFAULT 'website',
  report_id               UUID,
  user_name               TEXT,
  business_type           TEXT,
  service_area            TEXT,
  website_url             TEXT,
  previous_topics         JSONB DEFAULT '[]',
  interested_in_pricing   BOOLEAN DEFAULT FALSE,
  interested_in_booking   BOOLEAN DEFAULT FALSE,
  messages_json           JSONB NOT NULL DEFAULT '[]',
  expires_at              TIMESTAMP NOT NULL,
  created_at              TIMESTAMP DEFAULT NOW(),
  updated_at              TIMESTAMP DEFAULT NOW()
);

-- ─── AI Usage Logs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id                  SERIAL PRIMARY KEY,
  model               VARCHAR(60) NOT NULL,
  surface             VARCHAR(30) NOT NULL,
  provider            VARCHAR(30),
  channel             VARCHAR(30),
  session_id          VARCHAR(100),
  user_id             INTEGER REFERENCES users(id),
  report_id           UUID,
  input_tokens        INTEGER,
  output_tokens       INTEGER,
  latency_ms          INTEGER,
  estimated_cost_usd  INTEGER,
  success             BOOLEAN NOT NULL DEFAULT TRUE,
  error_message       TEXT,
  metadata            JSONB,
  created_at          TIMESTAMP DEFAULT NOW()
);

-- ─── AI Conversation Archive ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_conversation_archive (
  id                   SERIAL PRIMARY KEY,
  session_id           VARCHAR(100) NOT NULL,
  user_id              INTEGER REFERENCES users(id),
  surface              VARCHAR(30) NOT NULL,
  report_id            UUID,
  summary              TEXT NOT NULL,
  context_note         TEXT,
  tags                 JSONB DEFAULT '[]',
  primary_intent       VARCHAR(40) NOT NULL DEFAULT 'general',
  save_decision        VARCHAR(30) NOT NULL DEFAULT 'high_value',
  message_count        INTEGER NOT NULL DEFAULT 0,
  messages_json        JSONB DEFAULT '[]',
  total_input_tokens   INTEGER DEFAULT 0,
  total_output_tokens  INTEGER DEFAULT 0,
  estimated_cost_usd   INTEGER DEFAULT 0,
  first_message_at     TIMESTAMP,
  last_message_at      TIMESTAMP,
  created_at           TIMESTAMP DEFAULT NOW()
);

-- ─── Assistant Threads ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assistant_threads (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  surface         VARCHAR(30) NOT NULL DEFAULT 'portal',
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  title           TEXT,
  page_context    VARCHAR(60),
  metadata        JSONB DEFAULT '{}',
  message_count   INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ─── Assistant Messages ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assistant_messages (
  id          SERIAL PRIMARY KEY,
  thread_id   INTEGER NOT NULL REFERENCES assistant_threads(id),
  role        VARCHAR(20) NOT NULL,
  content     TEXT NOT NULL,
  token_count INTEGER,
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_thread_created
  ON assistant_messages (thread_id, created_at);

-- ─── Email Events ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_events (
  id          SERIAL PRIMARY KEY,
  email_id    VARCHAR(64) NOT NULL,
  type        VARCHAR(16) NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW(),
  metadata    JSONB
);
CREATE INDEX IF NOT EXISTS email_events_email_id_idx ON email_events (email_id);

-- ─── Service Catalog (Admin CRM) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_catalog (
  id                    VARCHAR(100) PRIMARY KEY,
  name                  TEXT NOT NULL,
  tagline               TEXT,
  description           TEXT,
  category              VARCHAR(50) NOT NULL,
  default_price         INTEGER,
  billing_period        VARCHAR(20) NOT NULL DEFAULT 'monthly',
  delivery_pattern      VARCHAR(20) NOT NULL DEFAULT 'one_time',
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  stripe_product_id     TEXT,
  stripe_price_id       TEXT,
  stripe_yearly_price_id TEXT,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

-- ─── Clients (Admin CRM) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER REFERENCES users(id),
  business_name         TEXT NOT NULL,
  contact_name          TEXT,
  contact_email         TEXT,
  contact_phone         TEXT,
  website_url           TEXT,
  google_place_id       TEXT,
  facebook_page_url     TEXT,
  google_credentials    JSONB,
  widget_token          VARCHAR(64) UNIQUE,
  last_review_sync_at   TIMESTAMP,
  trade_type            VARCHAR(100),
  status                VARCHAR(30) NOT NULL DEFAULT 'lead',
  source                VARCHAR(50),
  stripe_customer_id    TEXT,
  automation_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  human_override        BOOLEAN NOT NULL DEFAULT FALSE,
  journey_summary       TEXT,
  notes                 TEXT,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

-- ─── Email Unsubscribes ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_unsubscribes (
  id          SERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  list_id     VARCHAR(50) NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Note: Many additional tables exist (client_services, fulfillment_tasks,
-- onboarding_submissions, orders, order_items, suppliers, client_payments,
-- internal_notes, admin_activity_log, service_task_templates, onboarding_templates,
-- rankflow_*, socialsync_*, mapguard_*, reviews, review_requests, sales_leads,
-- outbound_*, tradeline_*, billing_dunning_events, routing_events, ops_snapshots,
-- intake_events, import_batches, prospects, prospect_events, prospect_enrichment,
-- campaign_prospects, sales_opportunities, content_drafts, content_approvals,
-- content_assets, service_cost_logs, review_sync_logs, monitored_reviews).
--
-- The full set of tables is defined in shared/schemas/*.ts and managed via
-- drizzle-kit push. This migration captures the core/foundational tables.
-- Surface-specific tables (RankFlow, SocialSync, MapGuard, ContentFlow, etc.)
-- are added via their own migrations or via db:push.

COMMIT;

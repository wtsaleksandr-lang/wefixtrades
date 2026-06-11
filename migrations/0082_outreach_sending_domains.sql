-- 0082_outreach_sending_domains.sql
--
-- Lane OA: sending-domain pool for cold outreach (Smartlead rail).
-- Cold mail NEVER sends from wefixtrades.com or any subdomain — the
-- denylist is enforced in application code at insert AND at campaign
-- verify-link (server/services/sending/sendingDomainPool.ts). Each row
-- is one purchased lookalike domain whose mailboxes live in Smartlead.
--
-- status lifecycle: warming -> active -> paused (recoverable) | burned (terminal)
-- bounce_rate / complaint_rate are trailing-7-day FRACTIONS (0.03 = 3%)
-- synced from Smartlead analytics; auto-pause at bounce > 3% or
-- complaint > 0.1%.
--
-- Additive only: new table + indexes, no existing objects touched.

CREATE TABLE IF NOT EXISTS outreach_sending_domains (
  id                 SERIAL PRIMARY KEY,
  domain             VARCHAR(255) NOT NULL,
  status             VARCHAR(20)  NOT NULL DEFAULT 'warming',
  warmup_started_at  TIMESTAMP,
  daily_cap          INTEGER      NOT NULL DEFAULT 20,
  bounce_rate        REAL         NOT NULL DEFAULT 0,
  complaint_rate     REAL         NOT NULL DEFAULT 0,
  paused_reason      TEXT,
  last_synced_at     TIMESTAMP,
  created_at         TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS outreach_sending_domains_domain_uq
  ON outreach_sending_domains(domain);

CREATE INDEX IF NOT EXISTS outreach_sending_domains_status_idx
  ON outreach_sending_domains(status);

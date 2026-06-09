-- 0079_admin_notices.sql
--
-- MISSING-MIGRATION FIX (P0): the `admin_notices` table is defined in the
-- Drizzle schema (shared/schemas/db.ts → adminNotices) and is read by
-- GET /api/admin/notices (the AI Agenda page) and written by
-- server/services/founderNotify.ts (notifyFounder) — but NO migration ever
-- created it. Dev gets the table via `drizzle-kit push`; production only ever
-- runs the hand-rolled migrations/*.sql via the boot-time bootstrap migrator
-- (server/lib/bootstrapMigrations.ts), so on prod the table never existed and
-- GET /api/admin/notices 500'd with `relation "admin_notices" does not exist`,
-- taking the whole AI Agenda page down.
--
-- This migration is additive and idempotent (CREATE TABLE IF NOT EXISTS / no
-- data touched), matching the bootstrap migrator's re-runnable contract. It is
-- NOT applied here — it lands on prod on the next boot/redeploy (a deploy
-- action for Alex).

CREATE TABLE IF NOT EXISTS admin_notices (
  id          SERIAL PRIMARY KEY,
  type        VARCHAR(40)  NOT NULL,          -- e.g. inbound_email_uncertain
  title       TEXT         NOT NULL,
  summary     TEXT         NOT NULL,
  entity_type VARCHAR(40),                    -- support_ticket | client | …
  entity_id   INTEGER,
  status      VARCHAR(20)  NOT NULL DEFAULT 'unread',  -- unread | read | actioned
  created_at  TIMESTAMP    DEFAULT NOW(),
  read_at     TIMESTAMP
);

-- The agenda lists newest-first and counts unread; index the two columns the
-- GET /api/admin/notices query orders/filters on so it stays cheap as notices
-- accumulate.
CREATE INDEX IF NOT EXISTS admin_notices_created_at_idx ON admin_notices(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_notices_status_idx     ON admin_notices(status);

-- Fixes a schema drift: shared/schemas/db.ts:38-39 added ai_contact_method +
-- ai_contact_phone on users, but no migration file ever shipped them. Dev
-- works because db:push auto-applies the schema; prod uses the file-based
-- bootstrapMigrations runner so it never picked them up.
--
-- Symptom (prod logs 2026-05-22 17:36): every users SELECT throws
--   "column users.ai_contact_method does not exist"
-- which 500s signup, forgot-password, magic-link, Google OAuth.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ai_contact_method VARCHAR(20) NOT NULL DEFAULT 'dashboard';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ai_contact_phone TEXT;

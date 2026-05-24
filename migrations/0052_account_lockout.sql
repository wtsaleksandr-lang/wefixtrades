-- 0052_account_lockout.sql
--
-- P1 security fix: account lockout after repeated failed login attempts.
--
-- Adds two columns to `users`:
--   * failed_login_attempts — running counter, reset on every successful
--     password verification across login / token-login / checkout-login.
--   * locked_until           — when set in the future, login routes
--     short-circuit with HTTP 423 ("Locked"). NULL = not locked.
--
-- Threshold (enforced in server/routes/authRoutes.ts):
--   * 5 failed attempts inside a 15-minute window → lock for 15 minutes.
--   * The counter increments on every wrong-password attempt; the
--     server clears it on first successful auth.
--
-- Additive, online DDL — defaults make the column safe to add to a
-- table with rows. No backfill needed.

ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

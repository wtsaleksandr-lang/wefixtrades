-- 0092_users_apple_sub.sql
--
-- "Continue with Apple" (Sign in with Apple) sign-in support.
--
-- Mirrors the existing users.google_sub / facebook_sub / microsoft_sub
-- columns (text, unique, nullable) — one column per provider so the auth
-- code can resolve a user from Apple's stable subject ID (the verified
-- id_token `sub`) without joining a side table. Null for accounts that
-- haven't linked Apple.
--
-- Server flow (server/routes/authRoutes.ts → "Sign in with Apple" block):
--   1. POST callback (response_mode=form_post) exchanges the code for the
--      verified id_token via server/lib/appleSignin.ts
--   2. Lookup by apple_sub → log in if found
--   3. Else lookup by email → auto-link (set apple_sub) if Apple vouched
--      the email is verified
--   4. Else create the account (+ its clients row)
--
-- Additive + idempotent (IF NOT EXISTS): WeFixTrades self-heals by running
-- every migrations/*.sql on boot (server/lib/bootstrapMigrations.ts), so
-- this must be safe to re-run. Adding a text column + a partial unique
-- index is a fast, online DDL on Postgres (no table rewrite).

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "apple_sub" text;

CREATE UNIQUE INDEX IF NOT EXISTS users_apple_sub_idx ON users(apple_sub) WHERE apple_sub IS NOT NULL;

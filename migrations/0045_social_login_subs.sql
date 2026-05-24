-- 0045_social_login_subs.sql
--
-- Social login expansion: Microsoft (Entra ID) + Facebook.
--
-- Mirrors the existing `users.google_sub` column added earlier (text,
-- unique, nullable). One column per provider so the auth code can
-- resolve a user from a provider's stable subject ID without joining
-- a side table. Null for accounts that haven't linked that provider.
--
-- Server flow (server/routes/authRoutes.ts):
--   1. OAuth callback resolves the provider's stable subject ID + email
--   2. Lookup by `<provider>_sub` → log in if found
--   3. Else lookup by email → auto-link (set the sub column) if the
--      provider vouched for the email being verified
--   4. Else redirect to /signup with the email prefilled
--
-- Adding two text columns with a unique index is a fast, online DDL
-- on Postgres (no rewrite, no exclusive lock beyond the metadata catch).

ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_sub TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_sub TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_microsoft_sub_idx ON users(microsoft_sub) WHERE microsoft_sub IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_facebook_sub_idx ON users(facebook_sub) WHERE facebook_sub IS NOT NULL;

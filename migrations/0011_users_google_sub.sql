-- "Continue with Google" sign-in support.
--
-- Adds users.google_sub — the stable OpenID `sub` claim from Google's
-- ID token. Set when a user signs in via Google. Null for password-only
-- accounts. Users created through Google get a random unusable
-- password_hash and can claim a real password later via the standard
-- forgot-password flow.
--
-- Additive + nullable — safe to apply with no downtime.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_sub" TEXT;

-- Unique so one Google account maps to at most one app account.
-- Partial-unique semantics: multiple NULLs are allowed by Postgres
-- UNIQUE, so password-only accounts are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "users_google_sub_unique"
  ON "users" ("google_sub");

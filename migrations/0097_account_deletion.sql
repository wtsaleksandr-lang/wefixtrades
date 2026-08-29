-- 0097 — self-service account deletion (privacy policy §10, GDPR Art. 17).
--
-- Settings → Account → "Delete account" erases the customer's personal data
-- and anonymises the `users` / `clients` anchor rows in place. The anchor rows
-- survive on purpose: `admin_impersonations` holds ON DELETE RESTRICT foreign
-- keys into `users`, and the financial records we must keep for 7 years point
-- at `clients`. Keeping the (now meaningless) primary keys is what lets the
-- erasure succeed at all.
--
-- These two columns are the tombstone: they record that the row is a scrubbed
-- shell rather than a live account, so login can refuse it explicitly and
-- support can tell "deleted" apart from "never filled in their name".
--
-- Additive only. No data is dropped, moved or rewritten by this migration.

ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Deleted accounts are a small minority, so a partial index keeps the
-- "is this account live?" check on the login path cheap.
CREATE INDEX IF NOT EXISTS users_deleted_at_idx ON users (deleted_at)
  WHERE deleted_at IS NOT NULL;

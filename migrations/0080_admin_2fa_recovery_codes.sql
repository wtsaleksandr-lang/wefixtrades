-- 0080_admin_2fa_recovery_codes.sql
--
-- Lane C — mandatory admin 2FA + recovery codes.
--
--   totp_recovery_codes      jsonb array of SHA-256 hex hashes of the user's
--                            single-use 2FA recovery codes. Generated once at
--                            TOTP enrollment (plaintext shown exactly once,
--                            never stored); each successful recovery login
--                            removes the consumed hash. NULL/[] = none left.
--
--   admin_2fa_grace_used_at  Stamped the first time an admin WITHOUT an
--                            enrolled TOTP factor logs in after this policy
--                            ships — that login is the single "grace" session
--                            (full access, redirected to enrollment). Once
--                            set, subsequent factor-less admin logins are
--                            enrollment-restricted until TOTP is enabled.
--                            NULL for client users and for enrolled admins.
--
-- Additive + idempotent (ADD COLUMN IF NOT EXISTS), matching the boot-time
-- bootstrap migrator's re-runnable contract. No data touched.

ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_recovery_codes JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_2fa_grace_used_at TIMESTAMPTZ;

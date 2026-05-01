-- Security: Add TOTP 2FA fields to users table
-- ============================================================================
-- Sprint 4 — Security & Infrastructure
-- Adds optional TOTP-based two-factor authentication columns.
-- ============================================================================

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE;

COMMIT;

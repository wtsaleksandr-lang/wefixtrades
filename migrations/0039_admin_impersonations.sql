-- 0039_admin_impersonations.sql
--
-- Audit table for admin "view as customer" impersonation sessions. Every
-- successful start writes a row; the stop endpoint sets ended_at. Active
-- impersonations (ended_at IS NULL) are bounded by a 60-minute hard cap
-- enforced in middleware. The partial index on ended_at accelerates the
-- per-request lookup that swaps req.user to the target.

CREATE TABLE IF NOT EXISTS admin_impersonations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  started_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMP WITH TIME ZONE,
  admin_ip        TEXT,
  reason          TEXT
);

CREATE INDEX IF NOT EXISTS admin_impersonations_admin_idx ON admin_impersonations(admin_user_id);
CREATE INDEX IF NOT EXISTS admin_impersonations_target_idx ON admin_impersonations(target_user_id);
CREATE INDEX IF NOT EXISTS admin_impersonations_active_idx ON admin_impersonations(ended_at) WHERE ended_at IS NULL;

-- Fix for the operator-class bug in 0006's email suppression index.
--
-- Drizzle-kit's auto-generator (used by Replit's deploy workflow) was
-- emitting `int4_ops` for both columns of the email unique index because
-- the second column was a SQL expression (lower(customer_email)), and
-- Drizzle copied the first column's operator class. Resulting SQL:
--   CREATE UNIQUE INDEX ... USING btree
--     (client_id int4_ops, lower(customer_email) int4_ops) WHERE ...
-- PostgreSQL rejected with:
--   operator class "int4_ops" does not accept data type text
--
-- Fix: keep the index on the plain column; case-insensitivity is
-- enforced in storage.ts by lowercasing email at the boundary.
--
-- This migration:
--   1. Drops the functional index from any env that successfully ran 0006
--      (production never did — the deploy was failing on the broken auto-
--      gen SQL — but dev envs may have it).
--   2. Normalizes existing data to lowercase so the case-insensitive
--      contract still holds after the index is rebuilt.
--   3. Creates the simple-column index. Matches the new Drizzle schema.

-- 1. Drop old functional index (no-op if it doesn't exist)
DROP INDEX IF EXISTS idx_review_suppression_email;

-- 2. Normalize stored data to lowercase. Safe against rows already
--    lowercased; safe against NULL.
UPDATE review_request_suppression
SET customer_email = lower(customer_email)
WHERE customer_email IS NOT NULL
  AND customer_email <> lower(customer_email);

-- 3. Recreate the index on the plain column. Same WHERE clause keeps
--    NULL emails out of the uniqueness constraint.
CREATE UNIQUE INDEX IF NOT EXISTS idx_review_suppression_email
  ON review_request_suppression (client_id, customer_email)
  WHERE customer_email IS NOT NULL;

-- 0101 — attribute inbound HELP/INFO texts to the tenant they arrived for.
--
-- The inbound keyword handler (server/routes/twilioRoutes.ts) resolves
-- `getClientIdByAssignedNumber(To)` so it can answer HELP in the tenant's own
-- brand, then wrote the audit row with `lead_id: null, calculator_id: null` and
-- threw the client id away. The row holds the sender's phone number and the
-- message body, so a homeowner texting HELP to a plumber's TradeLine number
-- produced personal data that the plumber's own account deletion could not
-- reach — it was attributable the whole time, just not recorded.
--
-- `scope_client_id` is the same column name, type and meaning that
-- `sms_opt_outs` has carried since Wave 77 (migration 0068): the client who
-- owns the number the sender texted. NULL keeps its existing meaning — the
-- message arrived on the shared WeFixTrades brand line and belongs to no
-- tenant.
--
-- Additive only. No data is dropped, moved or rewritten. Existing rows get
-- NULL, which is the correct value for them: nothing recorded which tenant they
-- were for, and guessing after the fact would be worse than leaving them to the
-- retention sweep that now bounds them.
--
-- ── Locking ──
-- ADD COLUMN takes ACCESS EXCLUSIVE on sms_messages BEFORE it evaluates
-- IF NOT EXISTS, so on a re-run against a database that already has the column
-- the "no-op" would still queue behind any open transaction and block every
-- reader of a table on the inbound-webhook path. Two things stop that:
--   1. The catalog pre-check below skips the ALTER entirely when the column is
--      already there, so a re-apply takes no lock at all.
--   2. lock_timeout bounds the wait on a genuine first apply. Failing fast
--      aborts this migration (and the boot) with a clear error, which is the
--      recoverable outcome; a DDL parked on ACCESS EXCLUSIVE stalls the whole
--      table behind it and is not.
-- Both are SET LOCAL, so they last exactly as long as the transaction
-- bootstrapMigrations wraps this file in and leak into nothing else.
--
-- The ALTER keeps its own IF NOT EXISTS as well. The two guards do different
-- jobs and neither replaces the other: the catalog check is what avoids TAKING
-- the lock, the clause is what makes the statement safe if a concurrent apply
-- wins the race between the check and the ALTER. It is also the form
-- server/lib/schemaSentinel.test.ts statically pins for every sentinel file, so
-- the self-heal re-apply stays provably idempotent.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sms_messages'
      AND column_name = 'scope_client_id'
  ) THEN
    ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS scope_client_id INTEGER;
  END IF;
END $$;

-- Both the account-deletion scan and the retention sweep filter on this column.
-- Partial: only inbound keyword texts on a tenant number ever populate it, so
-- the index stays a rounding error next to the table.
--
-- Deliberately NOT CONCURRENTLY: CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction block, and bootstrapMigrations runs every file in one. On a
-- partial index over a nearly-always-NULL column the plain build is brief.
CREATE INDEX IF NOT EXISTS idx_sms_messages_scope_client
  ON sms_messages (scope_client_id)
  WHERE scope_client_id IS NOT NULL;

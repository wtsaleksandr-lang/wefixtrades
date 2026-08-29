-- 0098 — server-side quote recompute audit trail (Wave QQ-INT).
--
-- POST /api/leads previously stored whatever `quote_amount` the browser
-- posted, with no server-side check, so the figure driving an owner's
-- pipeline value and their CRM webhook was tamperable. The capture route now
-- re-derives the price from the owner's OWN stored pricing_config plus the
-- submitted answers and stores the server number when it can do so faithfully.
--
-- These two columns are the paper trail for that decision:
--
--   quote_amount_client    what the browser submitted, kept verbatim even when
--                          the server overrode it. Without this a correction is
--                          invisible after the fact and a tampering pattern is
--                          unprovable.
--   quote_recompute_status which engine ran and what it concluded — one of
--                          verified | corrected | skipped_no_amount |
--                          skipped_advanced | skipped_external |
--                          skipped_no_price | unavailable.
--
-- Deliberately NOT an enum: the status set will grow when the advanced
-- (formula-builder) path becomes reproducible server-side, and a text column
-- avoids a lock-taking ALTER TYPE at that point. Deliberately NOT stored inside
-- the existing `answers` jsonb either, because that blob is echoed verbatim to
-- the public API, the owner's lead webhook and the CSV export — internal audit
-- metadata does not belong in a customer-facing payload.
--
-- Legacy rows stay NULL, which reads correctly as "captured before recompute
-- existed" and is distinct from any real status value.
--
-- Additive only. No data is dropped, moved or rewritten by this migration.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS quote_amount_client INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quote_recompute_status VARCHAR(32);

-- Mismatches are the rare, interesting rows (tampering or a mid-session price
-- edit), so a partial index keeps "show me every corrected quote" cheap without
-- carrying an index entry for every ordinary lead.
CREATE INDEX IF NOT EXISTS leads_quote_recompute_mismatch_idx
  ON leads (calculator_id, created_date)
  WHERE quote_recompute_status = 'corrected';

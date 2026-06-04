-- P0-1: Add UNIQUE constraint on stripe_session_id to prevent webhook
-- race-condition duplicates (SELECT-then-INSERT without constraint).
-- Both tables already have a non-unique INDEX; this adds the constraint
-- and drops the redundant plain index.

-- full_audit_master_orders
DROP INDEX IF EXISTS idx_full_audit_master_orders_session;
ALTER TABLE full_audit_master_orders
  ADD CONSTRAINT uq_fam_orders_stripe_session UNIQUE (stripe_session_id);

-- citation_builder_submissions
DROP INDEX IF EXISTS idx_citation_builder_subs_session;
ALTER TABLE citation_builder_submissions
  ADD CONSTRAINT uq_cb_subs_stripe_session UNIQUE (stripe_session_id);

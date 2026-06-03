-- 0077_tradeline_learning_apply.sql
--
-- Self-learning apply-handoff (backlog F). Closes the loop: an approved
-- learning candidate can now be APPLIED to a live agent brain by creating a
-- tradeline_knowledge_base entry, and ONE-CLICK ROLLED BACK by archiving that
-- entry (the live voice prompt reads active-only KB rows). These columns record
-- the link + who/when so every applied change is versioned and reversible.
--
-- All columns are additive + nullable — no backfill, no data loss, no index,
-- no DROP/RENAME/SET NOT NULL. The 'applied' status value is enforced only in
-- TS (status is a plain varchar with no DB CHECK), so no DDL is needed for it.

ALTER TABLE tradeline_learning_candidates
  ADD COLUMN IF NOT EXISTS applied_at    TIMESTAMPTZ,  -- when applied to a live brain
  ADD COLUMN IF NOT EXISTS applied_kb_id TEXT,         -- tradeline_knowledge_base.id created by the apply
  ADD COLUMN IF NOT EXISTS applied_by    INTEGER;      -- admin user id who applied

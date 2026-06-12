-- 0087_seo_content_approvals.sql
--
-- WeFixTrades OWNED-DOMAIN SEO content engine — human-review audit (generator wave).
--
-- The generator (server/services/seoContent/seoArticleGenerator.ts) writes a
-- draft directly into seo_content_pages with status='in_review' — never
-- 'published'. The admin review queue then approves (→ published), edits, or
-- rejects (→ archived) it. Every one of those actions appends ONE immutable
-- row here — the append-only audit trail that is the human-review gate.
--
-- This mirrors content_approvals (migrations: contentflow) but FKs to
-- seo_content_pages because owned-domain drafts live there, not in
-- content_drafts (whose draft_id FK is bound to content_drafts.id).
--
-- Additive only: one new table + one index. IF NOT EXISTS throughout, so the
-- whole file is safe to re-run on every boot. No DROP / RENAME / TRUNCATE /
-- unguarded DELETE.

CREATE TABLE IF NOT EXISTS seo_content_approvals (
  id          SERIAL PRIMARY KEY,
  page_id     INTEGER NOT NULL REFERENCES seo_content_pages(id) ON DELETE CASCADE,
  actor_type  VARCHAR(20) NOT NULL,   -- 'admin' | 'system'
  actor_id    INTEGER,
  action      VARCHAR(30) NOT NULL,   -- 'submitted' | 'approved' | 'edited' | 'rejected'
  notes       TEXT,
  metadata    JSONB,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS seo_content_approvals_page_idx
  ON seo_content_approvals (page_id, created_at);

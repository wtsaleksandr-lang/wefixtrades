-- 0050_perf_indexes.sql
--
-- Performance indexes for the highest-volume customer-data tables that
-- shipped without FK / query indexes in 0000_initial_schema.sql.
--
-- Rationale and full audit: docs/operations/db-performance-audit-2026-05-24.md
--
-- Constraint: server/lib/bootstrapMigrations.ts runs every migration file
-- inside a single BEGIN/COMMIT, so CREATE INDEX CONCURRENTLY is not
-- available. Plain CREATE INDEX takes a brief write lock per table on
-- apply — acceptable pre-launch (tables are small) and we have limited
-- this migration to the indexes most directly tied to user-visible
-- latency. All indexes use IF NOT EXISTS so re-running is safe.
--
-- These indexes are also declared inline in the corresponding Drizzle
-- schema files (when applicable) — but for tables in shared/schemas/db.ts
-- whose table definitions are large and not yet annotated with an index
-- object, the SQL here is authoritative. drizzle-kit push will warn that
-- it wants to drop these; the warning is benign because bootstrapMigrations
-- runs BEFORE any drizzle push.

-- 1. leads — every list-leads-by-calculator path orders by created_date DESC.
CREATE INDEX IF NOT EXISTS idx_leads_calculator_created
  ON leads (calculator_id, created_date DESC);

-- 2. support_tickets — inbox by client, often filtered by status.
CREATE INDEX IF NOT EXISTS idx_support_tickets_client_status
  ON support_tickets (client_id, status, created_at DESC);

-- 3. ticket_messages — every ticket-detail view fetches the thread by ticket_id.
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_created
  ON ticket_messages (ticket_id, created_at);

-- 4. ticket_events — every ticket-detail view loads the audit trail by ticket_id.
CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_created
  ON ticket_events (ticket_id, created_at);

-- 5. sms_messages — Twilio rate-limit checks on lead_id and calculator_id
--    run on every outbound SMS. Two single-column (with created_at) indexes
--    rather than one composite — the two queries don't share a leading column.
CREATE INDEX IF NOT EXISTS idx_sms_messages_calc_created
  ON sms_messages (calculator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_messages_lead_created
  ON sms_messages (lead_id, created_at DESC);

-- 6. bookflow_appointments — calendar / today's appointments by client.
CREATE INDEX IF NOT EXISTS idx_bookflow_appointments_client_start
  ON bookflow_appointments (client_id, start_time);

-- 7. bookflow_invoices — list-invoices-by-client. Existing contact_idx
--    covers the unrelated contact-detail lookup but not the primary list view.
CREATE INDEX IF NOT EXISTS idx_bookflow_invoices_client_created
  ON bookflow_invoices (client_id, created_at DESC);

-- 8. notification_queue — worker poll. Partial index keeps it tiny
--    (only pending rows) and exactly matches the worker's WHERE clause.
CREATE INDEX IF NOT EXISTS idx_notification_queue_pending
  ON notification_queue (created_at)
  WHERE status = 'pending';

-- 9. followup_jobs — same shape as #8; worker polls run_at on pending rows.
CREATE INDEX IF NOT EXISTS idx_followup_jobs_pending
  ON followup_jobs (run_at)
  WHERE status = 'pending';

-- 10. analytics_events — every dashboard analytics tile filters by
--     calculator_id and orders by created_at DESC. High write rate, so the
--     extra index has a real maintenance cost — but the query is unusable
--     without it once an account has any meaningful event history.
CREATE INDEX IF NOT EXISTS idx_analytics_events_calc_created
  ON analytics_events (calculator_id, created_at DESC);

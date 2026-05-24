# Database Performance Audit — 2026-05-24

Lane: `audit/db-performance-review` (worktree `wfx-dbperf` from `origin/main`).

Method: static analysis pass over all 54 schema files in `shared/schemas/` and
all 49 `migrations/*.sql`, cross-referenced against query patterns in
`server/routes/` and `server/storage.ts`. Live `pg_stat_user_indexes` /
`pg_stat_user_tables` inspection was **not** performed — orchestrator policy
denies read-only psql against production without explicit per-session
approval, and the audit brief was explicit: READ-ONLY against prod DB.
Findings below are therefore code-side; the recommended migration is
designed to be safe regardless of live stats.

## Scope and table inventory

54 schema files declare ~120 user tables. Existing index coverage is **uneven**:

- **Tables with thoughtful indexes** (declared in either Drizzle or a
  numbered migration): `reviews`, `review_requests`, `monitored_reviews`,
  `outreach_sequences`, `prospects` (partial), `widget_deposits`,
  `availability_rules`, `assistant_messages`, `email_events`, `api_usage`,
  `api_keys`, `audit_log`, `bookflow_invoices.contact_id`,
  `client_faq_items`, `review_funnel_events`, `callback_requests`,
  `rum_web_vitals`, `ai_spend_log`, `ai_usage_logs.loop_run_id`,
  `mobile_call_records`, `voicemails`, `gbp_post_queue`, `ai_response_ratings`.
- **Tables with serial PK and unique-only indexes but NO FK / query
  indexes**: `leads`, `bookings`, `notification_queue`, `followup_jobs`,
  `analytics_events`, `support_tickets`, `ticket_messages`, `ticket_events`,
  `sms_messages`, `ai_conversations`, `chat_memory`, `quote_snapshots`,
  `bookflow_appointments`, `bookflow_invoices` (client_id missing),
  `client_services`, `orders`, `order_items`, `fulfillment_tasks`,
  `internal_notes`, `client_payments`, `onboarding_submissions`,
  `routing_events`, `tradeline_call_log`, `tradeline_mode_log`,
  `tradeline_usage`, `billing_dunning_events`, `audit_followup_emails`,
  `prospect_enrichment`, `prospect_events`, `campaign_prospects`,
  `sales_opportunities`, all 11 `rankflow_*` tables, `admin_notices`,
  `email_queue`, `integration_error_logs`.

## Missing indexes — ranked by query frequency × likely table growth

The brief asked for "table size × query frequency". Without live row counts
I substituted **structural growth potential**: any table whose rows scale
per-customer-per-lead, per-customer-per-day, or per-customer-per-API-call
is treated as high-growth.

| Rank | Table | Missing index | Reason — observed query pattern | Severity |
|---|---|---|---|---|
| 1 | `leads` | `(calculator_id, created_date DESC)` | `storage.ts:747,761` and 7 portal/mobile/api routes all do `WHERE calculator_id = $1 ORDER BY created_date DESC`. Highest-volume customer-data table. | CRITICAL |
| 2 | `support_tickets` | `(client_id, status, created_at DESC)` | `portalRoutes.ts:1161`, `portalTools.ts:528`, `portalAssistantContext.ts:256` all filter by `client_id`, often with `status = 'open'`. Inbox view. | HIGH |
| 3 | `ticket_messages` | `(ticket_id, created_at)` | Every ticket-detail view fetches the full message thread by `ticket_id`. No index — full scan. | HIGH |
| 4 | `ticket_events` | `(ticket_id, created_at)` | Same as messages — every ticket-detail view loads the audit trail. | HIGH |
| 5 | `sms_messages` | `(calculator_id, created_at DESC)` and `(lead_id, created_at DESC)` | `twilioClient.ts:74,83`, `storage.ts:1356,1374` — both lead-lookup and calculator-aggregate paths scan the table on every SMS-rate-limit check (~per-message). | HIGH |
| 6 | `bookflow_appointments` | `(client_id, start_time)` | `bookflowRoutes.ts:827`, multiple "today's appointments" and "month view" queries. Calendar rendering hits this on every portal load. | HIGH |
| 7 | `bookflow_invoices` | `(client_id, status)` and `(client_id, created_at DESC)` | `bookflowRoutes.ts:77,294` lists invoices by client. The shipped `contact_idx` doesn't help these. | HIGH |
| 8 | `notification_queue` | `(status, created_at)` partial WHERE status='pending' | Worker polls "pending" rows every tick. Scan grows as historical rows accumulate. | HIGH |
| 9 | `followup_jobs` | `(status, run_at)` partial WHERE status='pending' | Same — worker scan. `run_at` is the dispatch key. | HIGH |
| 10 | `analytics_events` | `(calculator_id, created_at DESC)` | Every analytics dashboard load. High write rate (one row per widget event). | HIGH |
| 11 | `campaign_prospects` | `(campaign_id, sync_status)` and `(prospect_id)` | Outbound junction table. Joins from both sides; will scan as prospects scale. | HIGH |
| 12 | `prospect_events` | `(prospect_id, created_at DESC)` | Append-only audit trail per prospect — full scan on every prospect-detail view. | HIGH |
| 13 | `prospect_enrichment` | `(prospect_id)` | One-to-one but no FK index — every prospect detail load joins on it. | MEDIUM |
| 14 | `sales_opportunities` | `(prospect_id)` and `(stage)` | Pipeline kanban filters by stage. | MEDIUM |
| 15 | `audit_followup_emails` | `(status, run_at)` partial | Worker scan, same shape as `notification_queue`. | MEDIUM |
| 16 | `admin_notices` | `(status, created_at DESC)` partial WHERE status='unread' | Admin agenda view query. | MEDIUM |
| 17 | `email_queue` | `(status, created_at)` partial WHERE status='pending' | Email worker scan. | MEDIUM |
| 18 | `integration_error_logs` | already has `created_at_idx` — also need `(integration, created_at DESC)` | Filtered admin views. | LOW |
| 19 | `internal_notes` | `(client_id, created_at DESC)` | Client-detail page notes panel. | MEDIUM |
| 20 | `client_services` | `(client_id, status)` | Listed on every client-detail page. | MEDIUM |
| 21 | `client_payments` | `(client_id, created_at DESC)` | Billing tab on client detail. | MEDIUM |
| 22 | `fulfillment_tasks` | `(client_id, status)` and `(supplier_id)` | Ops dashboard tile, supplier queue view. | MEDIUM |
| 23 | `orders` | `(client_id, created_at DESC)` | Orders tab. | MEDIUM |
| 24 | `order_items` | `(order_id)` | Always loaded with parent order — scan. | MEDIUM |
| 25 | `chat_memory` | `(session_id, expires_at)` | Every chat turn looks up session by ID; cron expires old rows. | MEDIUM |
| 26 | `quote_snapshots` | `(calculator_id, created_at DESC)` | Snapshot lookup beyond slug; admin views. | MEDIUM |
| 27 | `rankflow_tasks` | `(client_id, status)` and `(plan_id)` | Task board per client. All `rankflow_*` tables lack FK indexes. | MEDIUM |
| 28 | `rankflow_keywords` / `_pages` / `_rankings` / `_progress` | `(client_id)` | Rank dashboard. | MEDIUM |
| 29 | `bookings` (legacy widget) | `(calculator_id, date)` | Calendar lookups. | LOW (declining table) |
| 30 | `vapi_webhook_events` | `(call_id)` and `(created_at DESC)` | Webhook debug page. | LOW |

## Unused indexes

Cannot be measured without live `pg_stat_user_indexes`. No candidates
identified from the code alone — every declared index has at least one
matching query. Recommend re-running this audit against live stats once
the production DB is in steady-state usage post-launch.

## JSONB columns without GIN indexes

**Zero GIN indexes exist across the entire database.** That is mostly fine
because most JSONB columns in the schema are "blob storage" (read whole,
never queried by content). Two queries DO use JSONB containment (`@>`) and
will silently full-scan today:

1. **`calculators.calculator_settings` `_slug_redirects`** — `storage.ts:721`
   does `jsonb_typeof(...) = 'array' AND ... @> [{"slug": $1}]::jsonb` on
   every `/api/calculators/lookup` request for an unknown slug. With ~N
   calculators, this is O(N) per redirect-miss. A GIN index on
   `calculator_settings jsonb_path_ops` would let the planner use it, but
   the query is wrapped in a `jsonb_typeof` guard that defeats index use
   in the current shape. Practical fix: pull `_slug_redirects` out into
   its own small table `calculator_slug_redirects(old_slug, calculator_id)`
   with a unique index. Out of scope for this PR.
2. **`suppliers.supported_services`** — `storage.ts:2179` does `@>
   '["service_id"]'::jsonb`. With low supplier count (~tens) this is fine.
   No action needed.

No other production query path uses `@>`, `?`, `?&`, `?|` or `jsonb_path_exists`.

## Oversized rows

No `text[]`, `bytea`, or wide-tuple columns identified that would risk
TOAST inefficiency beyond the existing JSONB blobs (`audit_data`,
`ai_narrative`, `messages_json`, `payload`, `raw_data`, `report_json`).
These are read whole by design — no row-width concern.

## Query anti-patterns found in code

| # | File / line | Anti-pattern | Risk |
|---|---|---|---|
| 1 | `routes/reputationRoutes.ts:482,585` | `Promise.all(competitors.map(async c => db.select()...where(eq(competitor_id, c.id))))` — classic N+1 with concurrent fan-out. | One-query-per-competitor; for clients with 10+ tracked competitors this is 10 round-trips per page load. Collapse to one query: `WHERE competitor_id = ANY($1) ORDER BY competitor_id, captured_at DESC` + group in JS. |
| 2 | `routes/portalRoutes.ts:3727,3779` | Same N+1 pattern duplicated in the portal-side version of the same view. | Same as #1. |
| 3 | `storage.ts:711-727` `getCalculatorByOldSlug` | Full table scan with `jsonb_typeof` guard + `@>` containment. The guard kills GIN-index usability. | Extract `_slug_redirects` to its own indexed table. |
| 4 | `routes/portalRoutes.ts` 20 `await db.select().from(...)` calls | Many of these on `client_id` filtered tables have no upstream pagination — they load the full result set into memory before slicing in JS. | Audit for `.limit()` / cursor pagination on tables that grow per-client. The compound effect of #1 + missing FK indexes (above) is the larger risk. |
| 5 | `routes/adminCrmRoutes.ts`, `adminOutboundRoutes.ts` | Admin list endpoints (`outboundRoutes.ts` has 13 `db.select` calls) frequently apply `WHERE` and `ORDER BY` to unindexed columns — Drizzle just emits the SQL, planner picks seq scan. | Same indexes from the migration cover most of these. |
| 6 | `twilioClient.ts:74,83` | SMS rate-limit checks run a `COUNT(*) WHERE lead_id = $1 AND created_at > $2` on every outbound SMS attempt with no `(lead_id, created_at)` index. | Per-message cost — addressed by index #5. |
| 7 | Most `WHERE created_at >= $cutoff` retention sweeps | Workers like `imageRetentionWorker.ts` and `notificationWorker.ts` scan their target tables every tick. The 0033 retention sweep added `..._retention_idx` indexes for the soft-deleted-files case but the live-row counterparts (e.g. `notification_queue` cleanup) still scan. | Index #8 (`notification_queue (status, created_at)`) doubles as the worker poll index AND the retention sweep predicate. |
| 8 | No `LIMIT` on `db.select().from(<append-only>)` patterns | `prospect_events`, `ticket_events`, `analytics_events`, `audit_log` are append-only and shown in time-bounded UIs, but several handlers pull "everything for this entity" with no cap. | Add `LIMIT 200` defaults; the indexes from this migration make the seek cheap so client-side trimming becomes a UI choice, not a perf necessity. |

## Top 10 recommended index additions

Shipped in `migrations/0050_perf_indexes.sql` as part of this PR. All use
`CREATE INDEX IF NOT EXISTS` so re-running the migration is safe.

**Why not `CREATE INDEX CONCURRENTLY`?** `server/lib/bootstrapMigrations.ts`
runs every migration file inside a single `BEGIN/COMMIT` transaction.
Postgres forbids `CREATE INDEX CONCURRENTLY` inside a transaction. Plain
`CREATE INDEX` takes a brief write lock per table — acceptable pre-launch
(tables are small) and the migration is intentionally limited to indexes
on tables that are NOT yet at production scale. Post-launch, the next
similar audit should ship index DDL via a side-channel that supports
`CONCURRENTLY` (or split into per-file migrations with manual psql apply).

The 10 shipped indexes (ranked by expected impact):

1. `idx_leads_calculator_created` on `leads(calculator_id, created_date DESC)`
2. `idx_support_tickets_client_status` on `support_tickets(client_id, status, created_at DESC)`
3. `idx_ticket_messages_ticket_created` on `ticket_messages(ticket_id, created_at)`
4. `idx_ticket_events_ticket_created` on `ticket_events(ticket_id, created_at)`
5. `idx_sms_messages_calc_created` on `sms_messages(calculator_id, created_at DESC)`
6. `idx_sms_messages_lead_created` on `sms_messages(lead_id, created_at DESC)`
7. `idx_bookflow_appointments_client_start` on `bookflow_appointments(client_id, start_time)`
8. `idx_bookflow_invoices_client_created` on `bookflow_invoices(client_id, created_at DESC)`
9. `idx_notification_queue_pending` on `notification_queue(created_at)` partial WHERE status='pending'
10. `idx_followup_jobs_pending` on `followup_jobs(run_at)` partial WHERE status='pending'

Indexes deliberately deferred to a follow-up PR (need either a
`CONCURRENTLY` channel or explicit Alex sign-off because they touch
prospects / outbound which has live data already):

- `prospects (status, trade_category)`, `campaign_prospects (campaign_id, sync_status)`,
  `prospect_events (prospect_id, created_at DESC)`, `prospect_enrichment (prospect_id)`,
  all 11 `rankflow_*` `(client_id)` indexes.

## Follow-ups (separate PRs)

1. **N+1 collapse in `reputationRoutes.ts` + `portalRoutes.ts`** —
   single PR, ~50 LOC, no schema change. High user-visible win on
   reputation dashboards.
2. **Extract `_slug_redirects` to its own table** with a unique index.
   Eliminates the only meaningful JSONB scan in the codebase.
3. **Live `pg_stat_user_indexes` sweep** post-launch — identify any
   shipped index that is genuinely unused, drop it to recover write speed.
4. **Pagination audit** of every `db.select().from(...)` in `routes/` that
   lacks `.limit()` and targets a per-client growing table. Combined with
   the indexes above, the cost becomes "seek + read N", not "scan + read
   all" — so the missing `LIMIT` becomes a memory-pressure issue rather
   than a CPU issue.

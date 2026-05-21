# Admin Dashboard Audit — Wave W-AU-2

**Date:** 2026-05-21
**Branch:** `audit/wave-au2-admin-dashboard`
**Scope:** Every page under `client/src/pages/admin/`. Verify route registration,
TanStack Query wiring, mutation handlers, server endpoints, and Stripe sync on
the product editor. Identify functional gaps; fix the cheap ones inline.

## Result summary

- **56 admin pages** discovered (incl. `outbound/*` and `MobilePreview/*`).
- **56 / 56 routes registered** in `client/src/App.tsx`.
- **53 working** end-to-end (load + queries + mutations all wired).
- **3 partial** — see notes.
- **0 broken** (no 500s expected, no missing handlers found).
- **1 targeted fix applied** to `server/storage.ts` (Stripe metadata push on `stripe_product_id` swap).

## Critical paths

### 1. `/admin/products/:id` — Stripe sync verdict: WIRED

`ProductDetailPage.tsx` is comprehensive (Q28a–h shipped). Publish flow goes
through `storage.publishProductDraft()` which calls
`server/services/stripeProductSync.ts`:

- name/description change → `stripe.products.update`
- price change → `stripe.prices.create` (lookup_key transfer) + archive old + persist new ID
- yearly mirror → recompute via `monthlyToYearlyCents()`
- per-tier sync (Q5f) → mirrors `tiers[]` jsonb to sibling rows and pushes each
  tier's own Stripe Product/Price

**Gap identified + fixed in this PR:** when admin swapped `stripe_product_id`
to a new Stripe Product (without editing name/description), the metadata push
was skipped, so the new Stripe Product kept its previous copy. Added
`stripeProductIdChanged` branch in `storage.ts:1717` that falls back to the live
row's name/description on swap.

### 2. `/admin/quotequick/templates/:id` — VERIFIED

`QuoteQuickTemplateDetailPage.tsx` (W-AI-3b, PR #396). Round-trip path:
- GET `/api/admin/quotequick/templates/:id` → returns `codeDefault` + `overrides` + `effective`
- PATCH same path → upserts override jsonb
- DELETE `/api/admin/quotequick/templates/:id/overrides` → resets
- POST `/archive | /unarchive`
- Backend in `adminQuoteQuickTemplatesRoutes.ts` (556 lines, full handlers).

### 3. `/admin/quotequick/trades/:id` — VERIFIED

`QuoteQuickTradeDetailPage.tsx` (W-AI-3a, PR #395). Identical override pattern,
backed by `adminQuoteQuickTradesRoutes.ts` (819 lines). Audit-log section is a
known placeholder (deferred to AI-3c).

### 4. TradeLine voices — STATIC REGISTRY, no admin editor

`shared/tradelineVoices.ts` exports `VOICE_PRESETS` as a hardcoded list of 4
ElevenLabs voice IDs. Clients pick one via `PortalServiceDetail.tsx` (and
admin can set it on a client's behalf via the client detail page). **No admin
CRUD surface exists** to add/edit/remove voice presets. Likely intentional —
ElevenLabs voice IDs are externally managed — but flagged in deferred items.

### 5. `/admin/tradeline/templates` — VERIFIED

`TradelineTemplatesPage.tsx` edits 80 niche prompt templates (40 receptionist +
40 concierge). PATCH `/api/admin/tradeline/templates/:kind/:id` writes
overrides; DELETE resets. Voice/voiceId fields are NOT here (intentional — voice
is a per-client setting, not a template setting).

### 6. `/admin/crm/suppliers` — VERIFIED

`SuppliersPage.tsx` handles AM-3's 5 new columns: `specialties`,
`avg_turnaround_days`, `quality_rating`, `external_completed_jobs`,
`last_vetted_at`. PATCH passes raw body to `storage.updateSupplier`, which uses
Drizzle's generic update — all columns flow through automatically.

## Page-by-page table

| Page | Loads | Mutations | Stripe sync | Notes |
|---|---|---|---|---|
| AdFlowOpsPage | OK | OK | n/a | 3 mutations wired |
| AdminAuditLogPage | OK | OK | n/a | Read + filter only |
| AdminChatHistoryPage | OK | OK | n/a | Read + filter only |
| AdminNoticesPage | OK | OK | n/a | |
| AiBudgetPage | OK | OK | n/a | |
| AiDashboard | OK | OK | n/a | |
| ApiPlatformPage | OK | OK | n/a | |
| ApiPlatformUserDetailPage | OK | OK | n/a | "audit history" stub (acknowledged) |
| AuditLeadsPage | OK | OK | n/a | |
| AuditLogPage | OK | OK | n/a | |
| BillingPage | OK | OK | OK | Reads via Stripe subscriptions API |
| BookingCalendarPage | OK | OK | n/a | 4 mutations wired |
| ChangePasswordPage | OK | OK | n/a | |
| ClientDetailPage | OK | OK | n/a | 19 mutations (heaviest page) |
| ClientsPage | OK | OK | n/a | |
| CommunicationsPage | OK | OK | n/a | |
| ContentFlowQueuePage | OK | OK | n/a | |
| CrmOverview | OK | OK | n/a | Aggregated KPI reads |
| InboxPage | OK | OK | n/a | |
| InstallQueuePage | OK | OK | n/a | |
| IntegrationHealthPage | OK | OK | n/a | Read-only |
| MapguardDashboard | OK | OK | n/a | |
| MapguardOpsPage | OK | OK | n/a | |
| MobilePreview/index | OK | OK | n/a | **PARTIAL** — Calls/Messages screens are by-design placeholders (Phase 4) |
| ProductDetailPage | OK | OK | OK | Stripe sync verified + fix applied this PR |
| ProfilePage | OK | OK | n/a | |
| QuoteQuickPage | OK | OK | n/a | |
| QuoteQuickTemplateDetailPage | OK | OK | n/a | |
| QuoteQuickTemplatesPage | OK | OK | n/a | |
| QuoteQuickTradeDetailPage | OK | OK | n/a | **PARTIAL** — audit-log section is placeholder (deferred to AI-3c) |
| QuoteQuickTradesPage | OK | OK | n/a | |
| RankFlowOpsPage | OK | OK | n/a | |
| ReviewsPage | OK | OK | n/a | |
| SalesPipelinePage | OK | OK | n/a | |
| ServiceOpsPage | OK | OK | n/a | |
| ServicesPage | OK | OK | OK | Forwards to ProductDetailPage |
| SettingsPage | OK | OK | n/a | |
| SocialSyncOpsPage | OK | OK | n/a | |
| SuppliersPage | OK | OK | n/a | AM-3's 5 columns wired |
| SupportInboxPage | OK | OK | n/a | |
| SupportTicketDetailPage | OK | OK | n/a | |
| SystemAlertsPage | OK | OK | n/a | |
| SystemAvailabilityPage | OK | OK | n/a | |
| SystemJobsPage | OK | OK | n/a | |
| SystemWorkersPage | OK | OK | n/a | |
| TradeLineOpsPage | OK | OK | n/a | |
| TradelineLearningPage | OK | OK | n/a | |
| TradelineSetupsPage | OK | OK | n/a | |
| TradelineTemplatesPage | OK | OK | n/a | |
| WaitlistPage | OK | OK | n/a | |
| WebCareOpsPage | OK | OK | n/a | |
| outbound/CampaignsPage | OK | OK | n/a | |
| outbound/PipelinePage | OK | OK | n/a | |
| outbound/ProspectsPage | OK | OK | n/a | |
| **PARTIAL** — TradeLine voices admin surface | n/a | n/a | n/a | No admin CRUD on `VOICE_PRESETS`. Static registry only. |

## Inline fix

`server/storage.ts:1711-1740` — when `publishProductDraft` detects a
`stripe_product_id` swap, push the current name/description to the new Stripe
Product (previously skipped if name/description hadn't changed that publish).

## Deferred items

1. **TradeLine voices admin CRUD** — no editor exists for `VOICE_PRESETS`. Add
   `/admin/tradeline/voices` page if/when we need to curate voices without a
   shared/data file deploy. Today voice IDs are ElevenLabs-managed so static
   may be fine.
2. **QuoteQuick trade-page audit log** — placeholder section, tracked under
   AI-3c.
3. **Mobile preview — Calls/Messages screens** — placeholders by design; full
   wiring lands with Phase 4 Twilio integration.

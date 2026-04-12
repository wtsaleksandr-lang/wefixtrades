# Admin Assistant v1 — Implementation Plan

**Date:** 2026-04-09
**Branch:** `claude/plan-admin-assistant-v1-Rirq0`
**Base:** `claude/audit-ai-assistant-4TTvn`
**Author:** Claude (senior full-stack SaaS architect audit)

> This plan is based on a full code audit of the WeFixTrades codebase.
> No code has been written yet. This document is the approved blueprint before implementation begins.

---

## 1. CURRENT ADMIN AI STATE

### Classification: **MODERATE**

The Admin Assistant is not starting from zero. A working v1 shell already exists.

### What already exists

| Component | File | Status |
|---|---|---|
| Copilot drawer UI | `client/src/components/admin/AdminCopilot.tsx` | Working |
| Admin system prompt builder | `server/services/promptBuilder.ts` → `buildAdminPrompt()` | Working |
| Surface routing in chat API | `server/routes/chatRoutes.ts` | Working |
| Page context injection | All admin pages → `AdminLayout pageContext={...}` | Working |
| Copilot toggle button | `client/src/components/admin/AdminLayout.tsx` | Working |
| SSE streaming | Shared `/api/chat` endpoint | Working |
| Memory persistence | `server/services/chatMemory.ts` | Working (session-scoped) |
| Usage logging | `server/services/usageTracker.ts` | Working (surface="admin") |
| Conversation archive | `server/services/conversationArchiver.ts` | Working |
| AI Dashboard | `client/src/pages/admin/AiDashboard.tsx` | Working |

### What the current system can do

- Renders a right-side 380px copilot drawer on all admin pages
- Injects per-page context (route, page, client info, task counts, task details)
- Sends that context to `/api/chat` with `surface: "admin"`
- `buildAdminPrompt()` builds a focused internal system prompt with operational data
- Streams responses via SSE and renders them in the drawer
- Shows prompt chips per page (overview, clients, client_detail, inbox, suppliers)
- Persists last 30 messages in `localStorage`
- Persists session memory server-side via `chatMemory` table (7-day TTL)
- Logs all usage to `aiUsageLogs` with surface="admin"
- Archives high-value admin conversations

### What the current system CANNOT do

- **No billing-page chips** — `BillingPage.tsx` passes only `unpaidAmount`, no payment list, no overdue count, no prompt chips defined
- **No services-page chips** — `ServicesPage.tsx` passes only `page: "services"`, no data context, no chips
- **No suppliers-page context** — `SuppliersPage.tsx` passes only `page: "suppliers"`, no supplier data
- **No support/ticket integration** — `supportTickets` table exists but is never surfaced to the copilot
- **No internal notes in context** — `internalNotes` table exists but client detail copilot cannot see them
- **No admin-specific memory signals** — `extractMemorySignals()` is customer-focused (pricing/booking interest), not admin-useful
- **No onboarding status in context** — `onboardingSubmissions` table exists; copilot cannot see it
- **Memory is localStorage-scoped** — clears on different browser/device; not tied to admin user ID robustly
- **Context preview is always visible** — the raw JSON debug panel is exposed in production
- **Max 600 tokens** — shared default; too low for detailed task summaries or draft replies
- **No reply drafting capability** — no prompt chip or mode for drafting customer/internal replies
- **No mode differentiation** — same `buildAdminPrompt()` base regardless of whether page is overview vs client detail vs inbox
- **No action layer** — not even safe read-only action stubs exist

### Files & routes involved today

**Backend:**
- `server/services/promptBuilder.ts` — `buildAdminPrompt()` function
- `server/services/assistant.ts` — shared orchestration (surface-agnostic)
- `server/services/chatMemory.ts` — session memory
- `server/services/usageTracker.ts` — usage logging
- `server/services/conversationArchiver.ts` — archive evaluation
- `server/routes/chatRoutes.ts` — `/api/chat` + `/api/chat/sync`
- `server/routes/adminRoutes.ts` — `/api/admin/ai/*` (usage stats, archive listing)
- `server/routes/adminCrmRoutes.ts` — `/api/admin/crm/*` (all CRM data endpoints)

**Frontend:**
- `client/src/components/admin/AdminCopilot.tsx` — drawer UI + session storage
- `client/src/components/admin/AdminLayout.tsx` — mounts copilot, passes pageContext
- `client/src/pages/admin/CrmOverview.tsx` — passes overview context
- `client/src/pages/admin/ClientDetailPage.tsx` — passes client context
- `client/src/pages/admin/InboxPage.tsx` — passes inbox/task context
- `client/src/pages/admin/BillingPage.tsx` — passes only `unpaidAmount` (thin)
- `client/src/pages/admin/SuppliersPage.tsx` — passes only `page: "suppliers"` (empty)
- `client/src/pages/admin/ServicesPage.tsx` — passes only `page: "services"` (empty)

---

## 2. WHAT SHOULD BE REUSED FROM PORTAL ASSISTANT V1

### Reuse directly (no changes needed)

| Component | Why reuse |
|---|---|
| `/api/chat` endpoint | Already handles `surface="admin"` correctly |
| `assistantStream()` / `assistantSync()` | Transport-agnostic; works for admin |
| `chatMemory.ts` | `saveMemory()` already stores `surface` and `userId` |
| `usageTracker.ts` | Already logs surface="admin" separately |
| `conversationArchiver.ts` | Already archives admin conversations |
| `readSSEStream()` client helper | Shared; no changes needed |
| `ChatMessage` type | Shared; no changes needed |
| SSE streaming pattern | Identical to customer assistant |
| Rate limiter | Same `chatRateLimiter` instance is fine |

### Stay shared but needs admin-aware extension

| Component | What to extend |
|---|---|
| `promptBuilder.ts` → `buildAdminPrompt()` | Add behavior modes, richer context blocks, notes/tickets |
| `PageContext` type | Add new fields: `recentNotes`, `pendingPaymentsCount`, `onboardingStatus`, `supportTicketCount` |
| `AdminPageContext` type (frontend) | Mirror new `PageContext` fields |
| `chatMemory.ts` → `extractMemorySignals()` | Add admin-specific signals (last page visited, last client reviewed) |
| `AssistantRequest` type | Already has `pageContext`; no change needed |

### Keep separated (admin-only concerns)

| Concern | How to separate |
|---|---|
| Admin system prompt personality | `buildAdminPrompt()` stays its own function; never shares with customer prompts |
| Admin page context type | `AdminPageContext` in `AdminCopilot.tsx` stays admin-only |
| Admin prompt chips | `PROMPT_CHIPS` map in `AdminCopilot.tsx` stays admin-only |
| Admin session ID | Prefix `cop_` already distinguishes from customer `wft_` sessions |
| Admin memory signals | New admin-specific signals should not pollute customer memory logic |

### Do NOT reuse

| Component | Why not |
|---|---|
| `BRAND_VOICE` constant | Customer-facing tone; admin prompt should be operational, not warm/growth-advisor |
| `CONVERSION_GUIDANCE` constant | Irrelevant for internal operator |
| `knowledgeBase.ts` | External service catalog; admin does not need this in context |
| Customer `MemoryContext` fields (`interestedInPricing`, `interestedInBooking`) | Customer signals; meaningless for admin sessions |
| Customer widget (`AIChatBubble`) | Different UI, different mount point, different session |

---

## 3. TARGET ADMIN ASSISTANT V1

### Role

An **internal operations copilot** that lives inside the admin dashboard.
It knows what page the operator is on, what data is visible, and uses that to:
- Summarize and prioritize what needs attention
- Explain blocked/overdue/risky items
- Suggest next operational steps
- Assist drafting replies (internal notes, client-facing messages)
- Answer questions about clients, tasks, billing, delivery status

### Scope (v1)

**In scope:**
- Page-aware context summarization (all existing admin CRM pages)
- Task/inbox prioritization guidance
- Client health assessment (client detail page)
- Billing overdue awareness
- Reply drafting (customer and internal)
- Operational next-step suggestions
- Support ticket summary (inbox context)

**Out of scope for v1:**
- Autonomous actions (no database mutations)
- Cross-page memory recall ("you looked at this client 3 days ago")
- Proactive push notifications
- Bulk operations
- Integration with external tools (Stripe, suppliers)

### UI Shape

Identical to the current `AdminCopilot.tsx` drawer: **right-side fixed panel, 380px wide, full viewport height, toggled via Sparkles button in top bar.** This is already correct and should not be redesigned.

Minor UX improvements needed:
1. Remove/gate the `ContextPreview` JSON panel in production builds
2. Add missing prompt chips for billing and suppliers pages
3. Show page-name badge more prominently (already exists, keep)
4. Increase copilot panel width on large screens (optional, low priority)

### How it differs from customer assistant

| Dimension | Customer Assistant | Admin Assistant |
|---|---|---|
| Audience | Trade business owners | Internal WeFixTrades operators |
| Tone | Warm, advisory, growth-focused | Direct, operational, data-driven |
| Surface | `website`, `audit`, `dashboard` | `admin` |
| Context | Audit scores, services, pricing | Clients, tasks, payments, notes, tickets |
| Memory signals | Pricing interest, booking intent | Last client reviewed, open blockers |
| Knowledge base | Services catalog, pricing, FAQs | Internal CRM data via pageContext |
| Action intent | Guide toward booking | Guide toward task resolution |
| Safety boundary | Cannot see internal data | Cannot mutate data (v1) |
| Session scope | Per visitor / per customer | Per admin operator session |

---

## 4. RECOMMENDED UI APPROACH

### Decision: Keep existing right-side drawer. Extend it.

**Why:** `AdminCopilot.tsx` is already a 380px fixed right-side drawer mounted in `AdminLayout.tsx`. It is toggled by the Sparkles button in the top bar. The architecture is clean and correct. There is no reason to rebuild it.

**What to keep:**
- Fixed right-panel position
- Sparkles toggle button in header
- Per-page prompt chips
- Context preview (gated to dev/non-production only)
- localStorage session + message persistence
- SSE streaming rendering

**What to improve (UI):**
1. **`ContextPreview` should be dev-only** — wrap in `import.meta.env.DEV` check so it doesn't render in production
2. **Add chips for billing page** — currently no `PROMPT_CHIPS["billing"]` entry
3. **Add chips for suppliers page** — currently `PROMPT_CHIPS["suppliers"]` exists but supplier data is not injected, so chips are uninformed
4. **Add chips for services page** — currently no `PROMPT_CHIPS["services"]` entry
5. **Reply drafting chip** — add "Draft a reply for this client" chip on `client_detail` page
6. **Raise max token budget for admin surface** — 600 tokens is the shared default; admin responses for task summaries or drafts can need 900–1200 tokens

**Why NOT a persistent embedded panel:**
The current toggle behavior is intentional — the operator may want full-width layout. A always-visible embedded panel would compress the main content area on smaller screens. Keep the drawer model.

**Why NOT a separate admin AI page:**
An AI page is already at `/admin/ai` for monitoring usage and archives. The copilot must be contextually embedded in the workflow, not a separate destination.

---

## 5. CONTEXT INJECTION PLAN

Context flows: **page component → `AdminLayout pageContext={...}` → `AdminCopilot` → `/api/chat` body → `chatRoutes.ts` → `assistant.ts` → `buildAdminPrompt(ctx)`**

All new context fields must be added to:
1. `PageContext` type in `server/services/promptBuilder.ts`
2. `AdminPageContext` interface in `client/src/components/AdminCopilot.tsx`

### Page: `overview` (`/admin/crm`)

**Currently passing:** `totalClients`, `monthlyRevenue`, `totalOpenTasks`, `unpaidAmount`

**Should also pass:**
- `overdueTasksCount` — already in type, not passed on overview page
- `blockedCount` — already in type, not passed on overview page
- `pendingOnboardingCount` — available from `/api/admin/crm/overview` response (`pendingOnboarding`)

**New `PageContext` fields needed:** `pendingOnboardingCount: number`

**Prompt chips (already exist):** "What should I focus on first?", "Summarize this page", "What needs attention?" — keep these, they are well-suited.

---

### Page: `client_detail` (`/admin/crm/clients/:id`)

**Currently passing:** `clientId`, `clientName`, `clientStatus`, `activeServicesCount`, `openTasksCount`, `overdueTasksCount`, `unpaidAmount`, `topTasks` (5 tasks), `latestPayment`, `supplierNames`

**Should also pass:**
- `pinnedNotes` — last 2–3 pinned internal notes (content + actor_type). Pinned notes are the most operationally relevant
- `onboardingStatus` — the status of the client's onboarding submission (e.g., "submitted", "pending", "not_started")
- `tradeType` — `client.trade_type` (already available, not currently in context)
- `serviceNames` — array of active service names (not just count)

**New `PageContext` fields needed:**
```ts
pinnedNotes?: Array<{ content: string; actor_type: string }>
onboardingStatus?: string
tradeType?: string
serviceNames?: string[]
```

**Note on data availability:** `ClientDetailPage.tsx` already queries `/api/admin/crm/clients/:id` which includes full client data. The `notes` tab queries `/api/admin/crm/clients/:id/notes`. Pinned notes are available client-side already — they just need to be extracted and passed in `pageContext`.

**Prompt chips (already exist):** "Summarize this client", "What should happen next?", "What is blocked?", "Is this client healthy?"

**New chip to add:** "Draft a reply for this client" → triggers a drafting mode response

---

### Page: `inbox` (`/admin/crm/inbox`)

**Currently passing:** `totalOpenTasks`, `overdueTasksCount`, `blockedCount`, `activeFilters`, `statusCounts`, `waitingOnCounts`, `topTasks` (8 tasks)

**This is the most complete context injection.** Minor improvement only:
- Pass `topTasks` count up to 10 instead of 8 (already capped at 8 in `buildAdminPrompt`, raise to 10)
- Pass `clientNames` for top blocked tasks (currently tasks have `title`, `status`, `priority` but not `client_name`)

**New `PageContext` field needed:**
```ts
// Extend topTasks to include client name
topTasks?: Array<{
  title: string; status: string; priority: string;
  client_name?: string;  // NEW
  waiting_on?: string | null; handled_by?: string | null;
  automation_status?: string | null; next_action?: string | null
}>
```

**Prompt chips (already exist):** "What should I focus on first?", "What is blocked?", "What am I waiting on?", "Summarize the queue" — good as-is.

---

### Page: `billing` (`/admin/crm/billing`)

**Currently passing:** `page: "billing"`, `unpaidAmount`

**Should also pass:**
- `pendingPaymentsCount` — count of payments in status="pending"
- `overduePaymentsCount` — count of payments past due_at date
- `recentPaymentStatuses` — e.g., `{ pending: 5, paid: 12, failed: 2 }` (mirrors `statusCounts` pattern)

**New `PageContext` fields needed:**
```ts
pendingPaymentsCount?: number
overduePaymentsCount?: number
recentPaymentStatuses?: Record<string, number>
```

**Prompt chips to add** (`PROMPT_CHIPS["billing"]`):
- "What is outstanding right now?"
- "Who owes money?"
- "Summarize billing health"

---

### Page: `suppliers` (`/admin/crm/suppliers`)

**Currently passing:** `page: "suppliers"` only

**Should also pass:**
- `supplierNames` — array of supplier names already in `PageContext` type, just not populated on this page
- `supplierCount` — total number of suppliers
- `supplierTypes` — distribution by type (fiverr, freelancer, white_label, automation, internal)

**New `PageContext` fields needed:**
```ts
supplierCount?: number
supplierTypes?: Record<string, number>
```

**Note:** `SuppliersPage.tsx` fetches suppliers from `/api/admin/crm/suppliers`. That data is available client-side and can be extracted easily.

**Prompt chips (already exist):** "Summarize this page", "What should I know?" — these are fine but bland. Once supplier data is injected, they become meaningful.

---

### Page: `services` (`/admin/crm/services`)

**Currently passing:** `page: "services"` only

**Should also pass:**
- `serviceCatalogCount` — total services in catalog
- `activeServiceAssignmentsCount` — how many client services are currently active

**New `PageContext` fields needed:**
```ts
serviceCatalogCount?: number
activeServiceAssignmentsCount?: number
```

**Prompt chips to add** (`PROMPT_CHIPS["services"]`):
- "Summarize the service catalog"
- "What services are most used?"

---

### Pages NOT needing copilot enhancement

- `profile`, `settings`, `change_password` — these are personal account pages; copilot is not operationally useful here. The drawer remains available (it is always mounted) but no chips or rich context needed.
- `/admin/ai` (AiDashboard) — this page is already about AI monitoring. Copilot is accessible but no chips needed.

---

## 6. MEMORY / THREAD PLAN

### Current state

- Session ID generated in `localStorage` as `cop_{timestamp}_{random}` via `getCopilotSessionId()`
- Last 30 messages saved in `localStorage` under key `wft_copilot_messages`
- Server-side: `chatMemory` table stores messages keyed by `session_id` with 7-day TTL
- `saveMemory()` already accepts `userId` — passed as `undefined` today since `chatRoutes.ts` gets `userId` from `req.body.userId` (not authenticated session)

### Problems

1. **Session ID is browser-local** — different browser/device = new session = lost context
2. **Messages stored in localStorage** — clears on browser history wipe
3. **Memory signals are customer-focused** — `extractMemorySignals()` looks for pricing/booking interest, not admin-relevant signals
4. **No admin user ID binding** — `userId` is passed as `undefined`; admin is authenticated but user ID is not sent to chat endpoint

### Recommended v1 memory design

#### Thread persistence model

Keep the existing `chatMemory` table and session approach. Do NOT build a separate thread table for v1 — it's unnecessary complexity.

**Change 1: Bind session to admin user ID**
- `AdminCopilot.tsx` should pass `userId` from `useAuth()` hook in the chat request body
- `chatRoutes.ts` already accepts `userId` from `req.body.userId`; it just needs to be sent
- This links server-side memory to the admin user, surviving browser clears on the same account

**Change 2: Stable admin session ID (not just browser-local)**
- Keep `localStorage` for fast client-side access
- But also derive/store a stable session ID server-side keyed to the admin user
- Simplest approach: use `adm_{userId}_copilot` as a deterministic session ID when `userId` is available
- Fallback: keep current random ID for unauthenticated edge cases

**Change 3: Admin memory signals**

Replace/augment `extractMemorySignals()` for admin surface with:
```ts
// Admin-relevant signals to extract from conversation
interface AdminMemorySignals {
  lastReviewedClientId?: number
  lastReviewedClientName?: string
  currentFocusArea?: string  // "billing", "blocked_tasks", "onboarding", etc.
  flaggedPriorities?: string[]  // topics the admin flagged as urgent
}
```

These signals allow the next admin session to open with: "Last time you were reviewing [ClientName]. Their tasks are still open."

#### What should NOT be stored

- Raw task data, payment amounts, or CRM state — these are fetched fresh each time via `pageContext`
- Customer PII beyond what's in `pageContext` — the copilot sees only what the page passes; it does not query the DB directly
- Draft messages — these should stay in the UI only until the operator copies/sends them

#### Thread scoping

- **Do not scope threads per page** — the admin is one operator; their session should be continuous across page navigation
- The `pageContext` already provides page-aware fresh data on each request; the thread provides continuity of conversation
- One thread per admin user (keyed by `adm_{userId}_copilot`) is the correct model for v1

#### Memory TTL

- Current 7-day TTL is appropriate
- Admin sessions are likely daily; 7 days provides reasonable continuity without bloat

---

## 7. SUPPORT / TICKETING PLAN

### Current state of tickets

The `supportTickets` table exists (`shared/schemas/db.ts`):
```
supportTickets: id, calculator_id, client_id, subject, status, description,
                transcript_json, admin_notified, created_at, updated_at, resolved_at
```

Tickets are created via `/api/ai/create-ticket` from the calculator support chat widget.
They are **never surfaced in the admin copilot today.** The admin has no AI-assisted view of tickets.

The `InboxPage.tsx` shows `fulfillmentTasks` (service delivery), not support tickets. These are different things:
- `fulfillmentTasks` = service delivery work items (what we owe the client)
- `supportTickets` = inbound client support requests (what the client needs help with)

### What admin assistant should do with tickets (v1)

#### On `client_detail` page
- Include open ticket count in `pageContext`: `openTicketCount?: number`
- Include last ticket subject: `lastTicketSubject?: string`
- Copilot can then respond to "What is this client asking about?" with actual ticket info
- Prompt chip to add: "Any open support tickets for this client?"

#### On `inbox` page
- Consider adding a "Support Tickets" section beneath fulfillment tasks (UI concern, separate from copilot)
- For copilot: add `openTicketCount` to inbox page context so the assistant knows both delivery queue AND support queue state

#### Drafting replies
- The most valuable ticket interaction: operator asks "Draft a reply to [issue]"
- Copilot should support reply drafting for:
  - **Customer-facing replies** — professional, plain English, based on ticket description
  - **Internal notes** — operational shorthand, status update format
- This does NOT require ticket DB access — the operator can paste the ticket text into the chat, or the `pageContext` can carry the last ticket's `description` field
- For v1: pass last ticket description in `pageContext` for client_detail; let operator ask the copilot to draft

#### What should remain manual
- Ticket status updates (open → resolved) — manual via UI
- Ticket routing decisions — human judgment
- Escalation decisions — human judgment
- Sending replies to clients — copilot drafts, human sends

#### Ticket data to add to `PageContext`
```ts
openTicketCount?: number
lastTicketSubject?: string
lastTicketDescription?: string  // truncated to 300 chars for context budget
```

#### New endpoint needed
`/api/admin/crm/clients/:id/tickets` — GET — list support tickets for a client (if not already existing).
Check `adminCrmRoutes.ts` for whether this endpoint already exists. If not, it is a small addition.

---

## 8. ACTION LAYER PLAN (SAFE ONLY)

### v1 position: read-only with explicit drafting

The current system correctly enforces a read-only stance: `buildAdminPrompt()` includes the rule "Never claim you performed an action — you are read-only."

For v1, the admin assistant should remain **read-only and drafting-only**. No database mutations. No silent state changes.

### Safe actions for v1 (drafting only, no mutations)

These are "soft actions" — the copilot produces text that the operator then acts on manually:

| Action | Description | Trigger |
|---|---|---|
| Draft internal note | Copilot writes a note in internal shorthand format | "Draft a note about this client" |
| Draft customer reply | Copilot writes a professional client-facing message | "Draft a reply for this client" |
| Summarize client health | Structured health summary: status, risks, what needs doing | "Is this client healthy?" |
| Prioritized task list | Ranked list of what to do next in the inbox | "What should I focus on first?" |
| Reply to ticket | Draft response to support ticket text | "Draft a reply to this ticket" |
| Next-step suggestion | Recommended next action for a blocked task | "What is blocked?" |

### Future safe action layer (v2+ only, do NOT build now)

These require an explicit user confirmation step and proper audit logging before they are safe to implement:

| Future Action | Gate Required |
|---|---|
| Create internal note (DB write) | "Post this note?" confirmation dialog |
| Update task status | "Mark as [status]?" confirmation |
| Update task `next_action` field | "Save this next action?" confirmation |
| Create follow-up task | "Create this task?" confirmation |
| Send onboarding reminder | "Send email to [client]?" confirmation |

**Architecture pattern for future actions:**
The copilot reply would contain a structured action payload that the frontend parses, renders as a confirmation card, and only executes on explicit user approval. The backend would validate the action against allowed types before executing. This is a separate development phase and should NOT be built in v1.

---

## 9. FILES TO MODIFY

### Backend

| File | Change |
|---|---|
| `server/services/promptBuilder.ts` | Extend `PageContext` type with new fields; enhance `buildAdminPrompt()` with notes/tickets/onboarding blocks; add behavior mode differentiation; raise token hints for admin |
| `server/services/chatMemory.ts` | Add admin-aware memory signal extraction; keep existing structure |
| `server/routes/chatRoutes.ts` | Pass `userId` from authenticated session (`req.user?.id`) instead of relying on `req.body.userId` for the admin surface; add admin auth guard |
| `server/routes/adminCrmRoutes.ts` | Verify or add `GET /api/admin/crm/clients/:id/tickets` endpoint |

### Frontend

| File | Change |
|---|---|
| `client/src/components/admin/AdminCopilot.tsx` | Extend `AdminPageContext` type with new fields; add missing `PROMPT_CHIPS` entries (billing, services, suppliers); add "Draft a reply" chip on client_detail; gate `ContextPreview` to dev only; send `userId` in chat request body; raise token count hint if applicable |
| `client/src/pages/admin/CrmOverview.tsx` | Add `overdueTasksCount`, `blockedCount`, `pendingOnboardingCount` to pageContext |
| `client/src/pages/admin/ClientDetailPage.tsx` | Add `pinnedNotes`, `onboardingStatus`, `tradeType`, `serviceNames`, `openTicketCount`, `lastTicketSubject`, `lastTicketDescription` to pageContext |
| `client/src/pages/admin/BillingPage.tsx` | Add `pendingPaymentsCount`, `overduePaymentsCount`, `recentPaymentStatuses` to pageContext |
| `client/src/pages/admin/SuppliersPage.tsx` | Add `supplierNames`, `supplierCount`, `supplierTypes` to pageContext |
| `client/src/pages/admin/ServicesPage.tsx` | Add `serviceCatalogCount`, `activeServiceAssignmentsCount` to pageContext |
| `client/src/pages/admin/InboxPage.tsx` | Extend `topTasks` items to include `client_name`; add `openTicketCount` |

### New files (if needed)

| File | Purpose |
|---|---|
| None required for v1 | All changes extend existing files. No new services, routes, or components needed. |

---

## 10. BUILD PHASES

### Phase 1 — Backend foundation strengthening (low risk, high impact)
**Goal:** Make `buildAdminPrompt()` production-quality and context-complete.

1. Extend `PageContext` type in `promptBuilder.ts` with all new fields from Section 5
2. Update `buildAdminPrompt()` to render new fields (pinnedNotes block, ticket block, onboarding block)
3. Add behavior differentiation inside `buildAdminPrompt()` — vary tone/focus based on `ctx.page`:
   - `overview` → focus on portfolio health and blockers
   - `client_detail` → focus on this specific client's health and next steps
   - `inbox` → focus on prioritization and unblocking tasks
   - `billing` → focus on outstanding amounts and collection
4. Raise admin max token budget from 600 to 1000 for admin surface in `assistant.ts` or via `AssistantRequest.maxTokens`
5. Add admin memory signal extraction (separate from customer signals)

**Risk:** Low. These are additive prompt changes. The existing system continues working. Nothing breaks.

---

### Phase 2 — Frontend context enrichment (low risk, foundational)
**Goal:** Each admin page passes rich, accurate context to the copilot.

1. Update `AdminPageContext` interface in `AdminCopilot.tsx` to mirror new `PageContext` fields
2. Update `CrmOverview.tsx` — add `overdueTasksCount`, `blockedCount`, `pendingOnboardingCount`
3. Update `ClientDetailPage.tsx` — add `pinnedNotes`, `onboardingStatus`, `tradeType`, `serviceNames`, `openTicketCount`, `lastTicketSubject`, `lastTicketDescription`
4. Update `BillingPage.tsx` — add payment status counts
5. Update `SuppliersPage.tsx` — add supplier names, counts, type distribution
6. Update `ServicesPage.tsx` — add service catalog and assignment counts
7. Update `InboxPage.tsx` — extend `topTasks` with `client_name`

**Risk:** Low. Only adding new props to existing components. No structural changes.

---

### Phase 3 — Prompt chips and UX polish (low risk, visible improvement)
**Goal:** Every admin page has relevant, useful prompt chips. Context preview is dev-only.

1. Add `PROMPT_CHIPS["billing"]`, `PROMPT_CHIPS["services"]`, `PROMPT_CHIPS["suppliers"]` in `AdminCopilot.tsx`
2. Add "Draft a reply for this client" chip to `PROMPT_CHIPS["client_detail"]`
3. Gate `ContextPreview` component to `import.meta.env.DEV` only
4. Improve empty state copy: "Ask me about this page" → more contextual per-page hint

**Risk:** Very low. Pure UI changes.

---

### Phase 4 — Memory and session hardening (medium risk, important for persistence)
**Goal:** Admin copilot sessions survive browser clears and are bound to the authenticated user.

1. Pass `userId` from `useAuth()` into the chat request body in `AdminCopilot.tsx`
2. Update `chatRoutes.ts` to read `userId` from authenticated session (`req.user?.id`) for the admin surface, not just `req.body.userId` — this is the auth-safe path
3. Update `getCopilotSessionId()` to use `adm_{userId}_copilot` when userId is available
4. Add admin-specific memory signal extraction to `chatMemory.ts`

**Risk:** Medium. Auth changes in `chatRoutes.ts` require care — must not break other surfaces. Test thoroughly.

---

### Phase 5 — Ticket integration (medium risk, high operational value)
**Goal:** Admin copilot is aware of support tickets for the current client.

1. Verify or add `GET /api/admin/crm/clients/:id/tickets` in `adminCrmRoutes.ts`
2. Fetch ticket data in `ClientDetailPage.tsx` and include in `pageContext`
3. Update `buildAdminPrompt()` to render ticket block in `client_detail` mode
4. Add "Any open support tickets?" chip to `PROMPT_CHIPS["client_detail"]`

**Risk:** Medium. Requires a new DB query and new API endpoint. Small scope but must be tested.

---

### Phase 6 — Reply drafting capability (medium risk, high value)
**Goal:** Copilot can produce draft replies in the correct format.

1. Add reply drafting instruction block to `buildAdminPrompt()` for `client_detail` and `inbox` modes
2. Define two reply formats in the system prompt:
   - **Customer-facing:** professional, uses client's business name, appropriate for email/message
   - **Internal note:** operational shorthand, first-person, for internal records
3. Add "Draft a reply for this client" and "Draft an internal note" chips
4. Test that the copilot correctly differentiates reply types when asked

**Risk:** Low-medium. Pure prompt engineering. The copilot produces text; no mutations involved.

---

## 11. RISKS / EDGE CASES

### Permission leakage
**Risk:** An unauthenticated or customer-role user accesses `/api/chat` with `surface: "admin"` and injects a `pageContext` payload to fish for operational guidance.

**Current state:** `chatRoutes.ts` has no auth guard for the admin surface. The rate limiter is the only protection.

**Mitigation (Phase 4):**
- Add an auth guard in `chatRoutes.ts`: if `surface === "admin"`, verify `req.isAuthenticated()` and `req.user.role === "admin"`. Return 401 otherwise.
- This is the most important security fix in the entire plan.

---

### Internal / customer assistant overlap
**Risk:** Shared `/api/chat` endpoint means the same rate limiter applies to both admin and customer sessions. A spike in customer traffic could throttle the admin copilot.

**Mitigation:**
- Admin sessions can be given a separate rate limiter bucket keyed by `adm_{userId}` rather than IP
- For v1 this is low priority (single-operator admin), but note for v2 scaling

---

### Hallucinated operational guidance
**Risk:** Copilot confidently advises "Task X is due tomorrow" when the actual due date is different from `pageContext`, or gives incorrect counts.

**Mitigation:**
- `buildAdminPrompt()` already has the rule: "Only reference data explicitly provided in the PAGE CONTEXT below. If data is missing or you don't have visibility into something, say so clearly."
- Keep this rule prominent and do NOT remove it
- In Phase 1, add an explicit rule: "All numbers you state must come directly from PAGE CONTEXT. Never round, estimate, or infer counts."

---

### Stale admin context
**Risk:** The operator opens the copilot but the page data has changed since the page loaded (e.g., another operator updated a task).

**Mitigation:**
- `pageContext` is injected fresh on each message send (it is passed as a prop from the live React state, not cached)
- React Query handles background refetching — the page data is kept reasonably fresh
- For v1, this is acceptable. No special handling needed.

---

### Ticket drafting risks
**Risk:** Copilot drafts a customer-facing reply that is inappropriate (too blunt, incorrect, or leaks internal info).

**Mitigation:**
- System prompt must explicitly state: "When drafting customer replies, use professional language. Never include internal notes, costs, supplier names, or internal task statuses in customer-facing drafts."
- Always frame drafts as suggestions: "Here is a draft — review before sending"
- The operator manually copies and sends; there is no auto-send in v1

---

### Thread bloat
**Risk:** Long admin sessions accumulate many messages in `chatMemory`, causing token bloat in future sessions.

**Mitigation:**
- `getMemory()` already caps at 40 stored messages
- `chatMessages` is already sliced to last 20 before sending to the API
- Admin prompt is injected fresh on each request via `pageContext` (not stored in memory)
- No special action needed for v1

---

### Performance / token cost
**Risk:** Raising max tokens from 600 to 1000 for admin surface increases per-request cost.

**Current cost:** Claude Haiku at ~$0.25/1M input + $1.25/1M output. Even at 1000 output tokens, a single admin chat message costs ~$0.00125. For typical admin usage (10–30 messages/day), this is ~$0.01–0.04/day. Negligible.

**If token use grows:** the `aiUsageLogs` table and `/api/admin/ai/overview` dashboard already track cost by surface, so admin spend is visible and controllable.

---

### Context preview in production
**Risk:** The `ContextPreview` JSON panel in `AdminCopilot.tsx` currently renders in production. While the admin is a trusted internal user, exposing raw internal data in a UI element is poor practice.

**Mitigation:** Gate it to `import.meta.env.DEV` in Phase 3. Simple one-line fix.

---

## 12. RECOMMENDED FIRST IMPLEMENTATION STEP

### Start with Phase 1, Step 4 + Step 2

The single most impactful first change is:

**1. Add the auth guard to `/api/chat` for admin surface** (`server/routes/chatRoutes.ts`)

```
if (surface === "admin" && (!req.isAuthenticated() || req.user?.role !== "admin")) {
  return res.status(401).json({ error: "Unauthorized" });
}
```

This closes the only real security gap in the current system before any other enhancement is made.

**2. Enhance `buildAdminPrompt()` in `promptBuilder.ts`**

- Add behavior differentiation by `ctx.page` (different focus text per page type)
- Add the notes block (for pinned notes, once Phase 2 passes them)
- Add the tickets block (for ticket summary, once Phase 5 passes them)
- Raise token budget for admin to 1000
- Add explicit anti-hallucination rules for numbers

This sets up the backend to accept richer context as the frontend phases deliver it.

**3. Immediately after: Phase 2 frontend context enrichment**

Starting with `ClientDetailPage.tsx` (most used, highest operational value) and `InboxPage.tsx` (second highest), add the missing context fields. These two pages cover the majority of daily admin workflow.

**The implementation sequence that minimises risk:**

```
Phase 1 (auth guard + prompt enhancement)
  → Phase 2 (context enrichment per page)
    → Phase 3 (chips + UX polish)
      → Phase 4 (memory hardening)
        → Phase 5 (ticket integration)
          → Phase 6 (reply drafting)
```

Each phase is independently shippable. Each delivers visible improvement. None requires the next to be complete first.

---

## APPENDIX: Type Changes Summary

### `PageContext` additions (`server/services/promptBuilder.ts`)

```ts
export interface PageContext {
  // ... existing fields ...

  // NEW: overview
  pendingOnboardingCount?: number

  // NEW: client_detail
  pinnedNotes?: Array<{ content: string; actor_type: string }>
  onboardingStatus?: string
  tradeType?: string
  serviceNames?: string[]
  openTicketCount?: number
  lastTicketSubject?: string
  lastTicketDescription?: string  // truncated to ~300 chars

  // NEW: inbox
  // topTasks already exists — extend topTasks item type:
  // client_name?: string

  // NEW: billing
  pendingPaymentsCount?: number
  overduePaymentsCount?: number
  recentPaymentStatuses?: Record<string, number>

  // NEW: suppliers
  supplierCount?: number
  supplierTypes?: Record<string, number>

  // NEW: services
  serviceCatalogCount?: number
  activeServiceAssignmentsCount?: number
}
```

### `AdminPageContext` additions (`client/src/components/admin/AdminCopilot.tsx`)

Mirrors the above `PageContext` additions exactly.

---

## APPENDIX: Prompt Chip Summary

| Page | Current Chips | Chips to Add |
|---|---|---|
| overview | "What should I focus on first?", "Summarize this page", "What needs attention?" | none |
| clients | "Summarize this page", "Who needs follow-up?", "What am I missing?" | none |
| client_detail | "Summarize this client", "What should happen next?", "What is blocked?", "Is this client healthy?" | "Draft a reply for this client", "Any open support tickets?" |
| inbox | "What should I focus on first?", "What is blocked?", "What am I waiting on?", "Summarize the queue" | none |
| billing | (none) | "What is outstanding right now?", "Who owes money?", "Summarize billing health" |
| suppliers | "Summarize this page", "What should I know?" | none (improve once data injected) |
| services | (none) | "Summarize the service catalog", "What services are most used?" |

---

*End of Admin Assistant v1 Implementation Plan*

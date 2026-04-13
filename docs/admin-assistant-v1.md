# Admin Assistant v1 — Architecture & Capabilities

> Shipped: April 2026 · Branch: `claude/plan-admin-assistant-v1-Rirq0`

---

## Overview

Admin Assistant v1 is an internal AI copilot embedded in the WeFixTrades admin panel. It is aware of the current page context (clients, billing, inbox, etc.) and can summarise data, suggest next steps, and produce copy-ready draft messages — all without leaving the admin UI.

---

## Architecture

### Request flow

```
Admin page (React)
  └─ AdminLayout (pageContext prop)
       └─ AdminCopilot panel
            └─ POST /api/chat  { surface: "admin", messages, sessionId, pageContext }
                 └─ chatRoutes.ts → auth guard (admin role required)
                      └─ assistant.ts → assistantStream()
                           └─ promptBuilder.ts → buildAdminPrompt(ctx)
                                └─ Anthropic claude-haiku-* SSE stream
                                     └─ readSSEStream() → messages state
```

### Key files

| File | Role |
|------|------|
| `server/routes/chatRoutes.ts` | Auth guard, surface routing, token budget |
| `server/services/promptBuilder.ts` | System prompt construction per page |
| `server/services/assistant.ts` | Transport-agnostic Anthropic SDK wrapper |
| `client/src/components/admin/AdminCopilot.tsx` | Panel UI, draft rendering, localStorage |
| `client/src/components/admin/AdminLayout.tsx` | Passes `pageContext` from every admin page |

---

## Security

- `/api/chat` with `surface: "admin"` requires an active session with `role === "admin"`.
- Enforced server-side via `req.isAuthenticated()` + `req.user.role` check — **not** client-gated.
- Unauthenticated or non-admin requests receive `401 { error: "Admin access required" }`.
- The `userId` field is stamped on the `AssistantRequest` from the session (not user-supplied).

---

## Context injection

Each admin page passes a `pageContext` object through `AdminLayout`. That object is serialised into the system prompt by `buildPageFocus()` in `promptBuilder.ts`.

### Per-page context

| Page | Key fields injected |
|------|---------------------|
| `overview` | `totalClients`, `monthlyRevenue`, `totalOpenTasks`, `unpaidAmount`, `pendingOnboardingCount`, `overdueTasksCount`, `blockedCount` |
| `client_detail` | `clientId`, `clientName`, `clientStatus`, `tradeType`, `activeServicesCount`, `serviceNames`, `onboardingStatus`, `openTasksCount`, `overdueTasksCount`, `pinnedNotes`, `topTasks` (up to 8), `latestPayment`, `supplierNames` |
| `inbox` | `totalOpenTasks`, `overdueTasksCount`, `blockedCount`, `statusCounts`, `waitingOnCounts`, `activeFilters`, `topTasks` (up to 10, with client name) |
| `billing` | `unpaidAmount`, `pendingPaymentsCount`, `failedPaymentsCount`, `overduePaymentsCount`, `topPendingPayments` (up to 6), `activeFilters` |
| `suppliers` | `supplierCount`, `activeSupplierCount`, `supplierNames`, `supplierTypes` |
| `services` | `serviceCatalogCount`, `topServicesByClients` |
| `clients` | `totalClients`, `activeFilters` |

### Shared `AdminPageContext` type

Defined in `AdminCopilot.tsx` (frontend) and mirrored as `PageContext` in `promptBuilder.ts` (backend). Any new field must be added to both.

---

## Prompt construction

`buildAdminPrompt(ctx: PageContext)` in `promptBuilder.ts` composes three sections:

1. **Role/persona** — concise, factual, operates as a trusted internal colleague.
2. **Page focus** — via `buildPageFocus(ctx)`, a switch on `ctx.page` that renders the page-specific context fields into natural-language bullet points.
3. **Drafting rules** — via `buildDraftingSection(ctx)`, enabled on `client_detail`, `inbox`, `billing`; shortened fallback on other pages.

### Token budget

Admin surface uses `maxTokens: 1000` (vs 600 for customer-facing surfaces). Set in `parseAssistantRequest()` in `chatRoutes.ts`.

---

## Drafting system

### Trigger phrases

The assistant produces a draft block when asked phrases like:
- "Draft a reply for…"
- "Write an internal note…"
- "Write a payment follow-up…"
- "Give me a status update…"

### Draft types

| Type | When used |
|------|-----------|
| Customer-facing reply | `client_detail`, `inbox`, `billing` — direct client communication |
| Internal note | `client_detail` — logged in the client record |
| Short status update | Any page — brief operational note |
| Reassurance/clarification | Client is concerned; non-committal, empathetic tone |

### Wire format

The assistant wraps drafts in fenced markers:

```
--- DRAFT: Customer Reply ---
Hi [Name],

…body…

⚑ Review before sending
--- END DRAFT ---
```

### Frontend rendering

`parseSegments()` in `AdminCopilot.tsx` splits the assistant's raw text into `TextSegment` and `DraftSegment` arrays using:

```
/---\s*DRAFT:\s*([^\n]+?)\s*---\n([\s\S]*?)---\s*END DRAFT\s*---/g
```

Each `DraftSegment` renders as a `DraftBlock` — a green-tinted card with a **Copy** button. The clipboard copy strips the `⚑ Review before sending` line so only send-ready content is copied.

---

## Prompt chips

Suggested prompts shown to the admin before and after conversation, keyed by page:

| Page | Chips |
|------|-------|
| `overview` | What should I focus on first? / What needs attention? / Summarize this page |
| `clients` | Who needs follow-up? / Summarize this page / What am I missing? |
| `client_detail` | Summarize this client / What should happen next? / What is blocked? / Is this client healthy? / Draft a reply for this client / Write an internal note |
| `inbox` | What should I focus on first? / What is blocked? / What am I waiting on? / Summarize the queue |
| `billing` | What is outstanding right now? / Who owes money? / Summarize billing health / Draft a payment follow-up |
| `suppliers` | Summarize this page / What should I know? |
| `services` | Summarize the service catalog / What services are most used? |

---

## Conversation memory

- Session ID stored in `localStorage` under `wft_copilot_session`.
- Last 30 messages stored in `localStorage` under `wft_copilot_messages` — persists across page navigation.
- Server-side memory stored in `chatMemory` table (7-day TTL, keyed by `sessionId`).
- Usage logged to `aiUsageLogs` table per request.
- Conversation archived via `conversationArchiver` on completion.

---

## Dev utilities

- **Context preview panel** — rendered only when `import.meta.env.DEV` is true. Shows the serialised `pageContext` as collapsible JSON below the input. Never visible in production.
- **Clear button** — visible when conversation has messages; wipes `localStorage` and resets state.

---

## Audit summary (v1 freeze)

### Dead imports removed
- `Badge` from `@/components/ui/badge` in `SuppliersPage.tsx` (unused)
- `Badge` from `@/components/ui/badge` in `ServicesPage.tsx` (unused)

### Stale comments fixed
- `promptBuilder.ts`: `// Admin/internal assistant (future)` → `// Admin/internal operations copilot`

### Dead helpers
- None found. All exported functions in `promptBuilder.ts` are called. All helpers in `AdminCopilot.tsx` (`parseSegments`, `DraftBlock`, `MessageContent`, `ContextPreview`) are referenced.

### Stale debug remnants
- None. `ContextPreview` is correctly gated by `import.meta.env.DEV`.

### Unreachable chip branches
- None. All keys in `PROMPT_CHIPS` match page values passed by admin pages: `overview`, `clients`, `client_detail`, `inbox`, `billing`, `suppliers`, `services`. Fallback `|| PROMPT_CHIPS.overview` covers any unknown page.

---

## What v1 does NOT do

- No autonomous actions (no mutation of DB records from the chat).
- No multi-turn memory beyond localStorage + `chatMemory` table (no long-term client history surfaced).
- No streaming draft cards — incomplete draft blocks during SSE stream render as plain text, then snap to card on `--- END DRAFT ---` arrival.
- No voice interface.

---

## Extending v1

To add a new page:
1. Add `pageContext` fields to `AdminPageContext` in `AdminCopilot.tsx`.
2. Mirror the same fields in `PageContext` in `promptBuilder.ts`.
3. Add a `case "your_page":` block in `buildPageFocus()`.
4. Add a chip list under `PROMPT_CHIPS["your_page"]`.
5. Pass `pageContext={{ page: "your_page", ...fields }}` to `AdminLayout` in the new page component.

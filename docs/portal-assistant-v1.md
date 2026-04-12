# Portal Assistant v1 — Final Specification

> Frozen baseline. No changes without explicit approval.

---

## 1. System Overview

### What it is

A single global AI chat assistant embedded in the WeFixTrades client portal. It is available on every portal page via a floating action button (FAB) in the bottom-right corner. It uses streaming SSE, page-context-aware conversation threads, and a layered prompt system that injects live account data.

### What problems it solves

- **Onboarding friction**: Helps clients complete setup forms by explaining fields, suggesting answers, and tracking what's left to fill — using live unsaved form state.
- **Account questions**: Answers questions about services, billing, and support using real data from the client's account.
- **Context continuity**: Persists conversations across page refreshes, navigation, and new tabs via server-side threads. Carries over pre-signup website chat context via journey summaries.
- **Single assistant**: Replaces multiple inline chat components (legacy AiChatPanel on onboarding, AiHelpSection on help page) with one unified widget.

---

## 2. Architecture

### Frontend flow

```
PortalLayout
  ├── OnboardingProvider          (React context for live form state)
  ├── {children}                  (page content)
  └── <Suspense>
        └── PortalChatWidget      (FAB + chat panel, always mounted)
              ├── usePortalPageContext()  → page, label, onboardingId, suggestions
              ├── useOnboardingResponses() → live form data (when on onboarding page)
              ├── Hydration: GET /api/portal/thread/messages?page=X
              ├── Chat:      POST /api/chat { surface:"portal", ... }
              └── Cache:     localStorage (write-through, not source of truth)
```

### Backend flow

```
POST /api/chat
  → chatRoutes.ts: validate, require auth, assemblePortalContext()
  → assistant.ts buildContext():
      ├── derivePageContext(page)
      ├── getOrCreateThread(userId, "portal", pageCtx)
      ├── loadThreadMessages(threadId)
      ├── dedup guard
      ├── merge thread history + new user message
      ├── load chatMemory for MemoryContext signals
      └── buildSystemPrompt()
  → streamChat() → SSE events to client
  → onComplete():
      ├── appendTurn() → thread DB
      ├── saveMemory() → chatMemory (signals)
      └── evaluateAndArchive() → admin (async)
```

### Context flow

```
portalAssistantContext.ts
  ├── resolveClientId(userId)
  ├── load client profile (business_name, trade_type, journey_summary)
  ├── load services summary
  └── mode-specific loader:
      ├── portal_general:    active services count, pending onboarding, balance
      ├── portal_onboarding: template fields, merged responses, completion status
      ├── portal_billing:    paid/pending totals, next due date
      └── portal_support:    open ticket count

promptBuilder.ts → buildPortalPrompt()
  ├── BRAND VOICE
  ├── KNOWLEDGE BASE
  ├── MEMORY CONTEXT (from chatMemory)
  ├── PRE-SIGNUP CONTEXT (journey_summary, if exists)
  ├── ACCOUNT CONTEXT (business, services)
  ├── MODE CONTEXT (page-specific data)
  └── PRIORITY ORDER
```

### Onboarding live-state flow

```
PortalOnboarding page
  ├── User edits field → setResponses()
  ├── useEffect([responses]) → syncToContext(responses)
  ├── useEffect([submissionId]) → reset on submission switch
  └── useEffect cleanup → syncToContext({}) on unmount

PortalChatWidget
  ├── useOnboardingResponses() → reads live form state
  └── Sends currentResponses when onboardingId is set

Server (loadOnboardingContext)
  ├── Load saved responses from DB
  ├── Merge: Object.assign(saved, clientResponses) — unsaved wins
  └── Pass merged responses to promptBuilder

Prompt (buildPortalModeContext)
  ├── isFilled() with .trim() — handles "", null, undefined, false, whitespace
  ├── Categorize: filledRequired, missingRequired, filledOptional, missingOptional
  ├── Show filled values (truncated to 200 chars)
  └── Instruct: "help them complete this form"
```

### Thread model

```
assistant_threads
  id, user_id, surface, page_context, status, title, metadata, message_count, last_message_at

assistant_messages
  id, thread_id, role, content, token_count, created_at
```

One active thread per (user_id, surface, page_context). At most 4 portal threads per user: `general`, `onboarding`, `billing`, `support`.

### Memory fallback

chatMemory (the `chat_memory` table) remains active. For portal requests, assistant.ts dual-writes: thread for message persistence, chatMemory for memory signal extraction (topics, pricing/booking intent). If thread operations fail, buildContext falls through to chatMemory-only path.

### Website → portal continuity

```
Website chat → chatMemory row with sessionId "s_{ts}_{rand}" in localStorage
Login → client sends sessionId to POST /api/auth/link-chat-session
Server → loads chatMemory, extracts signals, builds journey summary
Server → stores summary on clients.journey_summary (write-once)
Portal → assemblePortalContext loads journey_summary → injected as PRE-SIGNUP CONTEXT
```

---

## 3. Key Files & Responsibilities

### Client

| File | Responsibility |
|------|----------------|
| `client/src/components/portal/PortalChatWidget.tsx` | Global chat UI: FAB, panel, SSE streaming, thread hydration, open/close animations |
| `client/src/components/portal/PortalLayout.tsx` | Portal shell: sidebar, header, wraps all pages, renders PortalChatWidget + OnboardingProvider |
| `client/src/context/OnboardingContext.tsx` | React context: shares live onboarding form responses between page and widget |
| `client/src/hooks/usePortalPageContext.ts` | Route parser: derives page hint, label, onboardingId, suggestion pills from URL |
| `client/src/lib/chatHelpers.ts` | Shared utilities: sendChatMessage, readSSEStream, getSessionId, localStorage helpers |
| `client/src/pages/login.tsx` | Login page: fires session-linking POST after successful login |
| `client/src/pages/portal/PortalOnboarding.tsx` | Onboarding form: syncs responses to OnboardingContext, resets on submission switch |

### Server

| File | Responsibility |
|------|----------------|
| `server/routes/chatRoutes.ts` | POST /api/chat: unified entry for all chat surfaces, assembles portal context |
| `server/routes/portalRoutes.ts` | GET /api/portal/thread/messages: thread hydration endpoint |
| `server/routes/authRoutes.ts` | POST /api/auth/link-chat-session: website→portal session linking |
| `server/services/assistant.ts` | Core brain: buildContext (thread + memory), createOnComplete (persist), stream/sync |
| `server/services/threadService.ts` | Thread CRUD: getOrCreateThread, loadThreadMessages, appendTurn, appendMessage, derivePageContext |
| `server/services/portalAssistantContext.ts` | Context assembler: loads profile, services, billing, onboarding, journey_summary from DB |
| `server/services/promptBuilder.ts` | Prompt builder: brand voice, knowledge base, memory, account context, mode-specific blocks |
| `server/services/chatMemory.ts` | Session memory: getMemory, saveMemory, extractMemorySignals, linkSessionToUser |

### Schema

| Table | Purpose |
|-------|---------|
| `assistant_threads` | Thread metadata: user_id, surface, page_context, status, message_count, last_message_at |
| `assistant_messages` | Individual messages: thread_id, role, content, token_count, created_at |
| `chat_memory` | Session memory: session_id, user_id, surface, messages_json, topic/intent signals, 7-day TTL |
| `clients.journey_summary` | Pre-signup website chat summary (text column, write-once) |

---

## 4. Request / Response Flow

### Chat message (end-to-end)

1. User types message in PortalChatWidget
2. `handleSend()`: optimistic UI (user bubble + empty assistant bubble)
3. `sendChatMessage()` → `POST /api/chat` with `{ surface:"portal", messages, sessionId, page, onboardingId, currentResponses }`
4. `chatRoutes.ts`: validate, require auth, `assemblePortalContext(userId, page, onboardingId, {currentResponses})`
5. `assistant.ts buildContext()`: resolve thread, load history, dedup check, merge, build system prompt
6. `streamChat()` → Anthropic API → SSE events
7. Client: `readSSEStream()` updates assistant bubble incrementally
8. Stream completes → `onComplete()`: `appendTurn()` to thread, `saveMemory()` to chatMemory, `evaluateAndArchive()`

### SSE streaming behavior

- Response header: `Content-Type: text/event-stream`
- Each chunk: `data: {"text":"..."}\n\n`
- Final event: `data: [DONE]\n\n`
- Client accumulates text and updates the last message bubble on each chunk

### Hydration flow

1. Widget mounts or `page` changes → `useEffect([page])`
2. `GET /api/portal/thread/messages?page=X` with credentials
3. Server: `derivePageContext(page)` → `getOrCreateThread(userId, "portal", pageCtx)` → `loadThreadMessages(threadId)`
4. Response: `{ threadId, messages, pageContext }`
5. Widget: `setMessages([GREETING, ...threadMsgs])`
6. localStorage updated as write-through cache

---

## 5. Context Injection Model

### Page-aware context

| Client page | derivePageContext | Behavior mode | Context loaded |
|---|---|---|---|
| overview, services, settings | `"general"` | `portal_general` | Active services, pending onboarding, balance |
| onboarding | `"onboarding"` | `portal_onboarding` | Template fields, merged responses, completion |
| billing | `"billing"` | `portal_billing` | Paid/pending totals, next due date |
| help | `"support"` | `portal_support` | Open ticket count |

### Behavior modes

Each mode adds a dedicated block to the system prompt with mode-specific data and instructions. The mode is derived from the `page` parameter sent by the client, which maps through `derivePageContext()` → `deriveMode()`.

### Onboarding context merging

Server merges two sources:
1. **Saved responses**: from `onboarding_submissions.responses` (DB)
2. **Unsaved responses**: from `currentResponses` (client form state)

Merge: `Object.assign(savedResponses, clientResponses)` — client wins for conflicts. The merged result is categorized by `isFilled()` into four buckets (filled/missing x required/optional) and serialized into the prompt with field labels and truncated values.

---

## 6. Thread Persistence Model

### Thread creation

`getOrCreateThread(userId, "portal", pageContext)`:
- Query: `WHERE user_id=? AND surface="portal" AND page_context=? AND status="active" ORDER BY last_message_at DESC LIMIT 1`
- If found: return existing thread ID
- If not found: INSERT new thread with page_context, return new ID

### Thread loading

`loadThreadMessages(threadId, limit=50)`:
- Query: `SELECT role, content FROM assistant_messages WHERE thread_id=? ORDER BY created_at DESC LIMIT 50`
- Result reversed to chronological order

### Page-context separation

| Page | page_context | Thread |
|---|---|---|
| overview, services, settings | `"general"` | Shared general thread |
| onboarding | `"onboarding"` | Dedicated onboarding thread |
| billing | `"billing"` | Dedicated billing thread |
| help | `"support"` | Dedicated support thread |

### Duplicate-turn guard

Two layers:
1. **buildContext**: if last thread message matches last client message (same role + content), set `_isDuplicateTurn = true` and skip appending to merged messages
2. **createOnComplete**: if `_isDuplicateTurn`, call `appendMessage(assistant only)` instead of `appendTurn(user + assistant)`

---

## 7. Known Limitations (Intentional)

| Limitation | Rationale |
|---|---|
| No action layer | v1 is informational only; mutation actions require careful safety design |
| Static suggestion pills | Per-page defaults; server-generated suggestions deferred to v2 |
| No markdown rendering | Plain text responses; rendering adds dependency and edge cases |
| No thread archival | Low volume per user; archival policy not needed yet |
| journey_summary has no expiry | ~50-100 tokens; negligible cost; no stale-data behavioral issue |
| Single thread per page-context | Simple model; multi-thread per context adds UX complexity |
| Single localStorage key | Hydration overwrites immediately; per-page keys add complexity for minimal gain |
| chatMemory dual-write | Maintains signal extraction and backward compatibility; minor DB cost |
| No DB index on assistant_messages | Low volume per thread (<50 messages loaded); index warranted at scale |
| Brief flash on page navigation | ~100-200ms between page change and hydration; acceptable |

---

## 8. What is Explicitly Out of Scope (v1)

- Image upload
- Voice interaction
- Admin thread viewer / admin-side conversation panel
- Cross-thread intelligence (e.g., billing context in onboarding thread)
- Mutation actions (submit form, open ticket, change settings)
- AI-generated journey summaries (using Claude call)
- Token budget tracking or per-user rate limiting
- Message search or export
- Conversation branching or multi-thread per page context
- Real-time collaboration or multi-user threads

---

## 9. V2 Improvements

### Context & intelligence
- AI-generated journey summary (Claude call instead of template)
- Time-limited journey_summary injection (skip after 30 days)
- Server-generated suggestion pills (meta SSE event)
- Cross-thread context awareness

### Persistence & scale
- DB index: `assistant_messages (thread_id, created_at DESC)`
- Thread archival policy (90+ days inactive)
- Message pagination (scroll-up loading)
- Per-page localStorage keys

### UX
- "New conversation" button
- Server typing indicator (pre-first-token SSE event)
- Message timestamps
- Markdown rendering
- Mobile auto-resize textarea

### Operations
- Admin thread viewer in CRM
- Token budget tracking via assistant_messages.token_count
- Action layer with user confirmation
- Multi-surface thread continuity (beyond summary)

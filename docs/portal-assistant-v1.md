# Portal Assistant v1 — Technical Handoff

## 1. Architecture Overview

The portal assistant is a single global chat widget available on every portal page. It uses streaming SSE, page-context-aware threads for persistence, and a shared prompt pipeline that injects live account data.

```
Client (PortalChatWidget)
  ├── Hydration: GET /api/portal/thread/messages?page=X
  ├── Chat:      POST /api/chat  { surface: "portal", page, messages, ... }
  └── Cache:     localStorage (write-through, not source of truth)

Server
  ├── chatRoutes.ts      → validates, assembles portalContext
  ├── assistant.ts       → builds context, manages threads, streams response
  ├── threadService.ts   → thread CRUD (DB source of truth)
  ├── portalAssistantContext.ts → loads account/service/billing/onboarding data
  ├── promptBuilder.ts   → constructs system prompt with all context layers
  └── chatMemory.ts      → memory signals (topics, intent) — still active for all surfaces
```

One active thread per (user, surface, page_context). At most 4 portal threads per user: `general`, `onboarding`, `billing`, `support`.

## 2. Key Files and Responsibilities

### Client

| File | Role |
|------|------|
| `client/src/components/portal/PortalChatWidget.tsx` | Global assistant UI — FAB, chat panel, SSE streaming, thread hydration |
| `client/src/components/portal/PortalLayout.tsx` | Wraps all portal pages; renders PortalChatWidget + OnboardingProvider |
| `client/src/context/OnboardingContext.tsx` | React context sharing live onboarding form state between page and widget |
| `client/src/hooks/usePortalPageContext.ts` | Derives page hint, label, onboardingId, suggestions from current route |
| `client/src/lib/chatHelpers.ts` | sendChatMessage, SSE reader, localStorage persistence helpers |
| `client/src/pages/login.tsx` | Fires session-linking call after login (website→portal continuity) |

### Server

| File | Role |
|------|------|
| `server/routes/chatRoutes.ts` | POST /api/chat — unified entry point for all surfaces |
| `server/routes/portalRoutes.ts` | GET /api/portal/thread/messages — thread hydration endpoint |
| `server/routes/authRoutes.ts` | POST /api/auth/link-chat-session — website→portal session linking |
| `server/services/assistant.ts` | Core brain — buildContext, createOnComplete, stream/sync dispatchers |
| `server/services/threadService.ts` | Thread CRUD — getOrCreateThread, loadThreadMessages, appendTurn |
| `server/services/portalAssistantContext.ts` | Assembles PortalContext from DB (profile, services, billing, onboarding) |
| `server/services/promptBuilder.ts` | Builds system prompt — brand voice, knowledge base, mode-specific context |
| `server/services/chatMemory.ts` | Session memory — signals extraction, topic tracking, user linking |

### Schema

| Table | Purpose |
|-------|---------|
| `assistant_threads` | Thread metadata — user_id, surface, page_context, status, message_count |
| `assistant_messages` | Individual messages — thread_id, role, content, token_count |
| `chat_memory` | Legacy session memory — still used for signal extraction on all surfaces |
| `clients.journey_summary` | Pre-signup website chat summary (text, write-once) |

## 3. Request/Response Flow

```
User types message → handleSend()
  ├── Optimistic UI: append user message + empty assistant bubble
  ├── POST /api/chat { surface:"portal", messages:[...], sessionId, page, onboardingId, currentResponses }
  │
  ├── chatRoutes.ts:
  │   ├── Validate surface, messages, sessionId
  │   ├── Require auth for portal surface (req.user.id)
  │   ├── assemblePortalContext(userId, page, onboardingId, {currentResponses})
  │   └── Return assistantReq with portalContext
  │
  ├── assistant.ts buildContext():
  │   ├── derivePageContext(page) → "general" | "onboarding" | "billing" | "support"
  │   ├── getOrCreateThread(userId, "portal", pageCtx)
  │   ├── loadThreadMessages(threadId) → DB history
  │   ├── Dedup guard: skip if last thread msg matches last client msg
  │   ├── Merge: [...threadHistory, newUserMessage]
  │   ├── Load chatMemory for MemoryContext (personality signals)
  │   └── buildSystemPrompt(surface, audit, memory, page, portal)
  │
  ├── streamChat() → SSE events → client reads via readSSEStream()
  │
  └── onComplete():
      ├── appendTurn(threadId, userMsg, assistantReply) → DB
      ├── saveMemory(sessionId, allMessages, signals) → chatMemory
      └── evaluateAndArchive() → admin visibility (async)
```

## 4. Context Injection Flow

The system prompt is built in layers by `buildSystemPrompt()`:

```
1. BRAND VOICE          — personality, rules (shared across all portal modes)
2. KNOWLEDGE BASE       — services catalog, pricing, FAQs (compileKnowledge())
3. MEMORY CONTEXT       — user name, business type, topics (from chatMemory)
4. PRE-SIGNUP CONTEXT   — journey_summary from clients table (if exists)
5. ACCOUNT CONTEXT      — business name, trade type, services list, balance
6. MODE CONTEXT         — one of:
   ├── portal_general:     counts + balance summary
   ├── portal_onboarding:  field categorization, filled values, completion status
   ├── portal_billing:     paid/pending totals, next due date
   └── portal_support:     open ticket count
7. PRIORITY ORDER       — help complete task → remove blockers → answer → guide next step
```

Mode is derived from page: `overview/services/settings → general`, `onboarding → onboarding`, `billing → billing`, `help → support`.

## 5. Onboarding Live-State Flow

```
PortalOnboarding (form page)
  ├── User edits field → setResponses({...responses, [key]: value})
  ├── useEffect([responses]) → syncToContext(responses)  [writes to OnboardingContext]
  ├── useEffect([submissionId]) → reset responses + context  [prevents stale data between submissions]
  └── useEffect cleanup → syncToContext({})  [clears on unmount]

PortalChatWidget (global)
  ├── useOnboardingResponses() → reads from OnboardingContext
  ├── Sends currentResponses in POST /api/chat when onboardingId is set
  └── When not on onboarding page: onboardingResponses is {} → currentResponses is undefined

Server (portalAssistantContext.ts → loadOnboardingContext)
  ├── Loads saved responses from DB (onboarding_submissions.responses)
  ├── Merges with client-provided currentResponses (unsaved form state wins)
  └── Passes merged responses to promptBuilder

Prompt (promptBuilder.ts → buildPortalModeContext)
  ├── isFilled() check: handles undefined, null, false, empty string, whitespace-only
  ├── Categorizes each field: filledRequired, missingRequired, filledOptional, missingOptional
  ├── Shows completion status: "3/5 required fields complete"
  ├── Lists STILL NEEDED / Completed fields by name
  ├── Shows filled values (truncated to 200 chars via truncateValue())
  └── Instructs AI: "help them complete this form, answer precisely using field data"
```

## 6. Thread Persistence Flow

```
Schema:
  assistant_threads  (id, user_id, surface, page_context, status, message_count, last_message_at)
  assistant_messages (id, thread_id, role, content, token_count, created_at)

Thread selection:
  getOrCreateThread(userId, "portal", pageCtx)
  WHERE user_id=? AND surface="portal" AND page_context=? AND status="active"
  ORDER BY last_message_at DESC LIMIT 1
  → If none found: INSERT new thread with page_context

Page context mapping (derivePageContext):
  "onboarding" → "onboarding"
  "billing"    → "billing"
  "help"       → "support"
  everything   → "general"

Message flow:
  buildContext:    load thread msgs → merge with new user msg → send to Claude
  createOnComplete: appendTurn(threadId, userContent, assistantContent) → 2 rows inserted
  Dedup:          if last thread msg = last client msg (same role + content) → skip append,
                  only save assistant reply via appendMessage()

Client hydration:
  useEffect([page]) → GET /api/portal/thread/messages?page=X
  → Server returns thread messages → widget sets [GREETING, ...threadMsgs]
  → localStorage updated as write-through cache
  → On network failure: keeps current messages (no disruption)
```

## 7. Website → Portal Continuity Flow

```
Website: user chats → messages stored in chatMemory with sessionId "s_{ts}_{rand}"
         sessionId persisted in localStorage (wft_chat_session)

Login: user logs in at /login
  ├── onSuccess: reads getSessionId() from localStorage
  ├── Fire-and-forget: POST /api/auth/link-chat-session { chatSessionId }
  └── Navigation proceeds immediately (linking does not block)

Server (authRoutes.ts → link-chat-session):
  ├── getMemory(chatSessionId) → load anonymous session
  ├── linkSessionToUser(chatSessionId, userId) → set user_id on chatMemory row
  ├── extractMemorySignals(messages) → topics, pricing/booking intent
  ├── Build summary: first user message + topics + intent + message count
  └── UPDATE clients SET journey_summary=? WHERE user_id=? AND journey_summary IS NULL
      (write-once: never overwrites existing summary)

Portal context injection:
  assemblePortalContext → loads clients.journey_summary → ctx.journeySummary
  buildPortalPrompt → if journeySummary exists:
    "=== PRE-SIGNUP CONTEXT ===
     Before signing up, this user had a conversation on the marketing site.
     Summary: {journeySummary}"
```

## 8. Known Limitations (Intentional for v1)

| Limitation | Rationale |
|------------|-----------|
| Single localStorage key for all page threads | Hydration overwrites immediately; per-page keys add complexity for minimal UX gain |
| journey_summary never expires | Short text (~50-100 tokens); negligible prompt cost; no behavioral issue observed |
| Brief message flash on page navigation | ~100-200ms between page change and thread hydration; acceptable |
| No message search or export | v1 scope is persistence + context; queryability is a v2 feature |
| No conversation reset / "new thread" button | Single active thread per page context; manual reset not needed yet |
| chatMemory dual-write on every request | Maintains backward compatibility and signal extraction; minor DB cost |
| No streaming for legacy /api/portal/ai-chat callers | Endpoint removed in Phase 6; all traffic now uses streaming /api/chat |
| Thread messages have no index on thread_id + created_at | Low volume per thread (max ~50 loaded); index warranted at scale |

## 9. Recommended v2 Improvements

### Context & intelligence
- **AI-generated journey summary** — Replace template-based summary with a Claude call for richer pre-signup context
- **Time-limited journey_summary injection** — Skip PRE-SIGNUP CONTEXT after 30 days or N portal messages
- **Server-generated suggestion pills** — Parse a meta SSE event from the response to drive contextual suggestions instead of static per-page defaults
- **Cross-thread context** — Let the onboarding assistant reference billing context if the user asks about pricing mid-setup

### Persistence & scale
- **Add DB index** — `CREATE INDEX ON assistant_messages (thread_id, created_at DESC)` for efficient loading
- **Thread archival policy** — Auto-archive threads with no activity for 90+ days
- **Message pagination** — Load older messages on scroll-up instead of fixed 50-message limit
- **Per-page localStorage keys** — `wft_portal_chat_{pageContext}` to eliminate flash between page navigations

### UX
- **"New conversation" button** — Archives current thread and starts fresh
- **Typing indicator from server** — SSE event for "assistant is thinking" before first token
- **Message timestamps** — Show relative times ("2 min ago") in the chat panel
- **Markdown rendering** — Parse assistant responses for lists, bold, links
- **Mobile-optimized input** — Auto-resize textarea, keyboard-aware scroll

### Operations
- **Admin thread viewer** — Surface portal conversations in the admin CRM for support context
- **Token budget tracking** — Use `assistant_messages.token_count` to enforce per-user daily limits
- **Action layer** — Let the assistant perform actions (submit draft, open ticket) with user confirmation
- **Multi-surface thread continuity** — Carry thread context from website widget into portal post-signup (beyond summary)

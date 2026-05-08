# Portal AI Service Editor — Plan

**Status:** Draft, not yet started.
**Owner:** TBD.
**Goal:** Give every active client constant access to a dedicated 24/7 WeFixTrades
AI agent that can answer questions and **directly perform light edits** on the
services they subscribe to — without involving a human, without runaway token
spend, and without ever touching freelancer-owned tasks.

---

## 1. Goals & non-goals

### In scope (the AI can do this autonomously)

The AI agent can read and tweak any service whose `fulfillment_mode` is one of
`automation` or `internal` AND where the change is configuration only, not
deliverable creation. Concrete examples per product:

- **24/7 TradeLine** — change greeting text, business hours, after-hours
  message, voice/chat mode, forwarded number, escalation rules, FAQ
  responses, blocklisted numbers.
- **QuoteQuick Pro** — adjust line items, base rates, area surcharges,
  emergency-call multipliers, deposit %, lead-form fields, embed code
  regeneration.
- **MapGuard** — service-area polygons, primary/secondary categories,
  business description, FAQ posts, photo cadence, weekly audit toggles.
- **ReputationShield** — review-request SMS/email templates, send delay,
  rating-gate threshold, escalation phone for 1-stars.
- **SocialSync** — posting cadence, channels enabled, brand voice
  parameters, hashtag set, content themes.
- **BookFlow** — bookable services, durations, deposits, tech availability
  windows.
- **AdFlow / RankFlow / ContentFlow** — read-only status reports + small
  config (target keywords list, ad budget caps within an upper bound, blog
  topic preferences). Anything that costs ad-spend money requires a draft
  + human approval (see §6).

### Out of scope (the AI declines and routes to a human)

- Anything with `fulfillment_mode` in `fiverr | freelancer | white_label` —
  those involve external workers; AI cannot promise edits there.
- Cancellations, refunds, plan changes, payment-method changes.
- Anything that creates outbound spend above a per-client daily cap (ad
  budget bumps, SMS sending limits, premium voice minutes).
- Writing or rewriting deliverables (websites, blog posts, ad creative).
  The AI can request these via the existing fulfillment task system, but
  cannot deliver them itself in this release.
- Legal / compliance / contractual discussions — escalates to support
  ticket with `priority = high`.

---

## 2. Existing infrastructure we can leverage

| Piece | Where | Status |
| --- | --- | --- |
| Anthropic chat engine + tool-use loop | `server/aiChatEngine.ts`, `server/services/assistant.ts` | ✅ Working — already handles `stop_reason === "tool_use"` rounds. |
| Prompt builder w/ surfaces | `server/services/promptBuilder.ts` (`portal_support` etc.) | ✅ Stub exists, needs a new `portal_service_editor` surface. |
| Per-client storage + audit log | `server/storage.ts`, `adminActivityLog` | ✅ Already requires `actor_type` — `ai_agent` is a valid value. |
| Booking tools (reference shape) | `server/services/bookingTools.ts` | ✅ Use the same JSON-schema tool shape for the new editor tools. |
| Vapi voice integration | `server/services/vapiService.ts`, `client/src/hooks/useVapiCall.ts` | ✅ For demo today; we'll add `assistantOverrides` for authenticated portal calls. |
| Portal pages | `client/src/pages/portal/Portal*.tsx` | ✅ Auth + per-service detail views exist. |
| Marketing chat widget | `client/src/components/SiteChatWidget.tsx` | 🟡 Reusable — needs a portal variant scoped to the client. |
| `clientServices` table | `shared/schemas/adminCrm.ts` | ✅ Has `metadata jsonb`, `automation_enabled`, `human_review_required`, `fulfillment_mode`. |

---

## 3. New schema

Two small tables, additive only — no changes to existing tables.

### `client_ai_conversations`
Persistent thread per client. Used both for chat + voice transcripts.

```
id              serial pk
client_id       int -> clients.id
channel         varchar(20)        -- "chat" | "voice" | "whatsapp" | "sms"
status          varchar(20)        -- "active" | "closed"
last_message_at timestamp
created_at      timestamp
metadata        jsonb              -- vapi call id, twilio thread, etc.
```

### `client_ai_messages`
Append-only message log for one conversation.

```
id              serial pk
conversation_id int -> client_ai_conversations.id
role            varchar(15)        -- "user" | "assistant" | "tool" | "system"
content         text
tool_name       varchar(80)        -- when role=tool
tool_input      jsonb
tool_output     jsonb
input_tokens    int                -- cost telemetry
output_tokens   int
model           varchar(40)
created_at      timestamp
```

### `service_edit_proposals`
For approval-gated edits (see §6) — AI writes a draft, human admin approves
before it lands on the live service.

```
id                  serial pk
client_id           int -> clients.id
client_service_id   int -> client_services.id
proposed_by         varchar(20)     -- "ai_agent"
diff                jsonb           -- { field, before, after }[]
status              varchar(20)     -- "pending" | "approved" | "rejected" | "applied" | "expired"
reviewed_by         int -> users.id
reviewed_at         timestamp
applied_at          timestamp
note                text
created_at          timestamp
```

`adminActivityLog` already records every applied change — proposals layer on
top, they don't replace the audit log.

---

## 4. Tool registry shape

One file per product under `server/engine/portalTools/`:

```
server/engine/portalTools/
  index.ts                 -- registry export, route by product slug
  types.ts                 -- ToolDef, ToolContext, ToolResult
  permissions.ts           -- "can client X edit Y?" predicate
  tradelineTools.ts
  quotequickProTools.ts
  mapguardTools.ts
  reputationShieldTools.ts
  socialSyncTools.ts
  bookflowTools.ts
  adflowTools.ts           -- mostly read + draft-only
  rankflowTools.ts
  contentflowTools.ts
```

Each tool:

```ts
interface ToolDef {
  name: string;                          // "tradeline.updateGreeting"
  description: string;                   // shown to the model
  product: ProductSlug;                  // gates by client's subscription
  scope: "read" | "write" | "draft";
  approvalRequired: boolean | ((input, ctx) => boolean);
  costEstimate: "free" | "small" | "spend"; // for cost guard
  input_schema: JSONSchema;              // Anthropic-compatible
  handler(input, ctx: ToolContext): Promise<ToolResult>;
}
```

`ToolContext` carries `{ clientId, clientServiceId, requestedByUserId,
conversationId }`. Every handler ends with one `adminActivityLog.insert` call
with `actor_type = "ai_agent"` and a structured diff.

The model is given **only the tools the client is entitled to** (filtered by
their active `clientServices` rows). This is both a permission boundary and
a token-saver — a client without AdFlow doesn't see AdFlow tool defs.

---

## 5. Permission boundary

A change is allowed without approval iff **all** are true:

1. Client owns an active `clientServices` row for the relevant product.
2. The product's `fulfillment_mode` is `automation` or `internal`.
3. `clientServices.automation_enabled` is true and
   `clientServices.human_review_required` is false.
4. The tool's `approvalRequired` evaluates to false for this input.
5. The change does not exceed the per-client per-day spend budget (§7).

If any condition fails, the AI either:

- creates a `service_edit_proposals` row and tells the user "I've drafted
  the change — your account manager will review within X hours", or
- declines politely and offers to open a support ticket.

---

## 6. Approval-gated edits (always draft, never auto-apply)

These always write to `service_edit_proposals` regardless of automation
settings:

- Pricing changes (any QuoteQuick Pro rate edits over ±15% from current).
- Ad budget increases (any AdFlow budget change at all).
- Service-area expansions on MapGuard (anything above a small radius bump).
- Anything affecting customer-facing copy on a live website (ContentFlow,
  SiteLaunch).
- Greeting / brand-voice changes that touch trademarks or legal claims —
  detected by a simple keyword filter on the diff.

A nightly worker auto-expires proposals not reviewed within 72 hours and
notifies the client.

---

## 7. Cost controls (the part the user asked about loudest)

This is the one section to design conservatively. The fear is "client
abuses the free 24/7 AI and we burn $300 a month per client on tokens."

### 7.1 Model tiering

- Default model: **Claude Haiku 4.5** for every turn. Cheap, fast, plenty
  smart for config edits.
- Escalate to **Sonnet 4.6** only when the request is ambiguous or the
  conversation has gone past 8 turns without resolution. Detection is
  deterministic — a small classifier prompt run on Haiku decides.
- Never default to Opus. Opus only on explicit human-admin request via a
  hidden tool.

### 7.2 Hard daily budget per client

```
client_ai_budgets (
  client_id pk,
  plan varchar,             -- "starter" | "pro" | "elite"
  daily_token_cap int,      -- e.g. 60_000 starter, 200_000 pro, 1_000_000 elite
  daily_tool_call_cap int,  -- 30 / 100 / 500
  used_tokens_today int,
  used_tool_calls_today int,
  reset_at timestamp
)
```

When a turn arrives, we check budget **before** calling the model. If the
client has exceeded their cap, the AI sends a polite "I'm caught up for
today, message me again at midnight or open a ticket if it's urgent" reply.
Caps reset at midnight client-local time.

Defaults sized so that under heavy use:
- Starter ≈ $0.80/day worst case (Haiku only).
- Pro ≈ $3.50/day worst case.
- Elite ≈ $15/day worst case (cap rarely hit).

### 7.3 Prompt caching

The portal system prompt + tool definitions + the client's service
configuration snapshot is **the same for every turn in a session** —
prime cache target. Wire `cache_control: { type: "ephemeral" }` on the
system + tools blocks. Expected hit rate after turn 1: >90%, savings on
input tokens roughly 90% per cached block.

### 7.4 Conversation truncation

Hard cap chat history at 20 turns sent to the model. Older turns are
summarised by a one-shot Haiku call into a 200-token recap, which then
becomes the head of the next turn.

### 7.5 Voice (Vapi) cost guard

Vapi charges per minute, not per token, and is the dominant cost on the
voice path. Defaults:
- 8-minute soft cap with "anything else?" prompt at 6 minutes.
- 15-minute hard cap; agent politely wraps and offers to continue via chat.
- Per-client per-day **voice minutes** budget tracked alongside tokens.

### 7.6 Rate limit (anti-abuse)

- Max 1 turn per 2 seconds per client (debounce typing spam).
- Max 6 voice calls per 24 hours per client.
- Sliding-window 50 turns per hour. Above that → "I'll need to pause for a
  bit — this looks like a stuck loop."

---

## 8. Channels

### 8.1 Phase 1 — Portal chat (web)
- Mount a portal-scoped variant of `SiteChatWidget` on every `/portal/*`
  page.
- Auth via existing session — server resolves `clientId` from the cookie,
  client never sends it.
- Surface `portal_service_editor` in `promptBuilder.ts`.
- Stream responses (already supported by `aiChatEngine`).

### 8.2 Phase 2 — Voice (Vapi)
- Add a "Call your agent" button on the portal dashboard.
- `useVapiCall` with `assistantOverrides` injecting:
  - Same system prompt as chat surface.
  - Same tool registry, filtered to the same client.
  - Conversation continuity — pre-load the last chat thread as context.
- Vapi function-calls map 1:1 to chat tool defs (already a pattern in
  `bookingTools.ts`).

### 8.3 Phase 3 — WhatsApp / SMS (later)
- Twilio Conversations API webhook → same `aiChatEngine` entry point with
  channel = "whatsapp" or "sms".
- Identity: client's verified phone number on the `clients` row maps to a
  thread.
- Streaming responses don't apply — send full reply per turn.
- Cost guard tightens: one tool call per inbound message, no chain-of-
  thought rambling.

### 8.4 Phase 4 — Native app (much later)
- Optional. Probably not worth it before WhatsApp/SMS prove out, since
  most trades clients live in their texts already.

---

## 9. Phasing — concrete build order

Each phase is shippable on its own.

**Phase 1 — read-only foundation (1 week).**
- New tables (`client_ai_conversations`, `client_ai_messages`).
- `portal_service_editor` prompt surface.
- Portal chat widget mounted on `/portal/*`.
- Read-only tools per product: `<product>.getStatus`, `<product>.getConfig`.
- Cost guard skeleton (token tracking only, no caps yet).

**Phase 2 — write tools for TradeLine + QuoteQuick + MapGuard (1.5 weeks).**
- Pick the three highest-touch products first.
- Per-product write tools with full validation.
- `service_edit_proposals` table + draft flow for approval-gated edits.
- Daily token + tool-call caps wired in.
- Prompt caching turned on.

**Phase 3 — remaining products (1 week).**
- ReputationShield, SocialSync, BookFlow, AdFlow (read+draft),
  RankFlow (read+draft), ContentFlow (read+draft), WebCare (read).

**Phase 4 — voice path (3–4 days).**
- Vapi assistantOverrides per portal user.
- Shared tool registry, voice cost guard.

**Phase 5 — WhatsApp + SMS (1 week).**
- Twilio Conversations webhook.
- Channel-aware response shaping.

Total ≈ 4–5 weeks for everything; the user has a working portal AI in
**~1 week** after Phase 1, and a really useful one after Phase 2.

---

## 10. Risks

- **Tool misfires.** AI calls a write tool with wrong args. Mitigation:
  Zod schema validation in every handler; tool returns a structured error
  the model reads back; "before/after" diff shown to the user in the chat
  for any non-trivial write, with an "undo" tool available for 5 minutes.
- **Token blow-up.** A pathological client hits caps every day. Mitigation:
  caps + escalating cooldowns; admin alert if a client hits the cap 3 days
  in a row.
- **Permission drift.** Tool registry says client can edit X but storage
  rejects. Mitigation: single source of truth — entitlement check is the
  same predicate used to filter tools at session start AND inside each
  handler.
- **Voice latency on tool calls.** Tool round-trips can stall a Vapi
  conversation. Mitigation: speak a "one moment" filler; cache common
  reads; never put a write tool on the critical path of voice (drafts
  are async).
- **Cross-client leakage.** Catastrophic if one client's AI sees another's
  data. Mitigation: every storage method takes `clientId` as the first
  arg and filters in SQL — no shared global state in handlers; integration
  tests assert isolation per turn.

---

## 11. Open questions for the owner

1. Is per-day token cap acceptable, or do we need per-month rollover?
2. Approval flow — is "human reviews within 72 hours" acceptable for
   pricing edits, or should those go to live with a confirmation prompt
   to the client instead?
3. Voice: is 15-minute hard cap OK, or longer for Elite?
4. Do we want the "agent" to feel persona-named (e.g. "Theo" from the
   marketing visual) or generic ("WeFixTrades AI")? Affects branding,
   not implementation.
5. WhatsApp Business API account — owner needs to register
   business.whatsapp.com before Phase 5. Twilio handles the rest.

---

## 12. First commit (when greenlit)

1. Add tables in a migration: `client_ai_conversations`,
   `client_ai_messages`, `service_edit_proposals`, `client_ai_budgets`.
2. Add `portal_service_editor` case in `promptBuilder.ts` with the system
   prompt + a TODO for tool injection.
3. Stub `server/engine/portalTools/index.ts` returning an empty array.
4. Add a `/api/portal/chat` route that loads `clientId` from session,
   resolves entitled tools, and calls the existing chat engine with
   surface = `portal_service_editor`.
5. Mount the portal chat widget on `/portal/dashboard` only (smallest
   footprint), gated by a feature flag `PORTAL_AI_ENABLED`.

That commit is reviewable, ships zero tools, and leaves us a clean
runway to land Phase 2 next.

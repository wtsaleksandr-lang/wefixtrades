# Phase 3 Plan — AI Customer Support Across Channels

> Blueprint for Phase 3 of the WeFixTrades agentic-copilot project. Drafted
> 2026-05-16 from the Phase 3 vision discussion. Phases 2b + 2c are merged.

---

## 1. Goal

Turn the WeFixTrades copilots into a near-fully-autonomous customer support
operation — target **99% automation** — across portal chat, email, SMS, and
voice. The founder supervises through the admin control tower (observability
+ kill switches), not by approving each action.

Rationale: at 100 clients, manual customer service does not scale, and the
underlying services are already automated. AI customer service must be too.
"AI drafts, human approves every reply" is explicitly **not** the model.

---

## 2. Principles

Carried from 2b/2c:
- **Separation** — the client concierge brain and the admin brain stay fully
  separate (routes, prompts, memory, auth). Only the action-registry
  framework is shared.
- **Account-changing actions stay in the authenticated portal**, where the
  user's identity is proven by login.

New for Phase 3:
- **The approval model extends, it is not replaced.** A new `auto` tier joins
  `low` and `draft`; `low`/`draft` keep their confirm step.
- **Autonomy is classified at build time, never judged by the model at
  runtime.** Whether an action may run unattended is decided by the engineer
  when the action is built — not guessed per-request by an LLM.
- **Observability replaces per-action approval.** Every autonomous action is
  audit-logged; the admin copilot surfaces what the AI did. The founder
  reviews the trail and can demote any misbehaving action-type.

---

## 3. The `auto` tier

A new `ActionRiskTier` value: `"low" | "draft" | "auto"`.

- `low` — executes after one human confirm click. *(existing)*
- `draft` — prepares a draft; a human commits/sends via existing UI. *(existing)*
- `auto` — **executes with no confirmation.** *(new)*

**Admission criteria** — an action may be `auto` only if ALL three hold,
verified by the engineer at build time:
1. It is customer-satisfying — it helps the customer.
2. It stays within the prebuilt product's allowed customization — no
   structural deviation from how the product is designed to work.
3. It structurally cannot cause company financial loss.

An action that fails any criterion stays `low`/`draft` (confirm-gated) or is
portal-only (account-changing).

**Inbound (unverified) channels** — email/SMS — may trigger only `auto`-tier
actions and informational answers. Never account-changing actions; never
disclosure of account data to a sender whose identity is unverified.

---

## 4. Budget & model orchestration — no hard stop

A per-client AI cost ledger tracks every AI call's real cost. The budget is a
**model-selection dial, never an off-switch** — service never stops.

Bands, per client:
- **Within default budget** — the AI uses the task-appropriate model (a cheap
  model for simple Q&A, a premium model for complex tasks).
- **Default budget + up to $10 (soft cap)** — still task-appropriate; heavier
  models still allowed when a task genuinely needs one.
- **Over the soft cap** — everything routes to the cheapest capable model. The
  concierge keeps operating, just leaner. It never goes dark.

The ledger feeds both the budget dial and the per-client profit view (§5).

---

## 5. Per-client cost & profit

Every client's variable costs are tracked and shown on the admin
client-detail page: **AI cost** (this month / lifetime), **all variable
costs** (LLM tokens + Twilio SMS + Vapi voice minutes), **revenue**, and
**profit**.

Foundation: `usageTracker` already logs each AI call's model + token counts +
user. Still needed: a model→price table, per-client aggregation, the SMS/voice
cost inputs, and the client-detail UI.

This is the same subsystem as the budget (§4) — the budget needs live
per-client spend, which is exactly this ledger.

---

## 6. Per-channel kill switches

Admin-dashboard toggles that disable AI responses per channel, independently:
**email · SMS · voice · chat widget.** DB-backed config (not env vars), with a
settings panel; each channel handler checks its flag before responding.

**Ships early — before autonomous responses go live.** It is the safety net
the founder must have in hand before autonomy is switched on.

---

## 7. Channels & inbound infrastructure

- **Outbound email** — a `send_support_email` action: sends from
  `support@wefixtrades.com`, wrapped in a template with the company
  signature, logo, and contact details.
- **Outbound SMS** — via Twilio (already in the stack).
- **Inbound email** — NEW infrastructure. There is no inbound email today
  (outbound-only via Nodemailer). Needs an inbound-email webhook (provider:
  Postmark / SendGrid / Mailgun inbound parse) or IMAP polling of the
  `support@` mailbox, plus threading, quoted-text stripping, and attachment
  handling.
- **Inbound SMS** — Twilio inbound webhooks.
- **Voice** — Vapi is already integrated; extend it into the same concierge
  brain.

**Identity** — inbound email `From:` headers and SMS numbers are spoofable.
Inbound channel identity is treated as **unverified**: the AI may read, answer
general questions, and run `auto`-tier actions — but account-affecting actions
and account-data disclosure require a verified identity (portal login or a
magic-link confirmation).

---

## 8. Architecture — concierge vs control tower

- **The client concierge owns reactive support across ALL channels** — portal
  chat, email, SMS, voice. One brain; the channels are just transports into
  it (the same way 2b made the portal copilot transport-agnostic). A client's
  question gets the same answer, account scoping, and escalation path
  regardless of channel.
- **The admin copilot is the control tower** — the founder's window into the
  operation: new-ticket notifications, a briefing on admin login, proactive
  outreach (admin-initiated `send_support_email`), intervention in any
  conversation, the kill switches, and the cost/profit views. It is not itself
  the front-line agent.
- **Escalation flow** — a client contacts their concierge → the concierge
  handles what it can → if it cannot, it raises a support ticket / escalates
  to a human → the admin copilot notifies the founder of every new ticket.

---

## 9. Shared-files retention

Files a user sends their copilot (chat attachments — e.g. a tradesperson
photographing something to ask about it) are **retrievable for ~14 days**,
then auto-purged.

- A "Shared files" view in the portal concierge (and the admin copilot) —
  recent attachments, retrievable.
- **Files consumed into a record persist with that record** — e.g. an invoice
  photo that became a BookFlow invoice stays attached to the invoice; it is
  not subject to the 14-day purge. The TTL applies only to transient
  "asked about it" files.
- A retention/purge cron worker (precedent: `tradelineBillRetentionWorker`).
- The TTL keeps storage self-bounding — no large per-client quota needed — and
  is good data hygiene (customer photos are not held indefinitely).

---

## 10. Capability policy

- **Image reading (vision / OCR)** — allowed. Cheap (~1¢ or less per image).
  Powers e.g. invoice-photo → extract data → create record.
- **Image generation** — NOT a default capability. It needs a separate paid
  API and is cost-unbounded. If a real use case appears (e.g. SocialSync post
  images), gate it behind a quota and weight it heavily against the budget.
  Decide first whether it is needed at all.

---

## 11. Suggested PR sequence

Foundation and safety first; autonomy widens gradually as confidence builds.

- **3a** — `auto` tier in the registry + the per-channel kill switches.
- **3b** — per-client cost ledger + model-pricing table + budget bands + the
  client-detail cost/profit view.
- **3c** — `send_support_email` (outbound, admin-initiated) + the new-ticket
  admin notification.
- **3d** — outbound SMS.
- **3e** — inbound email infrastructure; the concierge handles inbound mail
  (answers + `auto`-tier actions).
- **3f** — inbound SMS.
- **3g** — shared-files retention view + purge worker.
- **3h** — voice extension into the concierge.

Each new autonomous action-type is introduced conservatively and its audit
trail watched before the next is added.

---

## 12. Open decisions

- Inbound email: a hosted inbound-parse provider vs IMAP polling.
- Whether image generation is needed at all.
- Retention window (14 days proposed).
- Voice scope — how far to take Vapi autonomy.

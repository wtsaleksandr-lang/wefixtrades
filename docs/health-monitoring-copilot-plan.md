# Health Monitoring + AI-Copilot Resolution — plan

Status: **spec / not yet built.** Owner: Alex. Drafted 2026-05-29.

## Goal

Every product and tool in the suite continuously reports a health status. Any
problem is (a) **immediately visible** to Alex on the admin home dashboard,
(b) visible to the **AI copilot**, and (c) **resolved** — autonomously when
it's a no-brainer, or by texting Alex a short multiple-choice question when a
human call is genuinely needed. The whole loop runs through the existing
copilot action registry, so resolutions are allowlisted and risk-tiered.

## The autonomy boundary (Alex's rule — load-bearing)

**The copilot contacts Alex ONLY for these five classes. Everything else it
resolves autonomously and silently.**

1. **Financial** — anything that moves money or risks revenue (failed charge,
   refund decision, Stripe/payout issue, pricing change).
2. **Customer resolution problem** — an issue affecting a specific customer
   that needs a judgment call to resolve.
3. **Customer human-review request** — a customer explicitly asked for a human.
4. **Business / strategic question** — anything that changes how the business
   operates or is positioned.
5. **Hard blocker needing Alex's hands** — credentials, login, payment method,
   API key/token, registrar/Replit/2FA clicks — things the copilot physically
   cannot do.

Everything outside these five → **auto-resolve, no notification** (log it; only
surface after-the-fact if noteworthy). When in doubt between "auto" and "ask",
the deciding question is: *does resolving this require information or authority
only Alex has?* If no → auto.

This maps directly onto the existing `ActionRiskTier` in
`server/services/copilotActionRegistry.ts`:
- `auto`  → executes immediately, no confirmation (the no-brainers).
- `low` / `draft` → require Alex (the five classes above) → routed to the SMS
  escalation flow instead of a dashboard confirm-click when Alex is away.

## Build on what already exists (do NOT reinvent)

- **Health probes:** `server/routes/healthz.ts` already checks db, doppler,
  stripe, twilio, google_maps, bing, redis. Extend this pattern per-product
  and per-tool rather than starting fresh. `integrationHealthRoutes.ts` +
  `deploymentHealthRoutes.ts` already exist.
- **Incident store:** `systemAlerts` table + `storage.createSystemAlert` /
  `listSystemAlerts` (severity / category / acknowledged). Health incidents
  are system alerts with a `category="health"` + structured metadata.
- **Resolution engine:** `copilotActionRegistry` — allowlisted `CopilotAction`s
  with `execute(action, confirmedByUserId)` and risk tiers. Each known
  health failure maps to a registered resolution action.
- **SMS:** `sendSMS(...)` in `server/twilioClient.ts`. Target Alex at
  `+1-416-910-9666` (store as `ALEX_ALERT_PHONE` in Doppler, not hardcoded).
- **Nav surface:** the `<ProductHealthDot productId>` slot already rendered on
  every product row in `AdminLayout.tsx` (Wave 138) — currently returns null.
- **Copilot UI:** `AdminCopilot.tsx` + `server/services/copilot/`.

## Architecture

```
 product/tool health checks ──► health aggregator ──► systemAlerts (category=health)
        (per-product probes)      /api/admin/health         │
                                        │                    ├─► Overview "System Health" panel (always-on)
                                        │                    ├─► <ProductHealthDot> on every nav row
                                        │                    └─► incident → resolution router
                                                                          │
                                              ┌───────────────────────────┴───────────────────────────┐
                                       maps to a registered CopilotAction                              │
                                              │                                                        │
                                     risk = "auto"                                          risk = low/draft
                                     (no-brainer)                                       (one of the 5 classes)
                                              │                                                        │
                                     execute() immediately,                          sendSMS(Alex, "<issue>. Reply:
                                     log to systemAlerts as                           1) <opt>  2) <opt>  3) <opt>")
                                     auto_resolved                                              │
                                                                                    inbound SMS webhook parses reply
                                                                                    → execute the chosen action
```

### Health signal model
- A `ProductHealth` = `{ productId, status: "ok"|"degraded"|"down", checks: [{name, ok, detail, latencyMs}], lastCheckedAt }`.
- Per-product probe registry (mirror healthz): each product registers 1–N
  checks (e.g. MapGuard → GBP API reachable + quota remaining; TradeLine →
  Twilio voice reachable + A2P campaign active; tools → each external API key
  valid + last-run success). Tools get the same treatment (Serper key, etc.).
- `GET /api/admin/health` → aggregate `{ products: ProductHealth[], tools:
  ToolHealth[], overall: "ok"|"degraded"|"down" }`. Cached ~60s; cron refresh.

### UI
- **Overview home:** a pinned-top `<SystemHealthPanel>` — always visible (Alex's
  choice), green one-liner when all-OK, expands + turns red with the issue list
  when something's wrong. Each issue shows what's broken + whether the copilot
  is already on it ("copilot resolving →" / "needs you — replied via SMS").
- **Nav dots:** `<ProductHealthDot>` reads the same aggregate; green ✓ / amber ⚠
  / red ✕ per product row.

### Escalation channel — decided 2026-05-29

Reuse the EXISTING founder-notification preference, don't invent a new one:
`/api/user/ai-contact` (`founderNotifyRoutes.ts`) already stores the admin's
`ai_contact_method` ∈ {`dashboard`, `sms`, `whatsapp`} + `ai_contact_phone`,
and `/api/admin/notices` is the AI agenda. The health escalations are agenda
notices + (optionally) a push on the chosen channel.

**Channel reality (both phone channels are approval-gated):**
- **SMS** — gated by the A2P 10DLC campaign (`TWILIO_CAMPAIGN_SID`, was
  IN_PROGRESS). Until approved, deliverability is unreliable (Alex's +1-416 is
  Canadian — softer enforcement than US, but still gated). Don't depend on it
  yet.
- **WhatsApp** — the Meta WhatsApp Cloud API IS integrated
  (`services/whatsappCloudService.ts`, `WHATSAPP_API_KEY`, used by SocialSync),
  BUT proactive business-initiated messages need an **approved Meta "utility"
  message template** (free-form WA only works ≤24h after the user messages the
  number). So WhatsApp alerting needs a template submitted + approved first.

**Decision: `dashboard` is the default + always-works channel.** The always-on
System Health panel + the AI-agenda notice (with the copilot's options #1/2/3
rendered inline, reply by clicking or typing in the copilot) need ZERO external
approval and work today. `whatsapp` / `sms` are opt-in upgrades Alex flips in
`ai_contact_method` once their approvals clear — no rework, the dispatcher just
gains a channel. Alex's preference: WhatsApp once usable; silent-mode phone so
no quiet-hours logic needed.

### Alert → escalate → reply → resolve loop
- New incident (not already open for that product+check) →
  - classify against the autonomy boundary.
  - `auto` → run the resolution action; record outcome on the alert; done.
  - escalate → write an AI-agenda notice with options #1/2/3 (always), AND if
    `ai_contact_method` is `sms`/`whatsapp` AND that channel is live, push the
    same question there. Message: `"<plain-English issue>. How resolve? 1)
    <option> 2) <option> 3) <option> — reply a number or describe."` Store the
    pending escalation keyed to the alert.
- **Reply ingestion** — two paths into the SAME handler:
  - in-dashboard: click an option / type in the copilot (works today).
  - inbound SMS/WhatsApp webhook (Twilio / `metaWhatsappWebhookRoutes`) → match
    reply to the open escalation. Number → run that option; free-text → copilot
    interprets → execute → confirmation reply.
- De-dupe + cooldown so a flapping check can't spam Alex (reuse the cooldown
  pattern from `socialSync/cooldownManager.ts`).

## Proposed wave breakdown

- **Wave 139 (this doc).** Spec.
- **Wave 140 — health signals + aggregator.** Per-product/tool probe registry,
  `GET /api/admin/health`, cron refresh, write incidents to `systemAlerts`.
  No UI yet. Backend-only, testable.
- **Wave 141 — surfaces.** `<SystemHealthPanel>` pinned on Overview + wire
  `<ProductHealthDot>` to the aggregate. Read-only; no resolution yet.
- **Wave 142 — resolution actions + autonomy router.** Register `CopilotAction`s
  for the common health failures with correct risk tiers; the router that
  auto-resolves `auto`-tier incidents and writes AI-agenda notices (with
  options #1/2/3) for the escalations.
- **Wave 143 — channel push + reply loop.** Dashboard reply path first (works
  today). Then the SMS/WhatsApp push + inbound-webhook reply parser, gated on
  each channel's approval (A2P for SMS; an approved Meta utility template for
  WhatsApp). cooldown/de-dupe.
- **Wave 144 — hardening.** Incident history view, false-positive tuning,
  per-check thresholds, "snooze this alert" controls.

## Decisions captured (2026-05-29)
- **Escalation channel:** `dashboard` is the always-works default (AI agenda +
  always-on health panel, zero approvals). `whatsapp`/`sms` are opt-in upgrades
  via the existing `ai_contact_method` preference once approvals clear.
- **WhatsApp:** preferred once usable; needs an approved Meta "utility" template
  (the Cloud API integration already exists).
- **SMS:** blocked on A2P 10DLC approval (campaign in progress); use as fallback
  once cleared.
- **Phone:** `+1-416-910-9666`, store as `ALEX_ALERT_PHONE` in Doppler when
  the phone channel goes live.
- **`auto` tier:** no always-confirm overrides — trust the registry risk tiers.
- **Quiet hours:** none — Alex uses phone silent mode.
- Quiet hours? (e.g. don't SMS 11pm–7am unless it's revenue-affecting.)

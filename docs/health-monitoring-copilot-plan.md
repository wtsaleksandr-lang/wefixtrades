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

### Alert → SMS → reply → resolve loop
- New incident (not already open for that product+check) →
  - classify against the autonomy boundary.
  - `auto` → run the resolution action; record outcome on the alert; done.
  - escalate → `sendSMS(ALEX_ALERT_PHONE, "<plain-English issue>. How resolve?
    1) <option>  2) <option>  3) <option>  — reply a number or describe.")`.
    Store the pending escalation keyed to the alert.
- **Inbound SMS webhook** (Twilio) → match the reply to the open escalation →
  if a number, run that option's action; if free-text, hand to the copilot to
  interpret → execute → reply confirmation SMS.
- De-dupe + cooldown so a flapping check can't text-spam Alex (reuse the
  cooldown pattern from `socialSync/cooldownManager.ts`).

## Proposed wave breakdown

- **Wave 139 (this doc).** Spec.
- **Wave 140 — health signals + aggregator.** Per-product/tool probe registry,
  `GET /api/admin/health`, cron refresh, write incidents to `systemAlerts`.
  No UI yet. Backend-only, testable.
- **Wave 141 — surfaces.** `<SystemHealthPanel>` pinned on Overview + wire
  `<ProductHealthDot>` to the aggregate. Read-only; no resolution yet.
- **Wave 142 — resolution actions + autonomy router.** Register `CopilotAction`s
  for the common health failures with correct risk tiers; the router that
  auto-resolves `auto`-tier incidents and queues the rest.
- **Wave 143 — SMS escalation + reply loop.** Outbound option-SMS to Alex,
  inbound reply webhook + parser, copilot executes the chosen resolution,
  cooldown/de-dupe. `ALEX_ALERT_PHONE` in Doppler.
- **Wave 144 — hardening.** Incident history view, false-positive tuning,
  per-check thresholds, "snooze this alert" controls.

## Open questions for Alex (capture before Wave 142+)
- Confirm `ALEX_ALERT_PHONE = +1-416-910-9666` and that SMS (not WhatsApp) is
  the channel. (A2P campaign already vetted for the WeFixTrades number.)
- For the `auto` tier: any specific action you want to ALWAYS confirm even if
  it looks no-brainer? (Default: trust the registry's risk tiers.)
- Quiet hours? (e.g. don't SMS 11pm–7am unless it's revenue-affecting.)

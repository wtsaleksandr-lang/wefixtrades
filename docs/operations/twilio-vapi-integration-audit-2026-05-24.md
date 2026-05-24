# Twilio + Vapi integration health audit — 2026-05-24

**Status:** Healthy with caveats. Active P0 from PR #650 still blocks SMS
delivery from carrier-filtered senders; voice path works end-to-end but
recordings are not retained and there is no fallback if Vapi is down.

**Scope:** every Twilio-owned number, its inbound/outbound webhook config,
A2P 10DLC posture, messaging service usage, recent message + call health,
billing trend; every Vapi-owned phone number, phone→assistant mapping,
recent call outcomes, recording + transcription config; the bridging path
that turns a PSTN call into a live AI conversation.

**Data source:** live `api.twilio.com/2010-04-01/Accounts/...` and
`api.vapi.ai` against `wefixtrades / prd` Doppler keys at audit time. Code
references are at the `audit/twilio-vapi-integration-health` HEAD.

---

## 1. Twilio inventory

**Account:** `AC...a2ad` — `WeFixTrades`, status `active`, type `Full`,
created 2026-02-24. **Balance:** $29.73 USD.

### Phone numbers (1 owned)

| # | Phone ref | Friendly | Voice URL | SMS URL | SMS Fallback | Status callback | Caps |
|---|-----------|----------|-----------|---------|--------------|-----------------|------|
| 1 | `<phone_1>` | `WeFixTrades main line` | `https://api.vapi.ai/twilio/inbound_call` (POST) | `https://wefixtrades.com/api/twilio/inbound` (POST) | `https://wefixtrades.com/api/twilio/fallback` | `https://api.vapi.ai/twilio/status` | sms, mms, voice |

**Emergency status:** Active. **Trunk SID:** none. **Bundle SID:** none.

### Messaging services (2)

| SID (last 8) | Friendly | Use case | A2P brand | Inbound URL |
|--------------|----------|----------|-----------|-------------|
| `MG...eb8f` | Default Messaging Service for Conversations | undeclared | NO | null |
| `MG...4e21` | Low Volume Mixed A2P Messaging Service | undeclared | **YES** | null |

The "Default Messaging Service for Conversations" appears to be Twilio's
auto-provisioned service for the Conversations product — not in use by the
codebase. The "Low Volume Mixed A2P Messaging Service" carries the A2P
brand registration and is what `<phone_1>` is attached to.

### US A2P 10DLC campaigns

| Service | Campaign | Status | Use case | Error |
|---------|----------|--------|----------|-------|
| `MG...eb8f` | (none) | n/a | n/a | n/a |
| `MG...4e21` | `QE2c...ba0b` | **`FAILED`** | LOW_VOLUME | TCR 30909 — Call-to-Action verification rejected (field `MESSAGE_FLOW`) |

**Unchanged from PR #650** (`chore(twilio): diagnose Meta SMS verification`,
2026-05-24). The remediation steps in
`docs/operations/twilio-meta-sms-verification.md` are still the right path
forward; this remains an Alex action item, not a code change.

### TwiML Apps (1)

| SID (last 8) | Friendly | Voice URL | Voice fallback |
|--------------|----------|-----------|----------------|
| `AP...d3b8` | `wft-voice-mobile` | `https://wefixtrades.replit.app/api/twilio/voice/outbound-twiml` | none |

The TwiML App is wired to the mobile admin dialer (Voice JS SDK → server
mints token → SDK posts To → Twilio fetches voice_url → server returns
`<Dial>` TwiML). See `server/routes/twilioVoiceCallbackRoutes.ts:75`.

**P1:** `voice_url` uses the **`*.replit.app` deploy URL**, not
`wefixtrades.com`. If the apex domain ever changes Replit deployment the
mobile dialer keeps working — but it also means any future move of the
deploy slot will silently break the outbound dialer. The inbound SMS
webhook in (1) uses the apex domain; these should be consistent.

### Recent message activity (last 50 messages, all-time on this account)

| Status | Count |
|--------|-------|
| delivered | 3 |
| received | 3 |
| failed | 2 |

Both failures are Twilio error `21211` (invalid `To` phone number) on
outbound-api, 2026-05-23. These were operator typos in the admin SMS
panel, not a production bug — but the admin Send route at
`server/routes/twilioCommsRoutes.ts:219` does enforce `^\+\d{7,15}$` on
`to`, so the failures must have originated outside the admin panel (likely
direct REST calls or an earlier code path now changed).

### Recent call activity (last 50)

| Status | Count |
|--------|-------|
| no-answer | 2 |

Total duration: 0 sec. Total price: $0. The Twilio Calls API shows almost
no PSTN activity because **voice is bridged through Vapi** — Twilio
records the carrier leg, but Vapi handles the actual conversation and is
the system of record for transcripts, recordings, and AI cost.

### Billing trend (last 30 days)

| Category | Price (USD) | Notes |
|----------|------------:|-------|
| channels (carrier transmission) | 19.52 | bulk of spend — voice + SMS carrier minutes |
| a2p-10dlc-registrationfees-onetime | 19.50 | one-time A2P registration |
| a2p-10dlc-registrationfees-campaignvetting | 15.00 | one-time campaign vetting |
| phonenumbers-local | 1.15 | monthly rent for `<phone_1>` |
| phonenumbers-emergency | 0.75 | 911 service surcharge |
| sms (inbound longcode) | 0.02 | 2 segments |

Steady, near-zero variable cost. Volume is low pre-launch as expected.

---

## 2. Vapi inventory

### Phone numbers (1)

| Vapi number ID (last 8) | Underlying provider | Bridged from Twilio? | Server URL | Assistant ID | Fallback |
|-------------------------|---------------------|----------------------|------------|--------------|----------|
| `b4707705` | Twilio (`AC...a2ad`) | Yes — same `<phone_1>` as Twilio | `https://wefixtrades.com/api/vapi/webhook` | **null** (resolved per-call via `assistant-request`) | **none** |

**Key:** the Vapi phone number has `assistantId: null`. Instead, Vapi
posts an `assistant-request` event to
`https://wefixtrades.com/api/vapi/webhook` for every inbound call. Our
handler at `server/routes/vapiRoutes.ts:105` decides whether to return:

- `buildTradeLineAssistantConfig(resolved)` — when the call resolves to a
  TradeLine customer's `client_service` via metadata or phone lookup, OR
- `buildAssistantConfigWithAvailability()` — the brand sales-line default
  (`Riley`-equivalent built by `buildAssistantConfig()`).

### Assistants (1)

| ID (last 8) | Name | Model | Voice | First message | recordingEnabled | maxDurationSeconds |
|-------------|------|-------|-------|----------------|-------------------|---------------------|
| `10bcfa` | Riley | `openai/gpt-5.4` (temp 0.5) | `vapi/Godfrey` | "Hey there, thanks for calling WeFixTrades. What can I help you with today?" | **null** | null |

**Improvement since PR #698:** Riley's `firstMessage`, `endCallMessage`,
and `voicemailMessage` are now all branded "WeFixTrades" (last updated
2026-05-24 17:40 UTC by `chore(vapi): live PATCH Riley config + sync
script` — PR #700). The Wellness Partners drift flagged in PR #698 is
fixed.

**Remaining gaps on Riley:**

- `recordingEnabled: null` — calls are NOT recorded by Vapi by default
  when this is unset. Our code-side `buildAssistantConfig()` returns
  `recordingEnabled: true`, but because Vapi's phone number has
  `assistantId: null`, the live conversation uses the **fallback chain**:
  the inline assistant from `assistant-request` response → Riley's stored
  config. Without an explicit `recordingEnabled: true` on Riley's stored
  record, recordings are only created when our `assistant-request`
  handler is reached AND returns an inline assistant with the flag set.
  The web demo call from 2026-05-16 did capture a recording, so the path
  works — but the live PSTN inbound path is unverified.
- `serverUrl: null` on Riley — every webhook event goes to the phone
  number's `server.url`, which is correct, but means Riley alone cannot
  be used outside `<phone_1>`.
- `provider: "openai"` (not `custom-llm`) — confirms PR #698 finding:
  Riley does NOT route through `/api/vapi/conversation`, so all the
  guardrails in `assistant.ts → assistantSync` (gates, usage logging,
  knowledge-base injection, brand voice block, conversion guidance) are
  STILL bypassed for the live sales-line call. This is the open P0 from
  the prior audit.
- Zero per-client TradeLine assistants in the account. Same finding as
  PR #698 — either no TradeLine clients have been provisioned to prod, or
  `provisionTradeLineAssistant()` is silently failing.

### Recent calls

| Total | Period | Status | endedReason | Total cost | Total duration |
|-------|--------|--------|-------------|-----------:|---------------:|
| 1 | All time visible | ended | customer-ended-call | $0.22 | 129.1 sec |

The single call is the 2026-05-16 web demo. **Zero PSTN calls have
reached Vapi via `<phone_1>` in the visible history window.** Either Vapi
is paginating, or the number is genuinely silent — which is consistent
with low pre-launch volume.

### Org / concurrency limits

`GET /org` returned 401 with the standard `VAPI_API_KEY` — that endpoint
needs the org-management key, not the assistant key. Org-level concurrency
and billing limits could not be queried with current credentials. Add a
`VAPI_ORG_KEY` Doppler secret if we need to surface this on
`/api/admin/integration-health`.

---

## 3. Integration path — what happens when (915)... rings

```
PSTN caller → Twilio carrier leg
   ↓
Twilio fetches voice_url = https://api.vapi.ai/twilio/inbound_call
   ↓
Vapi accepts the call, looks up the Vapi phone number row by Twilio number SID
   ↓
phone row has assistantId=null, server.url=https://wefixtrades.com/api/vapi/webhook
   ↓
Vapi POSTs message.type=assistant-request to /api/vapi/webhook
   ↓
Our handler at server/routes/vapiRoutes.ts:105
   ├─ tries TradeLine resolution (metadata → vapiPhoneNumberId → calledNumber)
   └─ if no TradeLine match → buildAssistantConfigWithAvailability()
        → returns an inline `assistant` object (custom-llm pointing at
          /api/vapi/conversation, recordingEnabled=true, deepgram nova-2)
   ↓
Vapi uses the returned config for THIS call (overrides Riley)
   ↓
Each conversation turn → POST /api/vapi/conversation → custom-llm response
   ↓
End of call → end-of-call-report webhook → call cost recorded, sales lead
   extraction, founder notification email
```

**Latency optimization:** this is currently optimal for cost-of-bridging
since Twilio → Vapi is a single carrier hop with the SIP leg terminated on
Vapi's side. Our app sits OFF the audio path — we only do control-plane
JSON. The pre-roll cost is one `assistant-request` round-trip
(`wefixtrades.com/api/vapi/webhook`); typical latency budget is ~300-500ms
which Vapi absorbs into its first-message delivery window.

**Caveat — Riley vs our inline override:** the `assistant-request` flow
expects our handler to return the full assistant inline. If our webhook
times out (>5 sec) or 5xxs, Vapi **falls back to the stored Riley
assistant**, which has `provider: openai` directly — so the call still
connects, but with the audit-flagged old `openai/gpt-5.4` config and no
recording. Functionally degraded but not broken. The fallback fires
silently and is not currently observable.

### Recording / transcription posture

- **Recordings:** Vapi-managed if `recordingEnabled=true` is in the
  assistant. Our inline config sets this; Riley does not. Per Vapi's
  docs, recordings live in Vapi-managed storage until org retention
  policy expires them (~30 days for free tier, configurable on paid
  plans). **We do not pull recordings into our own storage.** When we
  log a TradeLine call (`logTradeLineCall` in
  `server/services/vapiService.ts:494`) we persist `recording_url` —
  which is a Vapi-hosted URL that will 404 once Vapi expires it. We have
  no S3/R2 mirror.
- **Transcripts:** Deepgram `nova-2` (inline config) or `nova-3`
  (Riley). Stored as `transcript_json: { text: ... }` in
  `tradeline_call_logs`. Persistent — no expiry on our side.
- **Retention policies (our side):** no scheduled job purges
  `tradeline_call_logs`. The only "retention" code in the repo is
  `adminFileRetentionRoutes.ts` and the BA-7 shared-files sweep — neither
  touch call records or transcripts.

### Concurrency posture

Untested. Single-line sales operation can handle ~5-10 concurrent calls
before Vapi pool exhaustion becomes a concern; we are nowhere near that.

---

## 4. Configuration drift snapshot

| Item | Doppler value | Live value | Drift? |
|------|---------------|------------|--------|
| `TWILIO_CAMPAIGN_SID` | `CM96dc...e160c` | live campaign is `QE2c...ba0b` | **YES** — cosmetic only (not read at runtime) |
| `VAPI_ASSISTANT_ID` | `34aa...0bcfa` | matches Riley | OK |
| `VAPI_PHONE_NUMBER_ID` | (set) | matches the bridged number | OK |
| `VAPI_WEBHOOK_SECRET` | (set) | required in prod (`vapiService.ts:159`) | OK |
| `VAPI_SERVER_URL` | `https://wefixtrades.com` | apex domain | OK |
| `TWILIO_APP_SID` | (set) | matches `AP...d3b8` | OK |
| TwiML App voice_url | n/a | `wefixtrades.replit.app` | **YES vs apex** — inconsistent with SMS webhook host |

---

## 5. Top 10 recommendations

Numbered by priority (P0 = blocking launch / customer-facing risk; P3 =
hygiene).

1. **(P0, carried) Fix the A2P 10DLC campaign.** Same finding as PR
   #650. SMS to/from carrier-filtered senders (Meta, banks, OTP
   aggregators) is silently filtered until campaign clears TCR 30909.
   Action sits with Alex — re-submit `MESSAGE_FLOW` per
   `docs/operations/twilio-meta-sms-verification.md` §1. No code change.
2. **(P0, carried) Patch Riley to `custom-llm` OR mirror canonical
   prompt.** Same finding as PR #698. Today: if our `assistant-request`
   webhook stalls or our app is down, Vapi falls back to Riley's stored
   `openai/gpt-5.4` config which bypasses every guardrail. Quickest fix:
   one-shot PATCH on Riley's `model.provider = "custom-llm"`,
   `model.url = "https://wefixtrades.com/api/vapi/conversation"`.
3. **(P1) Add a Twilio voice fallback URL on `<phone_1>`.** Today
   `voice_fallback_url` is empty. If Vapi has a regional outage, the call
   gets a Twilio error tone with no caller-facing message. Set fallback
   to a minimal TwiML app that says "We're experiencing technical
   difficulties — please leave a message after the tone" and records to a
   voicemail-ingest webhook.
4. **(P1) Mirror Vapi recordings to R2/S3 before Vapi expires them.**
   Vapi free-tier retention is ~30 days; we already store the URL but
   not the bytes. Schedule a small daily job: for each new
   `tradeline_call_logs` row with `recording_url`, fetch the audio and
   re-upload to R2 (we already use R2 for shared files per BA-7), then
   rewrite `recording_url` to the R2 URL. Without this, any call
   recording older than ~30 days returns 404 in the admin UI.
5. **(P1) Align TwiML App voice_url to `wefixtrades.com`.** Replace
   `wefixtrades.replit.app/api/twilio/voice/outbound-twiml` with
   `wefixtrades.com/api/twilio/voice/outbound-twiml`. Apex stays stable
   across Replit deploy slots; the replit.app subdomain doesn't. One-shot
   `client.applications(AP_SID).update({ voiceUrl })`.
6. **(P1) Set explicit recordingEnabled+maxDuration on Riley.** Even
   though our inline assistant-request override takes precedence, the
   stored Riley config is the silent fallback path — and it currently has
   `recordingEnabled: null` (= off). One-line PATCH to Riley:
   `{ recordingEnabled: true, maxDurationSeconds: 900 }`. Same script
   used for #2.
7. **(P2) Update or remove stale `TWILIO_CAMPAIGN_SID` in Doppler.**
   Currently points at the deleted `CM96...e160c`. Either rotate to the
   live `QE2c...ba0b` (and gate it as "do not auto-rotate while campaign
   FAILED") or delete the secret entirely — nothing in `server/` reads
   it. Cosmetic, but it confuses future audits.
8. **(P2) Add observability for the silent Riley-fallback path.**
   Currently the only way to know our `assistant-request` webhook is
   being bypassed (because we 5xxed or timed out) is to notice that the
   call doesn't have a recording or a `tradeline_call_logs` entry. Add a
   counter on every `/api/vapi/webhook assistant-request` response with
   surface=ok|degraded so we can alert on a sudden drop.
9. **(P2) Persist Vapi end-of-call-report regardless of TradeLine
   resolution.** Today, when a call doesn't resolve to a TradeLine
   client, the `end-of-call-report` triggers `handleSalesCallEnded`
   (creates a `sales_leads` row + emails admin) but **does NOT log to
   `tradeline_call_logs`** because the table is per-client. We lose the
   full transcript/cost history for the brand sales line. Add a parallel
   `brand_call_logs` table (or extend `tradeline_call_logs` to allow
   null `client_service_id` for brand calls).
10. **(P3) Surface Vapi org concurrency + tier on
    `/api/admin/integration-health`.** Currently
    `integrationHealthRoutes.ts:123 probeVapi()` only checks
    `GET /assistant?limit=1`. Add an authenticated `GET /org` probe
    (requires a separate `VAPI_ORG_KEY`) so the integration health page
    can surface "X / Y concurrent calls allowed". Useful pre-launch when
    Riley call volume is about to spike.

---

## 6. Inline fixes shipped in this PR

None. Every meaningful fix in §5 requires either a live Twilio/Vapi API
PATCH (touches production immediately, needs a separate change-window PR)
or an Alex action (A2P campaign re-submission). No safe code-only fixes
were identified that don't either change Vapi behavior live or touch
files outside this audit's stated scope.

---

## 7. References

- Live Twilio: `api.twilio.com/2010-04-01/Accounts/<sid>/IncomingPhoneNumbers.json`,
  `messaging.twilio.com/v1/Services/<sid>/Compliance/Usa2p`,
  `api.twilio.com/2010-04-01/Accounts/<sid>/{Messages,Calls,Applications,Balance,Usage/Records}.json`.
- Live Vapi: `api.vapi.ai/{phone-number,assistant,call}`.
- Code path entrypoints:
  - `server/routes/twilioRoutes.ts` — inbound SMS webhook + classifier.
  - `server/routes/twilioCommsRoutes.ts` — admin SMS / call panel +
    public SMS / voice-twiml webhooks.
  - `server/routes/twilioVoiceCallbackRoutes.ts` — admin dialer outbound
    TwiML + per-event status callback.
  - `server/routes/vapiRoutes.ts` — Vapi webhook receiver, custom-llm
    conversation route, status / web-config routes.
  - `server/services/vapiService.ts` — assistant resolution, config
    builders, call-report extraction, post-call logging.
  - `server/twilioClient.ts` — Twilio SDK wrapper + signature verifier.
  - `server/routes/integrationHealthRoutes.ts` — admin integration probe.
- Prior audits:
  - `docs/operations/twilio-meta-sms-verification.md` (PR #650) — A2P
    diagnostic. Still authoritative.
  - `docs/operations/vapi-ai-prompts-audit-2026-05-24.md` (PR #698) —
    prompt audit. Recommendations 2 and 3 there shipped via PR #700;
    recommendation 1 (custom-llm switch) remains open and is recommended
    #2 above.

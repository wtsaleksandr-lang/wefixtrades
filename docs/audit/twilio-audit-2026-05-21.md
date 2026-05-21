# W-AU-5 — Twilio (SMS + Voice) audit — 2026-05-21

Audit of the Twilio integration powering the admin Communications panel
(`/admin/communications`) and the broader inbound/outbound messaging +
voice pipeline.

## TL;DR

**Verdict: operational.** Doppler `wefixtrades/prd` has every Twilio key
the codebase reads (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_PHONE_NUMBER`, `TWILIO_API_KEY`, `TWILIO_API_KEY_SECRET`,
`TWILIO_APP_SID`, plus iOS + Android push credentials). The SCORECARD
note "Wave V voice dialer code-complete but unconfigured (no
TWILIO_API_KEY/APP_SID/TwiML App in prod)" is **stale** — those env vars
exist in prd. The remaining unknowns are runtime (TwiML App's Voice URL
must point at `/api/twilio/voice/outbound-twiml`; SMS number's "A
MESSAGE COMES IN" must point at `/api/twilio/inbound`).

Two real security gaps were fixed inline (signature verification on two
public webhooks). One `WHATSAPP_NUMBER` is genuinely missing in prd
(low priority — WhatsApp channel is optional).

## Capability matrix

| Capability | Status | Doppler env (prd) | Notes |
|---|---|---|---|
| Send SMS (admin → contact) | works | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` all set | `POST /api/admin/twilio/messages`, requires admin auth, validates E.164 + max 1600 chars |
| Send WhatsApp | partial | `TWILIO_WHATSAPP_NUMBER` MISSING in prd | Falls back to `TWILIO_PHONE_NUMBER` if set; WhatsApp template approval also needed |
| Outbound voice call (admin dialer) | works (code-complete + configured) | `TWILIO_API_KEY/_SECRET/APP_SID` all set | Voice JS SDK `Device.connect()` → server mints token at `/api/admin/twilio/voice-token` → Twilio hits `/api/twilio/voice/outbound-twiml` to route. Confirmed sig-verified + XML-escaped |
| Outbound voice call (mobile Voice SDK) | works | Same + push credential SIDs set | `mintAccessToken()` adds `pushCredentialSid` for inbound push; outbound works regardless |
| Inbound SMS receive | works | `TWILIO_AUTH_TOKEN` for sig verify | Twilio Console number → "A MESSAGE COMES IN" → `POST /api/twilio/inbound` (NOT `/sms-webhook`). Sig verified, deduped, AI auto-reply via `aiChatEngine` |
| Inbound voice (TwiML) | partial | All present | No dedicated `/api/twilio/voice/inbound` route. The Voice SDK `incomingAllow:true` + Push Credential delivers calls to the mobile app via push notification; browser admin dialer receives via `Device.on('incoming')`. Inbound to a PSTN-only fallback is NOT wired |
| Inbound call/SMS log (admin) | works | n/a | `GET /api/admin/twilio/calls` + `/messages` — passthrough to Twilio REST API, 15-30s polling |
| Per-customer messaging history | works | n/a | `GET /api/admin/twilio/messages/thread?contact=+1...` issues two filtered list calls and merges |
| Number purchase flow | works (used for tradelines) | All present | `server/services/tradelineSetup/provisionNumber.ts` uses `incomingPhoneNumbers.create()` — not exposed to admin UI, called from tradeline provisioning |
| TwiML signature verification | now ENFORCED everywhere | `TWILIO_AUTH_TOKEN` | See "Fixes" below — was missing on 2/4 public webhooks |

## Doppler env in prd (existence-only — values not echoed)

```
TWILIO_ACCOUNT_SID                  SET (len 34)
TWILIO_AUTH_TOKEN                   SET (len 32)
TWILIO_PHONE_NUMBER                 SET (len 14)
TWILIO_API_KEY                      SET (len 34)
TWILIO_API_KEY_SECRET               SET (len 32)
TWILIO_APP_SID                      SET (len 34)
TWILIO_PUSH_CREDENTIAL_SID_IOS      SET (len 34)
TWILIO_PUSH_CREDENTIAL_SID_ANDROID  SET (len 34)
TWILIO_WHATSAPP_NUMBER              MISSING (optional — WhatsApp channel only)

Plus A2P 10DLC bundle SIDs (TWILIO_BRAND_REGISTRATION_SID,
TWILIO_CAMPAIGN_SID, TWILIO_CUSTOMER_PROFILE_SID,
TWILIO_EXTERNAL_BRAND_ID, TWILIO_LINKED_MESSAGING_SERVICE,
TWILIO_TRUST_HUB_A2P_BUNDLE_SID) — all SET.
```

## Webhook endpoints — current state

| Route | Public? | Sig verified? | Purpose |
|---|---|---|---|
| `POST /api/twilio/inbound` | yes | yes | Customer inbound SMS → AI reply via OpenAI (full pipeline) |
| `POST /api/twilio/sms-webhook` | yes | **yes (FIXED — was no)** | Lightweight log-only; admin panel reads Twilio API directly |
| `POST /api/twilio/voice-twiml` | yes | **yes (FIXED — was no)** | Legacy simple Dial TwiML — also XML-escaped now |
| `POST /api/twilio/voice/outbound-twiml` | yes | yes | Primary outbound TwiML for SDK-initiated calls (mobile + admin) |
| `POST /api/twilio/voice/status` | yes | yes | Call lifecycle status callback → upserts `mobile_call_records` |
| `POST /api/voicemails/inbound` (in voicemailRoutes) | yes | yes | Inbound voicemail webhook |

## Inline fixes applied

1. **`server/routes/twilioCommsRoutes.ts`** — `/api/twilio/sms-webhook`
   was accepting unsigned POSTs. Now calls `verifyTwilioSignature()` and
   returns `403 <Response/>` on mismatch. Low actual risk (route just
   logs and returns empty TwiML) but cleanups public surface.

2. **`server/routes/twilioCommsRoutes.ts`** — `/api/twilio/voice-twiml`
   was accepting unsigned POSTs. **This was a toll-fraud vector**: any
   internet caller who knew the URL could POST `To=<premium-rate-number>`
   and Twilio would have dialed it from Alex's number with Alex's
   `callerId`. Now signature-verified; `To` value is XML-escaped to
   prevent TwiML injection (`fromNumber` is server-controlled but also
   escaped defensively).

3. **`.env.example`** — Twilio section was missing the four voice keys
   (`TWILIO_API_KEY`, `TWILIO_API_KEY_SECRET`, `TWILIO_APP_SID`, push
   credential SIDs) and the canonical `TWILIO_PHONE_NUMBER`. Added them
   with comments documenting which Twilio Console URL each webhook
   should be wired to.

## Deferred — Alex's tasks

These are *runtime configuration in Twilio Console*, not code:

1. Confirm the TwiML App referenced by `TWILIO_APP_SID` has its Voice
   URL pointing at `https://wefixtrades.com/api/twilio/voice/outbound-twiml`
   (POST) and Status Callback at `/api/twilio/voice/status`.
2. Confirm the phone number's "A MESSAGE COMES IN" webhook points at
   `https://wefixtrades.com/api/twilio/inbound` (the AI-reply route, not
   `/sms-webhook`).
3. Optional: set `TWILIO_WHATSAPP_NUMBER` in `wefixtrades/prd` if
   WhatsApp messaging is in scope for launch. Currently any
   `channel:"whatsapp"` send will use `TWILIO_PHONE_NUMBER` as a
   fallback, which only works if the number itself is WhatsApp-enabled.

## Deferred — code work (NOT done; flagged for later)

1. **Inbound PSTN voice fallback.** If the Voice SDK push (mobile) or
   browser tab (admin) is offline, there's no `<Dial>` to forward to a
   phone. A short voicemail-greet TwiML at `/api/twilio/voice/inbound`
   would close this gap — but voicemailRoutes already covers part of it.
2. **Duplicate `/api/twilio/sms-webhook` vs `/api/twilio/inbound`.** Two
   inbound SMS routes exist. `/sms-webhook` is a no-op log; `/inbound`
   is the real one. Consolidating is post-launch cleanup.
3. **Per-customer messaging history in admin UI** currently pulls
   directly from Twilio REST API (two `messages.list` calls per thread).
   Fine at current volume; cache table noted in `twilioCommsRoutes.ts`
   TODO comment.

## Validation

- `npx tsc --noEmit` — clean (no new errors).
- No outbound SMS or calls were placed during the audit.
- No raw secret values were read into context (existence-only checks
  via `doppler secrets get … | wc -c`-equivalent).

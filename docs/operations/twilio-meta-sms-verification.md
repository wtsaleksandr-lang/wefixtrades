# Twilio ↔ Meta SMS verification — diagnostic + remediation

**Status:** BLOCKED. Meta verification SMS is **not reaching** the WeFixTrades
admin Twilio number. Root cause confirmed below.

**Date of investigation:** 2026-05-24
**Branch:** `chore/twilio-meta-sms-diagnostic`
**Scope:** Inbound SMS from Meta (Facebook / WhatsApp Business / Meta Business
Suite verification flows) to the brand's primary Twilio long code, referenced
here as `<admin_phone>`.

---

## TL;DR

- Meta's UI accepts the number (green check) because Meta only validates the
  E.164 format and ownership claim. It does **not** test deliverability.
- Twilio has received **zero** SMS from Meta / Facebook / FB short codes against
  `<admin_phone>` in the entire message history (only 3 inbound messages ever,
  all from regular long-code numbers — Alex's test + two normal contacts).
- The Twilio webhook handler is healthy and correctly configured. This is **not**
  an app-side bug.
- **Root cause:** the US A2P 10DLC **campaign is in `FAILED` status** with TCR
  error code **30909** (Call-to-Action rejection). Until the campaign is
  approved, US mobile carriers (T-Mobile, AT&T, Verizon) heavily filter or
  outright block A2P traffic to `<admin_phone>` — including OTP / 2FA traffic
  originating from short-code aggregators such as the ones Meta uses.

---

## What was checked

### 1. Twilio inbound message history

Queried Twilio REST API `/Messages.json?To=<admin_phone>` for the full history
window:

| Window         | Inbound messages | From Meta / Facebook / FB short code |
| -------------- | ---------------- | ------------------------------------ |
| Last 7 days    | 1                | 0                                    |
| All time       | 3                | 0                                    |

All three historical inbound messages originated from standard 12-character
long codes (`+1XXXXXXXXXX`) — no short codes, no alphanumeric senders, no
message bodies matching `meta|facebook|fb code|whatsapp verif|business verif`.

This rules out the "Twilio received it and the webhook dropped it" hypothesis.
The SMS never crossed the Twilio carrier boundary.

### 2. Twilio inbound webhook config (`<admin_phone>`)

- `sms_url` → `/api/twilio/inbound` (POST) — set
- `sms_fallback_url` — set
- `status_callback` — set
- Capabilities — `{ sms: true, mms: true, voice: true }`
- Emergency status — Active

Webhook is correctly registered. The handler in
`server/routes/twilioRoutes.ts` validates Twilio signature, dedupes by
`MessageSid`, runs the `inboundClassifier` for unknown senders, and at worst
silently drops spam — it never rejects or 5xxs Meta-shaped traffic. App is not
the problem.

### 3. A2P 10DLC registration state

Via `messaging.twilio.com/v1/...`:

| Object                    | Status                                            |
| ------------------------- | ------------------------------------------------- |
| Brand Registration        | `APPROVED`, `identity_status=VERIFIED` (TCR linked) |
| Messaging Service         | "Low Volume Mixed A2P Messaging Service" — exists |
| `<admin_phone>` attached  | Yes (1 number on the messaging service)           |
| US A2P Campaign           | **`FAILED`**                                      |
| Campaign use case         | `LOW_VOLUME`                                      |
| Campaign has embedded link| `true`                                            |
| Sample messages provided  | 5                                                 |
| **TCR error code**        | **`30909`** — "Call to Action (CTA) verification rejected" |
| TCR error field           | `MESSAGE_FLOW`                                    |
| TCR error reference       | https://www.twilio.com/docs/api/errors/30909      |

The failed campaign is the binding constraint. A failed A2P campaign on a US
long code is the single most common cause of OTP / verification SMS being
silently dropped by carrier filtering — especially Meta, who uses high-volume
aggregator short codes that carrier filters apply the most aggressive
unregistered-receiver rules to.

### 4. Doppler drift (minor secondary finding)

`TWILIO_CAMPAIGN_SID` in Doppler `prd` points at a campaign SID that no longer
exists (`CM96dc...`). The live campaign attached to the messaging service is
`QE2c...`. This is cosmetic — nothing in the codebase reads `TWILIO_CAMPAIGN_SID`
at runtime today — but it should be updated once the campaign is re-approved
to avoid future confusion.

---

## Why Meta's UI shows a green check

Meta only validates that the number is E.164-formatted and that Alex can prove
control via *outbound* test (or the form just trusts the entry). It does not
synthetic-test a verification SMS through US carriers. So a number can be
"accepted" by Meta and still be unreachable from Meta's SMS provider — exactly
the state we're in.

---

## Remediation — actions Alex needs to take

In priority order. Items (1) and (2) are mandatory; (3)–(5) are fallbacks if
(1) takes too long.

### 1. Fix the A2P 10DLC campaign — REQUIRED, blocks launch

Open Twilio Console → Messaging → Regulatory Compliance → US A2P 10DLC →
Campaigns → the failed campaign (`QE2c...`).

The TCR rejection (`30909`, field `MESSAGE_FLOW`) means the carrier reviewer
could not verify the Call-to-Action — i.e. they could not confirm that the
end-user opt-in flow described in the `message_flow` field matches a publicly
discoverable page on `wefixtrades.com`. Standard fixes:

- The `message_flow` text must reference a **specific live URL** on
  `wefixtrades.com` (not just "users opt in on our website").
- That URL must be **publicly reachable** without auth and must display:
  - The exact text of the SMS opt-in checkbox
  - The phrase "Msg & data rates may apply"
  - A link to a privacy policy that mentions SMS / phone use
  - Frequency of messages ("up to N msgs/month")
- The `message_samples` must match the use case (transactional) and not
  contain promotional content unless the use case is `MIXED`.
- If embedded links are used (`has_embedded_links=true`), the link domain
  should be `wefixtrades.com` — public link shorteners are a frequent
  auto-reject trigger.

After updating, re-submit. TCR re-review is typically 1–3 business days. The
campaign will need to land in `VERIFIED` before carrier filtering relaxes.

### 2. While waiting — switch Meta verification off SMS

Meta's account verification flows almost all support an **email** alternative,
and Facebook Business Manager / Meta Business Suite supports **voice call** for
2FA. Use one of those right now so Alex isn't blocked on a multi-day TCR
review:

- Meta Business Suite → Security Center → 2FA → switch method to authenticator
  app or email.
- For domain / business verification, prefer the email or DNS TXT path.

### 3. Voice-call verification as a Twilio-side fallback

Voice OTP calls do not go through A2P 10DLC and are not affected by the failed
campaign. `<admin_phone>` already has `voice: true` capability. Any Meta flow
that offers "call me with the code" will work today.

### 4. Verified Caller ID is not relevant here

Verified Caller ID is about outbound voice presentation, not inbound SMS
deliverability. Mentioned only to dispel — don't go down that path.

### 5. Last resort — request a Toll-Free verification number

If A2P 10DLC re-review keeps failing, Twilio offers Toll-Free Verification with
a much simpler intake. Toll-free numbers receive OTP traffic from most
US carriers without 10DLC, but they have their own approval queue (~1 week) and
are not a free alternative — they're a parallel path.

---

## App-side: no code changes required

The investigation found no defect in `server/routes/twilioRoutes.ts`,
`server/twilioClient.ts`, or `server/services/inboundClassifier.ts`. The
inbound webhook would happily accept and classify any Meta verification SMS
that arrived. The diagnostic ends here on the carrier-registration side.

A small follow-up housekeeping item (out of scope for this PR): update or
remove `TWILIO_CAMPAIGN_SID` in Doppler `prd` once the campaign is re-approved
so it reflects the live campaign SID.

---

## References

- TCR error code 30909: https://www.twilio.com/docs/api/errors/30909
- Twilio A2P 10DLC overview: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc
- Twilio A2P campaign rejection guide: https://help.twilio.com/articles/8540151821339

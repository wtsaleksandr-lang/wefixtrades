# WeFixTrades sales-line — Twilio + Vapi provisioning checklist

> **Goal:** Get the brand's own sales line (`+1 (915) 615-3280`) answering calls
> with the AI assistant and replying to SMS automatically.
>
> **Status:** Code is wired (classifier + escalation + availability toggle).
> What follows is the manual setup that connects everything end-to-end.

You should only need to do this **once**. Estimated time: **30–45 minutes** if all
accounts are already created.

---

## 0. Pre-flight — confirm Replit Secrets

Open your Replit project → **Tools → Secrets** and verify these keys exist
(values can be hidden, just confirm the keys are listed):

| Key | Used for |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio API auth |
| `TWILIO_AUTH_TOKEN` | Twilio API auth + webhook signature verification |
| `TWILIO_PHONE_NUMBER` | Your sales number (`+19156153280`) |
| `VAPI_API_KEY` | Vapi server-side API |
| `VAPI_PUBLIC_KEY` | Vapi web/voice SDK (browser-side) |
| `VAPI_ASSISTANT_ID` | The assistant ID we'll create in Step 3 |
| `VAPI_PHONE_NUMBER_ID` | Vapi's reference to your Twilio number |
| `VAPI_SERVER_URL` | Your public URL (e.g. `https://wefixtrades.com`) |
| `VAPI_WEBHOOK_SECRET` | Verifies Vapi → server webhooks |

Your screenshots confirmed all of these are present. ✅

---

## 1. Twilio — confirm the number is fully provisioned

1. Sign in: <https://console.twilio.com>
2. **Phone Numbers → Manage → Active numbers** — confirm `+1 (915) 615-3280`
   is listed and **owned by this account**.
3. Click into the number. On the **Configure** tab:
   - **Voice & Fax → A Call Comes In:** leave as is for now (we'll set this
     in Step 4 via Vapi).
   - **Messaging → A Message Comes In:**
     - Set to **Webhook** with URL:
       `https://wefixtrades.com/api/twilio/inbound`
     - HTTP Method: **POST**
   - Save.
4. **Test the SMS path right now (optional but recommended):**
   - From your personal phone, text any message (e.g. *"hi"*) to
     `+1 (915) 615-3280`.
   - You should receive a polite canned reply within 5 seconds: *"Thanks for
     messaging WeFixTrades! A member of our sales team will reply within
     the hour."*
   - If you don't, check Replit logs for `[Twilio] brand-line classification`
     entries.

---

## 2. Vapi — register your Twilio number

1. Sign in: <https://dashboard.vapi.ai>
2. **Phone Numbers → Import phone number**.
3. Provider: **Twilio**.
4. Paste:
   - **Account SID:** your `TWILIO_ACCOUNT_SID`
   - **Auth Token:** your `TWILIO_AUTH_TOKEN`
   - **Phone number:** `+19156153280`
5. Save. Vapi will return a **Phone Number ID** (looks like `pn_xxxxxxxx`).
6. Copy that ID into Replit Secrets as `VAPI_PHONE_NUMBER_ID` (overwrite
   any old value).

---

## 3. Vapi — create the WeFixTrades assistant

1. **Assistants → Create Assistant** (top right).
2. Name: `WeFixTrades Sales & Support`.
3. **Model:**
   - Provider: **Custom LLM**
   - URL: `https://wefixtrades.com/api/vapi/conversation`
   - (This is where the classifier sits — it intercepts the first user turn
     and short-circuits spam / out-of-scope / availability-off.)
4. **First message:** `WeFixTrades, this is Riley — how can I help?`
   *(The brand-availability toggle replaces this dynamically when set to
   "unavailable".)*
5. **Voice:**
   - Provider: **11labs**
   - Voice: pick one you like — try `21m00Tcm4TlvDq8ikWAM` (Rachel, neutral
     American), or browse 11labs voices for one that matches the WeFixTrades
     brand tone. Optional: drop the voice ID into a new Replit secret
     `VAPI_WFT_VOICE_ID` so future re-provisions pick it up.
6. **Transcriber:**
   - Provider: **Deepgram**
   - Model: `nova-2`
   - Language: `en`
7. **Recording:** ✅ enabled.
8. **Max call duration:** 900 seconds (15 min — generous, in case a real lead
   wants to talk).
9. **End-call message:** `Thanks for calling WeFixTrades. We'll follow up
   shortly — have a great day.`
10. Save. Copy the resulting **Assistant ID** (`asst_xxxxxxxx`).
11. Paste it into Replit Secrets as `VAPI_ASSISTANT_ID` (overwrite any old
    value).

---

## 4. Vapi — wire the assistant to the phone number

1. Back in **Phone Numbers**, click your imported `+1 (915) 615-3280`.
2. **Inbound Settings → Assistant:** select the **WeFixTrades Sales & Support**
   assistant you just created.
3. Save.

That's it for the call leg. Vapi now answers any inbound call to your number
using your assistant.

---

## 5. Webhook secret — confirm Vapi ↔ server signature verification

1. In Vapi: **Account → Webhook Secret**.
2. Copy the secret value.
3. In Replit Secrets, set `VAPI_WEBHOOK_SECRET` to that exact value
   (overwriting any old one).
4. Restart your Replit app so the new secret is picked up.

(Without this, the server will refuse Vapi webhooks. Symptom: calls
disconnect after the assistant's first message.)

---

## 6. End-to-end smoke test

From your personal phone:

1. **Call** `+1 (915) 615-3280`. You should hear: *"WeFixTrades, this is
   Riley — how can I help?"* — followed by Riley waiting for you to speak.
2. Say something normal: *"What's TradeLine?"* — you should get a real
   product answer.
3. Hang up. In Replit logs you should see:
   - `[vapi] brand-call classification` (with `action: reply` and
     `category: legitimate`)
   - A normal conversation transcript.
4. **Text** `+1 (915) 615-3280` with: *"Hey, I'm a plumber in Toronto, what's
   your pricing?"* — you should get a confirm-receipt reply within seconds.
5. **Text** something obvious-spam: *"BUY CRYPTO 10X RETURNS CLICK
   bit.ly/xyz"* — you should get **no reply at all** (silently dropped).
   In Replit logs: `[Twilio] brand-line classification` with
   `action: drop`, `category: spam`.

---

## 7. The availability toggle — try it

1. Open `https://wefixtrades.com/admin/system/availability`.
2. Toggle **OFF**. Edit the away message if you want.
3. From your phone, text the sales line again with a normal inquiry.
4. You should get the **away message + ticket reference** instead of the
   normal canned reply.
5. Open `/admin/crm/support` — your ticket should be listed under the
   internal pseudo-client `WeFixTrades · Internal`.
6. Toggle **back ON** when done.

---

## 8. Day-to-day operations

Once provisioned:
- **All call transcripts + recordings** appear in `/admin/crm/tradeline-ops`
  under the WeFixTrades · Internal client.
- **All SMS conversations** appear under the same client (the brand pseudo-
  client is auto-created on first use).
- **Tickets escalated by the AI** appear in `/admin/crm/support` with
  source = `ai_escalation`.
- **Toggle availability OFF** any time you're driving / in a meeting / on
  vacation. The AI takes a message and creates a ticket.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Call rings then disconnects immediately | `VAPI_WEBHOOK_SECRET` wrong or missing in Replit Secrets |
| AI answers but speech is bad | Wrong 11labs voice ID — try the default `21m00Tcm4TlvDq8ikWAM` |
| SMS replies say *"We couldn't find your record"* | The Twilio webhook is hitting the OLD per-customer code path. Confirm the SMS webhook URL in Twilio is `/api/twilio/inbound` and that the latest code is deployed. |
| Spam still gets a reply | Check the classifier ran by grepping logs for `[Twilio] brand-line classification` — if absent, the request might be hitting the per-customer path because it matched a lead. |
| "Internal pseudo-client not found" in logs | Will auto-create on the first ticket; nothing to do. |

---

## What's wired in code (for reference)

- `server/routes/twilioRoutes.ts:78` — brand-line fallback that runs
  `decideInboundAction()`.
- `server/routes/vapiRoutes.ts:295` — first-turn classifier in the Vapi
  conversation handler.
- `server/services/inboundClassifier.ts` — two-stage classifier (regex +
  Claude haiku) + ticket-escalation helper.
- `server/services/vapiService.ts:557` — `buildAssistantConfigWithAvailability()`
  swaps the assistant's first message when availability is OFF.
- `client/src/pages/admin/SystemAvailabilityPage.tsx` — toggle UI.

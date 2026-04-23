# WeFixTrades Company Phone Line — Vapi Setup Guide

This is the **company phone number** — the one prospects call to ask about
our services. It's separate from the per-customer TradeLine phone lines
(those are provisioned automatically when a customer buys TradeLine).

The AI assistant on this line handles sales + support 24/7, pulls answers
from our knowledge base, captures lead info, and emails a summary to the
team after every call.

---

## What you'll end up with

- A real phone number customers can call
- Vapi AI answers in 1 second, 24/7
- It knows pricing, service details, trial/guarantee policy, onboarding flow
- Captures the caller's name, business, email, trade type
- Creates a `sales_leads` row in the CRM
- Emails a transcript + summary to `ADMIN_EMAIL` after every call
- Hard cap at 15 minutes per call, ends politely

---

## Prerequisites

1. Vapi account with billing enabled
2. `VAPI_API_KEY` already in your `.env`
3. Server deployed and reachable from the internet (Vapi needs to call it)
4. `VAPI_SERVER_URL` set to your public base URL (e.g. `https://wefixtrades.com`)
5. `VAPI_WEBHOOK_SECRET` set for signature verification
6. `ADMIN_EMAIL` set — that's where call summaries go
7. `ANTHROPIC_API_KEY` set — the assistant runs on Claude
8. `SMTP_*` creds set — otherwise no summary emails will send

---

## Step-by-step setup (~15 minutes)

### 1. Buy a phone number in Vapi

1. Go to https://dashboard.vapi.ai → **Phone Numbers**
2. Click **Buy Number**
3. Pick an area code appropriate for your market (a 1-800 number is fine;
   a local area code often converts better for local trades businesses)
4. After purchase, copy the **Phone Number ID** (UUID)

### 2. Point the number at our webhook

Still in the Phone Numbers screen, with your new number selected:

1. Under **Server URL**, paste: `https://YOUR-DOMAIN.com/api/vapi/webhook`
2. Under **Server URL Secret**, paste the value of your `VAPI_WEBHOOK_SECRET` env var (generate one with `openssl rand -hex 32` if you don't have one yet)
3. **Fallback destination** → leave empty (the assistant handles everything)
4. Save

### 3. Tell Vapi to fetch assistant config from us (not its own dashboard)

With your phone number still selected:

1. Under **Assistant**, select **"Dynamic"** or **"Custom Assistant"**
2. This tells Vapi to call our server's `assistant-request` webhook on each
   incoming call — our server returns the full assistant config from
   `server/services/vapiService.ts:buildAssistantConfig()`
3. Save

That's it on Vapi's side. The assistant is defined in code, so any edits
to the first message, prompt, voice, etc. happen in the codebase — not in
the Vapi dashboard.

### 4. Update the public phone number on the site

Once the number is purchased, two places currently use a **placeholder**
(`+1 (555) 123-4567`) that need to be swapped for the real number:

- `client/src/pages/marketing/contact.tsx` — `data-testid="contact-phone"`
- `client/src/components/marketing/MarketingLayout.tsx` — `data-testid="footer-phone"`

Search-replace the placeholder string with your new Vapi number.

### 5. Test the call

1. Call the new number from your own phone
2. Expect: first message is
   *"Hi, thanks for calling WeFixTrades. I'm the AI assistant..."*
3. Ask a few test questions:
   - "What do you charge for TradeLine?"
   - "Do you offer a free trial?"
   - "I run a plumbing business in Dallas — what would you recommend for me?"
4. Hang up
5. Within 60 seconds, check `ADMIN_EMAIL` inbox for the call summary email

### 6. Optional — pick a better voice

The default is ElevenLabs `21m00Tcm4TlvDq8ikWAM` ("Rachel"). To override:

```bash
# In .env
VAPI_WFT_VOICE_ID=<any ElevenLabs voice ID>
```

Or edit directly in Vapi dashboard → Voice → pick one you like and copy
the voice ID into the env var.

---

## How the conversation flow works

```
Caller dials the number
      ↓
Vapi answers, plays first message
      ↓
Vapi hits POST /api/vapi/webhook with assistant-request
      ↓
Server returns full assistant config
      ↓
Caller speaks → Vapi transcribes → sends to /api/vapi/conversation
      ↓
Server calls Claude with knowledge-base-augmented system prompt
      ↓
Claude's reply spoken back via ElevenLabs voice
      ↓
... loop until caller hangs up or 15 min hard cap ...
      ↓
Vapi fires end-of-call-report webhook
      ↓
Server extracts caller info (Claude reads the transcript)
      ↓
sales_leads row created (if real lead)
      ↓
Summary email sent to ADMIN_EMAIL with transcript
```

---

## Monitoring & tuning

- Every call logged to `ai_usage_logs` (table)
- Real leads logged to `sales_leads` (table) with `source="inbound"`
- Transcripts stored by Vapi (7 days by default, longer with paid retention)
- Call summary emails land in whatever inbox `ADMIN_EMAIL` points to

### If calls feel off

The assistant's brain is:
1. The system prompt generated in `server/services/assistant.ts`
2. The knowledge base in `server/services/knowledgeBase.ts`

Updating either of those updates the assistant's answers on the next call —
no redeploy of Vapi needed. Only the first message, voice, and transcriber
config live in `vapiService.ts:buildAssistantConfig()`.

---

## Cost rough-budget

Per minute of conversation:
- Vapi transport: ~$0.05/min
- Deepgram transcription: ~$0.005/min
- ElevenLabs voice: ~$0.10/min (scales with usage)
- Claude Haiku LLM: ~$0.01/min
- **≈ $0.17/min all-in**

A typical sales call is 3-5 minutes, so plan ~$0.50-$1.00 per inbound call.
Call volume of 100/month = ~$50-100. Worth it for lead capture that never
sleeps.

---

## What's NOT set up (deferred)

- **Outbound calling** — Vapi supports it. Not wired. Use case: AI calls back
  prospects who filled out the audit form but didn't book a call.
- **Call transfer to a human** — Vapi supports `transfer-to-phone-number`.
  Not wired in our assistant. Add via function-call handler in
  `server/routes/vapiRoutes.ts` when you have a human on-call rotation.
- **SMS follow-ups after call** — would need Twilio in addition to Vapi.
  Not urgent; the email summary covers the team side.

# WeFixTrades — Owner Setup Playbook

**Audience:** you, the business owner.
**Purpose:** the only identity-gated tasks left before launch, in the order
you should do them, with exact links and exact what-to-send-Claude values.

Total active time: **~2.5 hours spread over a week**, plus a few waits for
third-party reviews.

---

## Ground rules

1. **Every time I ask for a value**, it's an env var or a string I need. Paste it to me (or into Replit's Secrets panel if you prefer — I'll tell you which).
2. **Never email me passwords, credit card numbers, or bank details.** Only API keys, webhook secrets, phone number IDs, and OAuth client IDs/secrets (those are designed to be shared with automation).
3. **If any step asks you for a credit card** — that's on you, only once per service. I never touch payment methods.
4. **Place all the env vars in Replit Secrets** (Tools → Secrets). Don't put them in `.env` checked into Git.

---

## Day 1 — the big four (about 90 minutes total)

These four unlock most of the launch. Do them in this order.

### 1️⃣ Stripe — accept payments (30 min + bank verification wait)

**Why:** no money moves without this. Everything else is pointless if Stripe isn't live.

1. Go to https://dashboard.stripe.com/register
2. Sign up with your business email (use the same email you'd want customers to see on receipts)
3. Complete **business verification**:
   - Business name: `WeFixTrades Inc.`
   - Business structure: pick the one that matches your actual registration
   - Tax ID (EIN for US, CRA BN for Canada)
   - Industry: **Software/SaaS → Business services**
   - Business website: your deployed URL
   - Customer support email
   - Customer support phone (can be the Vapi number later)
4. Add your **bank account** for payouts. This is the money-lands-here account.
5. **Submit for verification.** Stripe usually approves within an hour, sometimes 1-2 business days.
6. Once verified, stay on the dashboard and go to **Developers → API keys**.
7. Copy the **Secret key** (starts with `sk_live_...`).
8. Go to **Developers → Webhooks → Add endpoint**.
   - Endpoint URL: `https://YOUR-DEPLOYED-DOMAIN/api/billing/webhook`
   - Events to select:
     - `checkout.session.completed`
     - `payment_intent.succeeded`
     - `invoice.paid`
     - `invoice.payment_failed`
     - `customer.subscription.deleted`
     - `customer.subscription.updated`
9. After saving the webhook, click it and copy the **Signing secret** (starts with `whsec_...`).

**Send me:**
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_BILLING_WEBHOOK_SECRET=whsec_...
```

**I then:**
- Add both to Replit Secrets
- Run `tsx server/scripts/sync-stripe.ts` which creates all 25+ Stripe products and price IDs automatically
- Wire the `/plans` bundle checkout button (currently shows a toast)
- Test a full purchase with Stripe test card 4242 4242 4242 4242
- Confirm receipt + onboarding + welcome-package emails all fire

**Blocks launch:** YES.

---

### 2️⃣ SMTP — send emails (20 min with SendGrid)

**Why:** every onboarding, receipt, welcome, contact, and cancellation email silently no-ops without this. It's the #2 biggest blocker after Stripe.

**Recommended: SendGrid** (free tier: 100 emails/day, plenty for launch).

1. Go to https://signup.sendgrid.com/ and sign up with your business email.
2. Complete email verification.
3. In SendGrid dashboard, go to **Settings → Sender Authentication → Domain Authentication**.
4. Add your domain (the one your customer-facing emails will come from — probably `wefixtrades.com` or a subdomain like `mail.wefixtrades.com`).
5. SendGrid gives you 3 CNAME DNS records. Add them to your domain registrar:
   - If you use Cloudflare, Namecheap, GoDaddy — there's a DNS section in your dashboard. Add each record as a CNAME with the host + value SendGrid provides.
   - **Don't skip this.** Without DNS auth, your emails land in spam or get blocked.
6. Back in SendGrid, click **Verify**. Takes 5-30 minutes for DNS to propagate.
7. Go to **Settings → API Keys → Create API Key → Full Access**.
8. Copy the key (shown only once — if you miss it, generate a new one).
9. Decide on a sender address: pick something human-sounding like `hello@wefixtrades.com` or `team@wefixtrades.com` (avoid `noreply@` if possible — it looks less approachable).

**Send me:**
```
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.abc123...
SMTP_FROM=hello@wefixtrades.com
ADMIN_EMAIL=your-personal-ops-email@anywhere.com
INTERNAL_LEAD_EMAIL=leads@wefixtrades.com
```

**Note on `ADMIN_EMAIL`:** this is where contact-form submissions, AI phone call summaries, and supplier replies land. Use an email you actually check. Can be a personal Gmail — doesn't have to be on the WeFixTrades domain.

**I then:**
- Test the contact form round-trip (confirmation to visitor + notification to you)
- Send a test onboarding email
- Confirm the payment receipt flow works end-to-end

**Blocks launch:** YES.

---

### 3️⃣ Secrets — production security (5 min)

**Why:** session cookies and OAuth tokens are encrypted with these. Dev defaults are unsafe for prod.

1. Open a terminal on your machine (Mac/Linux) or WSL on Windows.
2. Run each command, copy the output:
   ```bash
   # Secret 1 — session encryption
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

   # Secret 2 — OAuth token encryption
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. If you don't have Node locally, use https://it-tools.tech/token → pick 64 chars, hex, generate twice.

**Send me:**
```
SESSION_SECRET=<first 64-char hex>
TOKEN_ENCRYPTION_KEY=<second 64-char hex>
NODE_ENV=production
APP_URL=https://YOUR-DEPLOYED-DOMAIN
APP_PUBLIC_URL=https://YOUR-DEPLOYED-DOMAIN
```

**Blocks launch:** YES. Browser cookies won't be `Secure` without `NODE_ENV=production`.

---

### 4️⃣ Vapi — the company phone line (15 min + account funding)

**Why:** our AI-answered 24/7 sales/support line. Major credibility signal.

1. Go to https://dashboard.vapi.ai and sign up.
2. Add a payment method. Vapi is pay-as-you-go (≈$0.17/min of call).
3. Go to **Phone Numbers → Buy Number**.
   - Choose an area code in your target market. A 1-800 is fine but a local area code often converts better.
   - Cost is usually $2-5/month for the number.
4. After purchase, click on the number and copy the **Phone Number ID** (UUID format, e.g. `550e8400-e29b-41d4-a716-446655440000`).
5. Still on the number's settings:
   - **Server URL:** `https://YOUR-DEPLOYED-DOMAIN/api/vapi/webhook`
   - **Server URL Secret:** generate one with `openssl rand -hex 32` (or https://it-tools.tech/token, 64 chars hex). You'll send this to me too.
   - **Assistant:** select **Dynamic** or **Custom Assistant** (we return config from our server, not Vapi's dashboard)
   - **Fallback destination:** leave empty
   - Save
6. Go to **Account → API Keys**, copy the **Private API Key**.
7. (Optional) Go to **Voices** and pick a voice you like — copy its voice ID. If skipped, we use the default ElevenLabs Rachel voice.

**Send me:**
```
VAPI_API_KEY=vapi_sk_...
VAPI_WEBHOOK_SECRET=<64-char hex from step 5>
VAPI_PHONE_NUMBER_ID=<UUID from step 4>
VAPI_SERVER_URL=https://YOUR-DEPLOYED-DOMAIN
VAPI_WFT_VOICE_ID=<optional, from step 7>

ACTUAL_PHONE_NUMBER=+1-XXX-XXX-XXXX
```

The last line (`ACTUAL_PHONE_NUMBER`) isn't an env var — it's the human-readable number I need to paste into two places on the website (contact page + footer). Give me the format customers would dial it.

**I then:**
- Add env vars, swap the `+1 (555) 123-4567` placeholder in the two places
- Test by you calling the number and hanging up — confirm you get a summary email at ADMIN_EMAIL

**Blocks launch:** YES (currently the placeholder number looks fake).

---

## Day 2 — SMS & Google (about 45 minutes)

Can be same day as Day 1 if you have energy, or the day after.

### 5️⃣ Twilio — customer SMS (30 min + A2P registration wait of 1-3 business days)

**Why:** TradeLine's missed-call text-back, SMS follow-ups, and lead notifications all go through Twilio. Core customer-facing value.

1. Go to https://www.twilio.com/try-twilio
2. Sign up with business email. Complete business verification.
3. Buy a local US phone number: **Phone Numbers → Buy a Number → Filter by: Voice + SMS capability**. ~$1/month.
4. Copy the **Account SID** and **Auth Token** from the Console home page.
5. Go to **Messaging → Services → Create Messaging Service**:
   - Use case: Notify my users
   - Add the number you just bought as a sender
   - Submit for **A2P 10DLC registration** (US carriers require this for business SMS). This takes 1-3 business days.
6. Once the number is purchased, go to it and configure the webhook:
   - **A MESSAGE COMES IN:** `POST` → `https://YOUR-DEPLOYED-DOMAIN/api/twilio/inbound`
7. (Optional) For WhatsApp: **Messaging → Try it out → WhatsApp Sandbox** for testing, or apply for a production WhatsApp sender (longer review).

**Send me:**
```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1XXXXXXXXXX
TWILIO_WHATSAPP_NUMBER=whatsapp:+1XXXXXXXXXX    (only if enabled)
```

**I then:**
- Configure SMS for TradeLine service
- Test missed-call text-back with you

**Blocks launch:** YES for TradeLine customers. SMS is core value per your product scope.

**Note:** you can launch the site before A2P approval lands, but TradeLine customers won't send/receive SMS until A2P is live. Plan around this — file A2P today.

---

### 6️⃣ Google OAuth — Business Profile + Maps (30 min setup, ~days to weeks for OAuth verification)

**Why:** ReputationShield needs it to post review replies. MapGuard + SocialSync-Google need it. Without it, those services degrade to read-only.

1. Go to https://console.cloud.google.com/
2. Create a new project: name it `WeFixTrades`.
3. Add billing (required, but with the free tier you won't be charged for our use case).
4. **APIs & Services → Library**. Enable each of these:
   - Business Profile API
   - Maps JavaScript API
   - Places API
   - My Business Account Management API
5. **APIs & Services → OAuth consent screen**:
   - User type: **External**
   - App name: `WeFixTrades`
   - Support email: your admin email
   - App logo: upload a square 120x120+ logo if you have one
   - Developer contact: your email
   - Scopes: click Add Or Remove Scopes → add `https://www.googleapis.com/auth/business.manage`
   - Test users: add your own email (until you submit for verification, only test users can grant access)
   - **Submit for verification** — Google will review for sensitive scopes. Takes days to weeks.
6. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: `WeFixTrades Web`
   - Authorized redirect URIs — add BOTH:
     - `https://YOUR-DEPLOYED-DOMAIN/api/admin/crm/google/callback`
     - `https://YOUR-DEPLOYED-DOMAIN/api/social-sync/google-business/callback`
7. Download the JSON or copy the **Client ID** and **Client Secret**.

**Send me:**
```
GOOGLE_OAUTH_CLIENT_ID=...-...apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-...
GOOGLE_OAUTH_REDIRECT_URI=https://YOUR-DEPLOYED-DOMAIN/api/admin/crm/google/callback

GOOGLE_BUSINESS_CLIENT_ID=...-...apps.googleusercontent.com   (same as above)
GOOGLE_BUSINESS_CLIENT_SECRET=GOCSPX-...                       (same as above)
GOOGLE_BUSINESS_REDIRECT_URI=https://YOUR-DEPLOYED-DOMAIN/api/social-sync/google-business/callback

GOOGLE_MAPS_API_KEY=AIza...                                     (from step 4, for the Maps + Places APIs)
```

**Launch impact:** you can soft-launch without Google OAuth — ReputationShield and MapGuard customers just can't have auto-reply posted to Google until it lands. Verification takes days to weeks so **file this today**.

---

## Day 3 (or earlier) — the slow reviews (about 60 minutes)

### 7️⃣ Facebook App — Meta for Developers (60 min + 1-2 WEEK review)

**⚠ Start this early. The review is the slowest thing on the list.**

**Why:** SocialSync posts to Facebook Pages + Instagram. Without Meta app approval, zero posting.

1. Go to https://developers.facebook.com/
2. Log in with **your personal Facebook account** (Meta apps are owned by a personal profile — you cannot delegate this).
3. **My Apps → Create App**:
   - Use case: **Other**
   - App type: **Business**
   - App name: `WeFixTrades`
   - App contact email: your admin email
   - Business portfolio: create a new one or attach existing
4. Once created, go to **App Settings → Basic**:
   - Copy **App ID** and **App Secret**
   - Privacy Policy URL: `https://YOUR-DEPLOYED-DOMAIN/privacy`
   - Terms of Service URL: `https://YOUR-DEPLOYED-DOMAIN/terms`
   - App Icon: upload a 1024x1024 square logo
5. **Products → Add Product**:
   - Facebook Login for Business → Set up
   - Instagram Graph API → Set up
6. **Facebook Login for Business → Settings**:
   - Valid OAuth Redirect URIs: `https://YOUR-DEPLOYED-DOMAIN/api/social-sync/facebook/callback`
7. **App Review → Permissions and Features**. Request these (they all need review):
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `pages_read_user_content`
   - `instagram_basic`
   - `instagram_content_publish`
8. For each permission, Meta asks for a screencast + explanation of how you use it. This is the time-sink. Rough template for each:
   - Screencast (1-2 min) showing a business owner connecting their Page, approving a post, and seeing it publish.
   - Explanation: "Our customers (small trades businesses) use WeFixTrades to schedule and publish content to their own Facebook Pages. This permission lets us post on their behalf after they explicitly connect and authorize their Page."
9. Submit for review. Typical approval: 5-14 business days.

**Send me now (before approval lands):**
```
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...
FACEBOOK_REDIRECT_URI=https://YOUR-DEPLOYED-DOMAIN/api/social-sync/facebook/callback
```

**I then:**
- Wire env vars so the OAuth flow works for test users (your own Facebook)
- Once Meta approves, SocialSync works for everyone

**Launch impact:** you can launch without this approved — SocialSync customers onboard but posting stays paused until Meta approves. Mark SocialSync as "connecting soon" in the CRM for new customers during this period.

---

## One-time admin task (5 min after launch)

### 8️⃣ Add your first supplier row (only if selling AdFlow at launch)

**Why:** AdFlow fulfillment tasks auto-email a white-label agency when admin moves them to "in progress." Without at least one supplier row, those emails go nowhere.

1. Sign a contract with one white-label ad agency. Examples to look at: Madgicx White Label, AdsGrader, your local digital agency offering white-label. Negotiate: they bill you wholesale, you bill the customer retail.
2. Once signed, log into `/admin/suppliers` on your deployed site.
3. Click **Add Supplier**:
   - Name: the agency name
   - Type: `white_label`
   - Contact name: their account rep
   - Contact email: where briefs should land
   - Platform URL: their dashboard URL
   - Supported services: `adflow-starter`, `adflow-growth`, `adflow-pro`
4. Save.

That's it — from this point on, every AdFlow customer's fulfillment tasks auto-email this agency when I (the admin, acting as you) assign and start the task.

**If skipping AdFlow from v1:** no supplier row needed. Just don't sell AdFlow yet.

---

## Decisions (not work)

### 9️⃣ QuoteQuick framing

The wizard isn't 100% polished per your previous note. Pick one:

**Option A — launch it as "Early Access":**
- Add an "Early access" badge on the `/products/quickquotepro` page
- Keep the 14-day trial
- Support you (the admin) walks first 10 customers through the wizard manually
- **Upside:** extra revenue channel from day 1
- **Downside:** more support load during already busy launch

**Option B — defer QuoteQuick from v1:**
- Remove QuoteQuick from navigation + pricing until it's polished
- Focus launch on TradeLine + MapGuard + ReputationShield + AdFlow
- **Upside:** cleaner launch, less chance of bad first impression
- **Downside:** fewer SKUs

**What to tell me:** "Launch QuoteQuick" or "Defer QuoteQuick." I'll implement the chosen path in ~15 min.

---

## Full env var cheat sheet

After all 6 numbered steps, Replit Secrets should have these set. Double-check before going live:

```
# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_BILLING_WEBHOOK_SECRET=whsec_...

# SMTP
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG...
SMTP_FROM=hello@wefixtrades.com
ADMIN_EMAIL=your-ops-email@...
INTERNAL_LEAD_EMAIL=leads@wefixtrades.com

# Secrets
SESSION_SECRET=<64-hex>
TOKEN_ENCRYPTION_KEY=<64-hex>
NODE_ENV=production
APP_URL=https://your-domain
APP_PUBLIC_URL=https://your-domain

# Vapi
VAPI_API_KEY=...
VAPI_WEBHOOK_SECRET=<64-hex>
VAPI_PHONE_NUMBER_ID=<UUID>
VAPI_SERVER_URL=https://your-domain
VAPI_WFT_VOICE_ID=<optional>

# Twilio (SMS)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...
TWILIO_WHATSAPP_NUMBER=whatsapp:+1... (optional)

# Google OAuth (same client ID works for both flows)
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=https://your-domain/api/admin/crm/google/callback
GOOGLE_BUSINESS_CLIENT_ID=...
GOOGLE_BUSINESS_CLIENT_SECRET=...
GOOGLE_BUSINESS_REDIRECT_URI=https://your-domain/api/social-sync/google-business/callback
GOOGLE_MAPS_API_KEY=AIza...

# Facebook / Instagram
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...
FACEBOOK_REDIRECT_URI=https://your-domain/api/social-sync/facebook/callback
```

Already in there from earlier work:
```
ANTHROPIC_API_KEY=... (✅ already set)
DATABASE_URL=... (✅ already set)
```

---

## Pace recommendation

If you do **one task per evening**, you're done in a week. If you do Day 1 in a single 90-min block, you're 80% there in one sitting.

**Fastest viable launch path** (if you want to go hard):
- **Today (2 hours):** Stripe + SMTP + secrets + Vapi
- **Tomorrow (30 min):** Twilio + file A2P + file Facebook review
- **Day 3 (30 min):** Google OAuth
- **Week 2:** Meta approval lands, turn on SocialSync

The day Stripe + SMTP + Vapi are live, I can smoke-test a full purchase flow end-to-end. That's the real "are we live?" moment.

---

## If any step blocks you

Paste me the error message or the screen you're stuck on. I'll figure out what Stripe/SendGrid/Vapi/Meta wants.

Don't silently fight a form for an hour. Ask.

# WeFixTrades — Full Pre-Launch Checklist

Single source of truth. Everything that must happen before the site is
actually open for paying customers. Updated 2026-04-23.

Code is done unless noted otherwise — the blockers below are all **owner
actions** (credentials, accounts, decisions).

---

## 🔴 CRITICAL — Can't accept money without these

### CR-1. Stripe
- [ ] Complete Stripe business identity verification + connect bank
- [ ] Set `STRIPE_SECRET_KEY` in env
- [ ] Set `STRIPE_BILLING_WEBHOOK_SECRET` in env
- [ ] Register webhook at `https://YOUR-DOMAIN/api/billing/webhook` for events:
      `checkout.session.completed`, `payment_intent.succeeded`, `invoice.paid`,
      `customer.subscription.updated`, `customer.subscription.deleted`
- [ ] Run `tsx server/scripts/sync-stripe.ts` to create products + price IDs
- [ ] Test card 4242 4242 4242 4242 through full purchase flow

### CR-2. Email (SMTP)
- [ ] Pick provider — SendGrid recommended, Gmail Workspace works for small volume
- [ ] Verify sending domain (SPF + DKIM DNS records)
- [ ] Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- [ ] Set `ADMIN_EMAIL` — this receives contact form submissions, supplier
      replies, call summaries, escalations
- [ ] Send a test email from the contact form and confirm both the
      customer-facing ack and the internal notification arrive

### CR-3. Secrets + production flags
- [ ] Regenerate `SESSION_SECRET` with `openssl rand -hex 32`
- [ ] Generate `TOKEN_ENCRYPTION_KEY` with `openssl rand -hex 32`
- [ ] Set `NODE_ENV=production` (enables `secure` cookie flag)
- [ ] Set `APP_URL` to the real public domain (used in email links)

### CR-4. Buy the public phone number
- [ ] Vapi dashboard → buy a phone number
- [ ] Point it at `/api/vapi/webhook` with `VAPI_WEBHOOK_SECRET`
- [ ] Enable "Dynamic" / "Custom Assistant" mode
- [ ] Set env vars: `VAPI_API_KEY`, `VAPI_WEBHOOK_SECRET`, `VAPI_PHONE_NUMBER_ID`,
      `VAPI_SERVER_URL` (your public URL)
- [ ] Replace the `+1 (555) 123-4567` placeholder in:
      - `client/src/pages/marketing/contact.tsx`
      - `client/src/components/marketing/MarketingLayout.tsx`
- [ ] Test: call the number, ask a pricing question, hang up, confirm
      summary email arrives at `ADMIN_EMAIL`

Full step-by-step: [`docs/vapi-sales-line-setup.md`](./vapi-sales-line-setup.md)

### CR-5. Wire the bundle-checkout button
- [ ] Currently `/plans` shows a toast "Checkout coming next" on button click.
      Claude can wire this to `/api/public/checkout` in 30 min once Stripe
      is live. **Trigger:** the moment CR-1 clears, ping Claude.

### CR-6. Decide on QuoteQuick readiness framing
- [ ] The QuoteQuick wizard isn't 100% polished yet. Two options:
      - **A:** Remove QuoteQuick from the initial launch, ship TradeLine +
        MapGuard + ReputationShield only
      - **B:** Launch QuoteQuick as "early access" with manual onboarding
        support (our team walks first customers through the wizard)

---

## 🟡 HIGH — Need these for paid service delivery

### HI-1. Twilio (if you want SMS)
- [ ] Create Twilio account, complete business verification
- [ ] Buy a local number (SMS + Voice capability)
- [ ] Submit A2P 10DLC registration (US) — takes 1-3 business days
- [ ] Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- [ ] Point the number's inbound SMS webhook at `/api/twilio/inbound`

Note: Twilio is for SMS only. Voice is already handled by Vapi (CR-4).
Skip Twilio entirely if you don't need missed-call text-back or SMS
follow-ups in the first launch.

### HI-2. Google OAuth (for ReputationShield + SocialSync Google)
- [ ] Create Google Cloud project
- [ ] Enable: Business Profile API, Maps JavaScript API, Places API
- [ ] OAuth consent screen → External → submit for verification
- [ ] Create OAuth client ID (Web app)
- [ ] Add redirect URIs:
      - `https://YOUR-DOMAIN/api/admin/crm/google/callback`
      - `https://YOUR-DOMAIN/api/social-sync/google-business/callback`
- [ ] Set env vars: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
      `GOOGLE_OAUTH_REDIRECT_URI`, and the matching `GOOGLE_BUSINESS_*` trio
      (can reuse same client ID + secret)

### HI-3. Facebook / Instagram app (SocialSync)
- [ ] Create Meta for Developers app — type: Business
- [ ] Add products: Facebook Login, Instagram Graph API, Pages API
- [ ] Request permissions: `pages_show_list`, `pages_read_engagement`,
      `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`
- [ ] Submit for App Review with screencast demo — **takes 1-2 weeks**, file NOW
- [ ] Set env: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_REDIRECT_URI`

### HI-4. Seed the Suppliers table
For services that use outside vendors, each vendor needs a row in the
Admin → Suppliers page before fulfillment tasks can auto-dispatch:

- [ ] **White-label ad agency** — required for any AdFlow customer
      (`supported_services: ["adflow-starter","adflow-growth","adflow-pro"]`)
- [ ] **Freelance web dev OR template-only commitment** — required for
      SiteLaunch custom builds. If you default all customers to
      `sitelaunch-template`, skip this.
- [ ] **Content supplier** for SocialSync (post writing). Can be in-house
      or outsourced; the system treats them the same.

Once a supplier row exists with a `contact_email`, any fulfillment task
with `handled_by: "supplier"` that moves to `in_progress` will auto-email
them the brief.

### HI-5. Populate real business address + phone on Terms and Privacy
- [ ] The footer currently says "1200 Market Street, Suite 400, Wilmington, DE"
      (virtual Delaware address). That's fine as legal registered office but:
- [ ] Update `/terms` and `/privacy` pages with the real ToS and Privacy
      Policy — current text may be placeholder

---

## 🟢 POLISH — Do before first 100 customers, not blocking

### PO-1. Replace synthetic testimonials with real ones
- [ ] Get written testimonial consent from first 3-5 real customers
- [ ] Replace `ReviewsSection.tsx` REVIEWS array with verified quotes
- [ ] Remove the "Early access pilot" badge framing on that section

### PO-2. Publish fully-attributed case studies
- [ ] Replace the synthetic scenarios in `CaseStudies.tsx` with real
      customer stories (with written consent + real first names + real metros
      + approximate but accurate metrics)

### PO-3. Add real photos
- [ ] Team page or founder photo on `/about` — huge trust signal
- [ ] Real customer photos on case studies (with signed release)

### PO-4. Set up error monitoring
- [ ] Sentry or equivalent with `SENTRY_DSN` env var
- [ ] Catches prod bugs before customers complain

### PO-5. Uptime monitoring
- [ ] UptimeRobot or Better Stack pinging `/api/health` every 1 min
- [ ] Alerts if anything goes down

### PO-6. Trial-ending reminder email (if you enable any other trial)
- [ ] Currently only QuoteQuick has a real trial (with its own
      lifecycle emails embedded in the worker)
- [ ] If TradeLine or any other service ever gets a true trial (not just
      money-back guarantee), extract email templates to
      `server/lib/trialLifecycleEmails.ts` first

### PO-7. AdFlow metric population UI
- [ ] AdFlow monthly reports read from `client_service.metadata.latest_report`.
      There's no admin UI yet to populate it — supplier has to update it
      manually via the API. Build a simple admin form when needed.

### PO-8. Instantly / Smartlead webhook (outbound only)
- [ ] Not needed for inbound. Only when you start outbound email campaigns.

---

## 📧 Email gap register

Status of every transactional email:

| Email | Status |
|---|---|
| Onboarding (magic link to setup form) | ✅ Built |
| Welcome package (service-specific, sent when service goes live) | ✅ Built |
| Payment receipt (branded, post-checkout) | ✅ Built |
| Account-created welcome (set password magic link) | ✅ Built |
| Contact form acknowledgement | ✅ Built |
| Contact form internal notification | ✅ Built |
| Password reset | ✅ Built, rebranded |
| Supplier dispatch brief | ✅ Built |
| AdFlow monthly report | ✅ Built |
| Review request (customer-to-customer) | ✅ Built |
| Low-rating alert (to business owner) | ✅ Built |
| Audit report email + followup sequence | ✅ Built |
| Missed-call calculator followup sequence (softened) | ✅ Built |
| Demo quote followup sequence | ✅ Built |
| SocialSync operator alerts | ✅ Built |
| MapGuard ops alerts | ✅ Built |
| Sales call summary (post-phone-call) | ✅ Built |
| **Trial-ending reminder (for any future non-QuoteQuick trial)** | ❌ Not built (not needed until we add a new trial) |
| **Subscription renewal reminder** | ❌ Not built (Stripe sends its own) |
| **Payment failed / retry notice** | ❌ Not built — Stripe handles the dunning, but a branded "heads up" is nicer |
| **Cancellation confirmation + exit survey** | ❌ Not built — worth ~30 min |
| **Re-engagement for inactive accounts (30+ days)** | ❌ Not built — add after first churn |

---

## 📝 Where to get the canonical answer for each thing

- **Trial & refund policy:** `docs/trial-policy.md`
- **Vapi phone setup:** `docs/vapi-sales-line-setup.md`
- **Service catalog + task templates:** `server/scripts/seed-services.ts`
- **All per-service welcome email copy:** `server/lib/welcomeEmail.ts`
- **AI assistant knowledge base (sales/support brain):** `server/services/knowledgeBase.ts`

---

## The "order of operations" for launch day

1. **Stripe live** → run sync-stripe → test purchase works
2. **SMTP live** → test contact form round-trip + receipt email
3. **Secrets + NODE_ENV=production**
4. **Phone number live + phone placeholder swapped**
5. **Seed one supplier row** (at minimum, a white-label ad agency if you're
   selling AdFlow in the first wave, or skip AdFlow from launch)
6. **Decide QuoteQuick framing** — launch or defer
7. **Smoke test the full flow:** purchase a service → receive receipt +
   welcome account + onboarding email → fill onboarding → get welcome
   package when service goes live
8. **Open the gates** → drive first paid traffic

Everything else is polish. Good luck.

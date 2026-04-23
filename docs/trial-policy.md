# WeFixTrades — Trial & Money-Back Policy

Canonical document. All marketing copy, pricing pages, support responses,
and backend logic must match what's defined here. If a promise isn't in
this document, it doesn't get made on the website.

Last updated: 2026-04-23

---

## Core principles

1. **Honesty over conversion tricks.** We don't advertise a "free trial" we can't actually deliver.
2. **No credit card up front** for self-serve trials. Card-required paths are called "money-back guarantee," not "trial."
3. **Auto-pause, never delete.** Expired trials get paused — data, settings, and leads are preserved forever (or until the customer requests deletion under our privacy policy).
4. **One canonical trial duration: 14 days.** 3-day grace if the customer has used the service (has leads, calls, generated posts, etc.).
5. **Clear end-of-trial communication.** Customer gets 4 emails during the trial window (day 7, 10, 13, 14). No silent expiration.

---

## Product-by-product policy

| Product | Offer type | Duration | Card at start? | Status in code |
|---|---|---|---|---|
| **QuoteQuick Pro** | Free trial | 14 days (+3 grace) | No | ⚠️ Backend wired; wizard still being polished. Soft-launch only. |
| **TradeLine (all tiers)** | Money-back guarantee | 30 days | Yes | ✅ Billing wired; refund is manual admin action |
| **ReputationShield** | Money-back guarantee | 30 days | Yes | ✅ Billing wired; refund is manual admin action |
| **MapGuard** | Money-back guarantee | 30 days | Yes | ✅ Billing wired; refund is manual admin action |
| **RankFlow** | Money-back guarantee | 30 days | Yes | ✅ Billing wired; refund is manual admin action |
| **SocialSync** | Money-back guarantee | 30 days | Yes | ✅ Billing wired; refund is manual admin action |
| **AdFlow** | No trial / no guarantee on ad spend | N/A | Yes | Ad spend is real money the agency deploys — never refundable. Management fee follows 30-day guarantee. |
| **SiteLaunch (custom)** | No refund after design starts | N/A | Yes | One-time build. Initial deposit refundable until we've shipped the design mockup. |
| **SiteLaunch (template)** | 7-day review window | N/A | Yes | If the templated site doesn't match the brand brief after revision round 1, full refund. |
| **WebFix** | Money-back on scope failure | N/A | Yes | If the specific fix isn't delivered, full refund. Does not cover "I changed my mind." |

---

## The QuoteQuick free trial (reference implementation)

This is the only true no-card free trial. Details:

- **Start:** automatic when a calculator is created (`plan_tier = "free"` default on `calculators` table).
- **Clock starts:** `calculators.created_at`.
- **Duration:** 14 days.
- **Grace period:** +3 days if the calculator has ≥1 lead at expiry (day 17 hard stop).
- **End behavior:** `deployment_status.status` → `"draft"`. Calculator becomes unavailable to public (404), but all data is preserved.
- **Recovery:** customer upgrades via `/Wizard` → Stripe checkout → `plan_tier` set to `starter`/`business` → `deployment_status.status` → `"live"` on the same calculator.

### Email lifecycle (inline in `server/jobs/trialLifecycleWorker.ts`)

| Day | Subject | Purpose |
|---|---|---|
| 0 | "Your quote calculator is ready" | Onboarding — share link instructions |
| 1 | "Where to put your quote link" | Placement tips |
| 3 | Dynamic — usage or nudge | Celebrate early leads OR nudge if no traffic |
| 7 | "Halfway through your trial" | Reminder checkpoint |
| 10 | "4 days left on your trial" | Urgency without pressure |
| 13 | "Your trial ends tomorrow" | Final heads-up |
| 14 | "Your trial has ended" | Pause notification + reactivation CTA |
| 21 | "Your calculator is still waiting" | Last outreach (no further emails) |

Dedup: every trial email is logged to `analytics_events` with `event_type = 'trial_email_day_{N}'` so the worker never re-sends.

---

## The 30-day money-back guarantee

Applies to every paid recurring service except AdFlow ad spend.

### Terms (what we'll put on marketing pages)

> **30-day money-back guarantee.** If WeFixTrades isn't working for you, email us within 30 days of your first charge and we'll refund that charge in full. No forms, no phone interrogation. After 30 days, you can cancel any time but past charges stay billed.

### Implementation

- **Customer-facing:** one email request to support, processed within 2 business days.
- **Backend:** Stripe refund initiated manually by admin through the Stripe dashboard. There's no "refund button" in the CRM — admin runs the refund, then records the refund as a `client_payments` row with `type: "refund"`, `amount_cents: -X`.
- **Service deactivation:** admin also sets `client_service.status = "cancelled"` and `cancelled_at = now()`.
- **Data preservation:** customer data is kept for 90 days in case they want to reactivate, then anonymized per our privacy policy.

### When we say no

- Customer used the service heavily for 29 days then asks for a refund "just because" — we still refund, but we flag the account so a re-signup requires a phone conversation first.
- Customer did no setup, never replied to onboarding — full refund, no questions.
- AdFlow ad spend — never refundable. We made clear on the AdFlow purchase page that ad spend is deployed to Google/Meta the moment the agency launches the campaign.

---

## Fixing current marketing/backend gaps

The original audit found the marketing site promising free trials that the backend doesn't actually deliver. This policy resolves the gaps:

### ✅ Keep as-is
- **QuoteQuick Pro** — backend matches the "14-day free trial, no card" promise on pricing.
- **Free tools** (audit, missed-call calculator, quote demo) — actually free, always have been.

### 🔄 Change marketing copy (this session)
- **ReputationShield** — the current "Free Trial" language is unsupported. Replace with **"30-day money-back guarantee."**
- **TradeLine** — same. Replace **"Free Trial"** with **"30-day money-back guarantee."**

### 📅 Consider for future (not this session)
- A real TradeLine trial IS technically implementable (included Vapi minutes + Twilio pay-as-you-go with a usage cap). Deferred because:
  1. It requires usage-cap enforcement code (not yet built).
  2. It requires a Stripe subscription with `trial_period_days` config (currently nothing on TradeLine uses Stripe trials).
  3. The money-back guarantee covers the same customer psychology with less engineering risk.

---

## "Trial ending soon" email template

Currently embedded inline in `server/jobs/trialLifecycleWorker.ts`. This is fine for v1 (only QuoteQuick uses it), but if we ever add a second trial (TradeLine), extract it to a reusable template at `server/lib/trialLifecycleEmails.ts`. Do not duplicate the template across workers — keep one source.

---

## What support is allowed to promise beyond this doc

Nothing. If a customer asks for a refund outside the 30-day window or a trial extension beyond grace, the support person can say "let me check with the team" and escalate to the founder via `ADMIN_EMAIL`. Don't grant exceptions on the spot.

---

## Legal notes

- This document is **not** a contract. The binding terms are in `/terms` (Terms of Service).
- If a customer disputes a charge via their card issuer before asking us, we always accept the chargeback — we don't contest legitimate disputes. We do flag the customer record for internal reference.
- Refunds are gross (including any fees we paid Stripe). We don't deduct Stripe fees from the customer's refund.

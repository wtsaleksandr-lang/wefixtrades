# Email + Notification System Audit — 2026-05-24

**Date:** 2026-05-24
**Scope:** Outbound transactional + marketing email, the in-app notification
queue, the per-client preference layer, and Twilio SMS coverage.
**Method:** static read-only review against `origin/main` (HEAD `ef629b27`).
No live mail sent. No `npm install`. One inline fix shipped — see §9.
**Prior audit:** `docs/audit/email-infra-audit-2026-05-21.md` (3 days ago).
This pass focuses on what has changed since, plus the in-app + SMS surface
that the prior pass deferred.

---

## 1. Mailer provider + status

- **Active provider:** SendGrid via SMTP, wrapped in nodemailer.
- **Single transport factory:** `server/lib/emailTransport.ts` —
  `getEmailTransporter()` returns a cached `Transporter`. Credentials via
  `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`.
- **No competing providers.** Postmark / Mailgun / Resend / Amazon SES
  are not wired. `INSTANTLY_API_KEY` and `SMARTLEAD_API_KEY` show up in
  `.env.example` for cold outreach but no first-party sender uses them.
- **Webhook:** `POST /api/email/sendgrid-webhook` — ECDSA-SHA256
  public-key verified. Source `server/routes/sendgridWebhookRoutes.ts`
  + `server/lib/sendgridWebhook.ts`.
- **Inbound:** `server/routes/inboundEmailRoutes.ts` — SendGrid Inbound
  Parse (separate concierge service in `server/services/inboundEmailConcierge.ts`).
- **Tracking:** SendGrid native click + open tracking is globally
  **disabled** via the `X-SMTPAPI` header default on the transporter,
  because the SendGrid auto-issued SSL cert for the branded
  link-tracking subdomain (`url1527.wefixtrades.com`-style) is not
  provisioned. The codebase substitutes its own pixel + click redirect
  through `${APP_URL}/api/email/click/:id` in `emailTracking.ts`.
- **Status:** healthy. Single source of truth, properly cached, no
  competing transports to reconcile.

---

## 2. Template inventory (47 templates, all under `server/lib/`)

Composition pattern: most templates render through the shared dark/light
`transactionalShell.ts` builder + `emailFooter.ts`
(`buildEmailHeader`, `buildChatBubble`, `buildLegalFooter`). Three
older templates still hand-roll their own HTML — covered in §3.

| Category | Templates | Marketing-class? |
|---|---|---|
| Welcome / onboarding | `welcomeEmail`, `accountWelcomeEmail`, `selfServeWelcomeEmail`, `onboardingEmail`, `onboardingConfirmationEmail`, `onboardingReminderEmail`, `adflowOnboardingEmail`, `reputationShieldWelcomeEmail` | mixed |
| Booking / order | `bookingConfirmationEmail`, `orderConfirmationEmail`, `bookingEmails` | transactional |
| Billing | `paymentSucceededEmail`, `paymentFailedEmail`, `paymentReceiptEmail`, `invoiceEmail`, `billingPortalEmail`, `trialExpiryEmail`, `proTrialEndedEmail`, `cancellationEmail`, `upsellEmails`, `dunningEmails` | mostly transactional; `proTrialEndedEmail` flagged marketing |
| Reputation | `reviewRequestEmail`, `reputationReport`, `reputationConnectNudgeEmail` | **marketing** |
| Reports / digests | `reportEmailTemplate`, `weeklyDigestEmail`, `webcareAlertEmail`, `sendAuditReport` | **marketing** |
| ContentFlow approvals | `contentReviewEmail`, `approvalNotificationEmail`, `adflowCreativeApprovalEmail` | transactional (internal) |
| Support / contact | `contactEmails`, `supportTicketEmails`, `supportEmail` | transactional |
| Auth | `passwordResetEmail`, `loginLinkEmail` | transactional |
| Service ops | `serviceStatusChangeEmail`, `metaReauthEmail`, `tradelineCallNotificationEmail` | transactional |
| ContentFlow newsletter | `services/contentflow/adapters/emailAdapter.ts` | **marketing** |
| Queue + worker | `services/emailQueueService.ts`, `jobs/notificationWorker.ts` | varies |

**Duplicates worth pruning** (post-launch, not urgent):
- `welcomeEmail.ts` vs. `accountWelcomeEmail.ts` vs. `selfServeWelcomeEmail.ts` — three near-identical welcome paths.
- `onboardingEmail.ts` vs. `onboardingConfirmationEmail.ts` vs. `onboardingReminderEmail.ts` — single state machine would be cleaner.
- `contactEmails.ts` vs. `supportEmail.ts` vs. `supportTicketEmails.ts` — overlapping support surfaces.

---

## 3. Template brand-compliance scoring (5 samples)

Scoring scale: 5 = ships premium · 4 = solid · 3 = passable · 2 = drift · 1 = rebuild.

| Template | Score | Notes |
|---|---|---|
| `paymentReceiptEmail.ts` | 5 | Full shell, dark theme, header + chat bubble + legal footer, mobile-safe 520px, plain-text companion. |
| `reviewRequestEmail.ts` | 4 | Light theme, headers + footer, `marketing: true`. Was missing `List-Unsubscribe` header at the SMTP layer — fixed centrally in §9. |
| `weeklyDigestEmail.ts` | 4 | Shell + chart embeds; `marketing: true`; same `List-Unsubscribe` gap as above — fixed centrally. |
| `contentReviewEmail.ts` | 4 | Light shell, footer with unsubscribe, brand-consistent. |
| `services/contentflow/adapters/emailAdapter.ts` | 2 | Newsletter adapter — bespoke HTML, no shell, no chat bubble. Per-recipient checks via `isEmailUnsubscribed()` were added in PR #443 (after prior audit). Re-templating to `transactionalShell` would lift it to 4. |

Brand-compliance overall: **strong** for everything that flows through the
shared shell; the only meaningful gap is the ContentFlow newsletter
adapter.

---

## 4. Bounce + complaint handling

`server/lib/sendgridWebhook.ts` event handling unchanged since prior audit:

| Event | Action |
|---|---|
| `bounce`, `dropped`, `spamreport`, `unsubscribe`, `group_unsubscribe` | **suppress** — write to `email_unsubscribes` via `recordUnsubscribe()` |
| `blocked`, `deferred` | **monitor** — log only (transient) |
| `delivered`, `open`, `click`, `processed` | engagement, ignored |

`server/services/emailQueueService.ts` retries each item up to
`max_attempts` (default 3) with `last_error` capture; on final failure
fires an `email_failed` alert.

**Status: healthy.** Webhook signature verification is ECDSA, not a
shared-secret hack. Soft-fail vs. hard-fail classification is correct.
The only remaining gap is the SendGrid link-branding SSL — already
tracked in SCORECARD as a registrar-hard-block on Alex.

---

## 5. Unsubscribe enforcement

- **Storage:** `email_unsubscribes` table (`server/lib/unsubscribeStorage.ts`),
  auto-created on first read, `ON CONFLICT DO NOTHING` on insert.
- **Read API:** `isEmailUnsubscribed(email)` — case-insensitive, fail-open
  (if the table read errors, prefer over-sending so a DB blip can't nuke
  marketing — operationally easier to spot via complaints than silent
  failure).
- **Write API:** `recordUnsubscribe({email, source, ipAddress, userAgent})`.
- **Tokens:** `unsubscribeToken.ts` — HMAC-SHA256 over `email:unsubscribe`
  with `UNSUBSCRIBE_SECRET` (falls back to `SESSION_SECRET`; throws in
  production if both missing). Self-verifying, no DB lookup needed to
  validate.
- **Routes:** `GET /api/unsubscribe/:token` (HTML confirmation page) +
  `POST /api/unsubscribe/:token` (RFC 8058 one-click endpoint).
- **Coverage:** 27 callers consult `isEmailUnsubscribed()` — reports,
  retention, dunning, review-request, audit follow-ups, newsletter
  adapter (added in PR #443), email queue drain (added in PR #443).
- **Prior gaps now closed:** ContentFlow newsletter + emailQueue
  suppression checks were flagged in the 2026-05-21 audit; PR #443
  shipped both.
- **Remaining gap (P1 fixed inline this audit, §9):** the
  `List-Unsubscribe` + `List-Unsubscribe-Post` headers were only set
  on `followupWorker.ts` and `auditFollowupWorker.ts`. Every other
  marketing-class send (review requests, weekly digest, reports, trial
  expiry, etc.) called `sendMail()` without those headers. Per Gmail /
  Yahoo / Apple 2024 bulk-sender requirements, this is a deliverability
  risk — bulk mail without `List-Unsubscribe` is flagged as spam.

---

## 6. In-app notification system

The codebase does NOT have a generic `admin_notifications` table or
in-app bell-icon UI. What it has instead:

### 6a. `notification_queue` table (`shared/schemas/db.ts:181`)
A per-`(calculator_id, lead_id)` dispatch queue feeding
`jobs/notificationWorker.ts`. Three channels: `email`, `sms`, `webhook`.
SMS path properly gates on `calculator_settings.followup.notifications.sms_enabled`
+ Twilio config. Webhook path correctly rejects HTTP and rejects private /
loopback IPs (SSRF defense) and applies a 5s `AbortController` timeout.
30 messages per calculator per hour rate limit.

### 6b. `notificationPreferences` (per-client metadata)
Stored as JSON inside `clients.metadata.notification_preferences`. Schema
in `shared/schemas/notificationPreferences.ts`:
- Channels: `email`, `sms` (default both ON)
- Categories: `billing`, `service_updates`, `leads`, `weekly_digest`,
  `marketing` (transactional defaults ON, non-transactional default OFF
  — CASL/CAN-SPAM friendly).

**Gap (P2):** the preferences object is read by `portalTools.ts` and the
`PUT /api/portal/notification-preferences` route — but **only two
read-sites exist**. The actual sender paths (`reputationReport.ts`,
`mapguardReports.ts`, `weeklyDigestEmail.ts`, `dunningEmails.ts`, etc.)
do NOT call `parseNotificationPreferences()` before sending. Customer
toggles in the portal therefore have no effect on most flows. Either:
(a) plumb the check into each sender, or (b) replace per-call checks
with a single gate inside the shared transport — preferred. See
recommendation #6.

### 6c. Admin-facing notification UI
None found. No `Notification*.tsx` component in `client/src/`. Admin
sees email + Twilio activity via separate surfaces
(`CommunicationsPage.tsx`); there is no consolidated bell-icon /
notifications-center component.

---

## 7. SMS coverage (Twilio)

`server/twilioClient.ts` is the sole entry point. Helpers:
`isTwilioConfigured()`, `getTwilioFromNumber()` (accepts both
`TWILIO_FROM_NUMBER` and `TWILIO_PHONE_NUMBER`), `sendSMS(to, body,
channel)` (sms | whatsapp), `checkRateLimit(leadId, calculatorId)`
(3/day per lead, 50/day per calculator), `verifyTwilioSignature()`.

**SMS use today** (11 callers):
- `notificationWorker.ts` — new-lead alerts to business owner.
- `tradelineNotifications.ts` — TradeLine call alerts.
- `reviewRequestService.ts` — review-request SMS (both paths).
- `inboundSmsConcierge.ts` — inbound SMS handling + AI replies.
- `twilioRoutes.ts`, `twilioCommsRoutes.ts` — admin send + comms.
- `leadRoutes.ts` — manual SMS from admin CRM.
- `bookingConfirmationEmail.ts` — companion SMS to email confirmations.

**Coverage gaps worth filling** (recommendations §10):
- **Payment failed** (`paymentFailedEmail.ts`) — high-stakes; email-only
  today. Failed-card SMS within 1h dramatically improves recovery.
- **Booking reminders** — booking confirmation has an SMS companion but
  no T-24h reminder.
- **Trial ending** (`trialExpiryEmail.ts`, `proTrialEndedEmail.ts`) —
  email-only; SMS would improve conversion.
- **Review request** has SMS today (good).
- **Dunning** — `dunningEmails.ts` is email-only; SMS escalation at
  attempt 3+ would help.

**SMS opt-out:** the codebase handles inbound `STOP` keyword in
`inboundSmsConcierge.ts` but there is **no `sms_opt_outs` storage
analogous to `email_unsubscribes`**. Outbound paths re-check Twilio's
own opt-out state implicitly (Twilio drops messages to opted-out
numbers), but the app doesn't track this — making it hard to render
"Why didn't this send?" to admins. P3.

---

## 8. Top 10 recommendations (ranked by impact)

1. **(SHIPPED in this PR — §9)** Auto-inject `List-Unsubscribe` +
   `List-Unsubscribe-Post: List-Unsubscribe=One-Click` on every
   outbound HTML that carries the marketing footer's unsubscribe URL.
   Closes a Gmail/Yahoo 2024 deliverability gap.
2. **Fix SendGrid link-branding SSL** so we can re-enable click + open
   tracking. Hard-block on Alex (registrar + SendGrid dashboard) —
   already on SCORECARD.
3. **Wire `parseNotificationPreferences()` into the email transport.**
   Centralised gate inside `emailTransport.sendMail()` that consults
   the recipient's category-level prefs (when a recipient client is
   resolvable). Today the portal preferences UI is mostly cosmetic.
4. **Migrate ContentFlow newsletter adapter to `transactionalShell`.**
   Score 2 → 4; gets it a real header, chat bubble, theme consistency.
5. **Add SMS escalation to high-stakes flows:** payment-failed,
   dunning attempt 3+, T-24h booking reminder, trial-ending.
6. **Create `sms_opt_outs` table** mirroring `email_unsubscribes` so
   the app tracks Twilio's authoritative opt-out state instead of
   relying purely on Twilio dropping messages silently.
7. **Consolidate welcome flows.** Three near-identical templates
   (`welcomeEmail`, `accountWelcomeEmail`, `selfServeWelcomeEmail`).
   Pick one + a `variant` prop. Same with onboarding triplet.
8. **Add an admin notifications-center surface.** No in-app bell today;
   admin has to alt-tab between `CommunicationsPage`, email, and SMS
   panels. A unified `notifications` table + UI would be a launch-week
   polish item.
9. **Add `Reply-To` consistency.** Most templates send from
   `noreply@wefixtrades.com`; replies to those addresses bounce. Set
   `replyTo: support@wefixtrades.com` as the transport default unless
   explicitly overridden. Especially important for the
   ContentFlow newsletter adapter (still missing per prior audit).
10. **Document the `wefixtrades.com` sending domain's SPF / DKIM /
    DMARC posture in-repo.** `dnsVerify.ts` handles per-customer custom
    domains beautifully, but there is no doc for the primary sender —
    a junior on-call wouldn't know the records to validate.

---

## 9. Inline fix shipped in this PR (1 file, ~30 lines)

**File:** `server/lib/emailTransport.ts`

**Change:** Added auto-injection of RFC 8058 `List-Unsubscribe` and
`List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers on every
outbound HTML email whose body contains the `/api/unsubscribe/<token>`
URL (i.e., the marketing footer rendered by `buildLegalFooter({
marketing: true })`). Headers are added inside the same `sendMail()`
wrapper that already handles tracking-pixel injection.

**Why:** Gmail / Yahoo / Apple bulk-sender requirements (Feb 2024)
require these headers on marketing mail or the message can be flagged
as spam. Before this fix only `followupWorker.ts` and
`auditFollowupWorker.ts` set them — review requests, weekly digest,
audit reports, trial-ended, etc. did not. Centralising the injection
inside the transport means new marketing templates get correct
behaviour for free, with no per-call-site changes required.

**Safety:**
- Existing callers that already set `List-Unsubscribe` themselves are
  honoured (header is only added when not present).
- Transactional emails (no marketing footer) skip the injection.
- If the URL-extraction regex doesn't match, nothing is added — never
  blocks a send.

---

## What this audit did NOT cover (deferred)

- Live deliverability test against Gmail + Outlook seed inboxes.
- Cold outreach (Instantly / Smartlead) — out of scope; not first-party.
- DMARC alignment evidence — see recommendation #10.
- Template visual-regression snapshots.
- Welcome-flow consolidation refactor — multi-day work.

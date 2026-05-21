# Email Infrastructure Audit — W-AU-6

**Date:** 2026-05-21
**Scope:** Outbound email — provider, flows, DNS, bounce/complaint
handling, template management, test mode.
**Method:** static read-only review. No live emails sent.

---

## 1. Provider inventory

- **Active provider:** SendGrid via SMTP (nodemailer transporter).
  - `server/lib/emailTransport.ts` — sole transporter factory.
  - SMTP credentials via `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`.
- **Webhook:** SendGrid Event Webhook → `POST /api/email/sendgrid-webhook`. Public-key-verified (ECDSA SHA256). Source: `server/routes/sendgridWebhookRoutes.ts` + `server/lib/sendgridWebhook.ts`.
- **Inbound:** `server/routes/inboundEmailRoutes.ts` (provider TBD — likely SendGrid Inbound Parse based on naming).
- **Postmark / Mailgun / Resend:** not integrated. nodemailer is the only transport.
- **Tracking:** click + open tracking globally **disabled** via X-SMTPAPI header — temporary mitigation for unresolved SendGrid link-branding SSL (see SCORECARD). Pixel tracking + click redirect happen inside our own app (`emailTracking.ts`) instead, all rewritten through `${APP_URL}/api/email/click/:id`.

---

## 2. Outbound flows

47 distinct email templates under `server/lib/`. Major categories:

| Flow | Template file |
|---|---|
| Customer welcome | `welcomeEmail.ts`, `accountWelcomeEmail.ts`, `selfServeWelcomeEmail.ts` |
| Onboarding | `onboardingEmail.ts`, `onboardingConfirmationEmail.ts`, `onboardingReminderEmail.ts`, `adflowOnboardingEmail.ts`, `reputationShieldWelcomeEmail.ts` |
| Booking / order | `bookingConfirmationEmail.ts`, `orderConfirmationEmail.ts` |
| Subscription / billing | `paymentSucceededEmail.ts`, `paymentFailedEmail.ts`, `paymentReceiptEmail.ts`, `invoiceEmail.ts`, `billingPortalEmail.ts`, `trialExpiryEmail.ts`, `proTrialEndedEmail.ts`, `cancellationEmail.ts`, `upsellEmails.ts`, `dunningEmails.ts` |
| Reputation (ReputationShield) | `reviewRequestEmail.ts`, `lowRatingAlert.ts`, `reputationReport.ts`, `reputationConnectNudgeEmail.ts` |
| Reports | `reportEmailTemplate.ts`, `weeklyDigestEmail.ts`, `webcareAlertEmail.ts` |
| ContentFlow approvals | `contentReviewEmail.ts`, `approvalNotificationEmail.ts`, `adflowCreativeApprovalEmail.ts` |
| Support / contact | `contactEmails.ts`, `supportTicketEmails.ts`, `supportEmail.ts` |
| Auth | `passwordResetEmail.ts`, `loginLinkEmail.ts` |
| Service ops | `serviceStatusChangeEmail.ts`, `metaReauthEmail.ts`, `tradelineCallNotificationEmail.ts` |
| ContentFlow newsletters | `services/contentflow/adapters/emailAdapter.ts` |
| Queue | `server/services/emailQueueService.ts` (`email_queue` table, 3-attempt retry, alert on final failure) |

Cold outreach: no first-party sender — `INSTANTLY_API_KEY` / `SMARTLEAD_API_KEY` referenced in `.env.example` only.

---

## 3. DMARC / DKIM / SPF

For the **primary sending domain (wefixtrades.com)**: trade-team owns DNS,
no records validated automatically — Alex configures in registrar.

For **Pro-tier customer custom domains:** `server/lib/dnsVerify.ts`
implements proper SPF / DKIM / DMARC TXT-record verification using
Node's built-in `dns/promises`. Defaults assume SendGrid:
`include:sendgrid.net`, selector `s1._domainkey`. `requiredRecordsForDomain()`
gives the portal UI the exact records to display to the customer.

**Known issue (SCORECARD):** SendGrid auto-issued SSL cert for branded
link-tracking subdomain (`url1527.wefixtrades.com`-style) is not
provisioned. Mitigation: click/open tracking disabled per-message in
`emailTransport.ts` via the X-SMTPAPI header. Permanent fix requires
the SendGrid Sender Authentication → Link Branding flow + CNAME records
that Alex has to add at the registrar (hard-block, manual).

---

## 4. Bounce + complaint handling

`server/lib/sendgridWebhook.ts` classifies events:

| Event | Action |
|---|---|
| `bounce`, `dropped`, `spamreport`, `unsubscribe`, `group_unsubscribe` | **suppress** — write to `email_unsubscribes` via `recordUnsubscribe()`. `isEmailUnsubscribed()` blocks future marketing sends. |
| `blocked`, `deferred` | **monitor** — log only (these can be transient). |
| `delivered`, `open`, `click`, `processed` | **ignore** — engagement signal. |

`server/services/emailQueueService.ts` retries each item up to
`max_attempts` (default 3) with `last_error` tracking; on final failure
it fires a `email_failed` alert.

The suppression check `isEmailUnsubscribed()` is used by ~24 services.
**Gap:** the ContentFlow `emailAdapter.ts` newsletter path does NOT
appear to consult `isEmailUnsubscribed()` before sending — only
transactional + reputation paths gate on it. Newsletter sends to an
unsubscribed user would currently go through.

---

## 5. Template management

- **Transactional shell** (`server/lib/transactionalShell.ts`): centralised
  premium dark/light builder. Headline, intro, CTA, support note, chat
  bubble, legal footer all parameterised. Outlook-safe (table layout),
  Gmail-safe (inline styles), 520px mobile-first.
- **Plain-text companion:** `buildPlainText()` strips HTML for the
  multipart text part.
- **Email footer / header:** `server/lib/emailFooter.ts` (`buildEmailHeader`,
  `buildLegalFooter`, `buildChatBubble`). Marketing emails get an
  unsubscribe link; transactional skip it.
- **Per-template files:** the 47 templates compose into this shell;
  some older templates still inline their own HTML. ContentFlow
  newsletter adapter has its own simpler HTML and does NOT use the shell.
- **Test mode:** `EMAIL_TEST_SIMULATE_SUCCESS=1` (dev only, refuses to
  engage if APP_URL looks like a production domain — defense-in-depth
  against a sticky NODE_ENV=development misconfig). Used by the
  ContentFlow newsletter adapter.

---

## 6. Top 5 gaps (ranked by impact)

1. **SendGrid link-branding SSL still broken.** Click tracking globally
   disabled as mitigation — we lose deliverability + engagement
   analytics on every marketing send. Hard-block on Alex (registrar UI
   + SendGrid dashboard). Already in SCORECARD.
2. **ContentFlow newsletter adapter bypasses `isEmailUnsubscribed()`.**
   `server/services/contentflow/adapters/emailAdapter.ts` resolves
   recipient from `metadata.email.recipient` / `client.contact_email` /
   `ADMIN_EMAIL` and sends — does not look up suppression. Add one line
   before the `transporter.sendMail()` call.
3. **Primary-domain DMARC posture not documented.** `dnsVerify.ts`
   handles per-customer custom domains beautifully, but there's no
   in-repo doc for the `wefixtrades.com` sending domain's actual SPF /
   DKIM / DMARC values. SCORECARD flags SSL but not DMARC alignment.
4. **`emailQueue` does not consult suppression before send.**
   `server/services/emailQueueService.ts` pulls the next 10 pending
   items and sends without re-checking `isEmailUnsubscribed()` on the
   recipient. An unsubscribe arriving between enqueue and drain wouldn't
   prevent the send. Add the check.
5. **No `Reply-To` consistency.** `emailAdapter.ts` and most templates
   set `from: WeFixTrades <noreply@...>`; the email queue worker sets
   `replyTo` to `ADMIN_EMAIL` / `INTERNAL_LEAD_EMAIL` if set, but the
   adapter does not. Customer replies to a ContentFlow newsletter would
   land in `noreply@`, which is unmonitored. Add `replyTo: getFromAddress() | ADMIN_EMAIL`
   to the adapter.

---

## Deferred (per audit brief)

- Building a richer bounce-handler pipeline beyond suppression — needs
  Alex's email-provider decision (stay on SendGrid vs. migrate to
  Postmark/Resend).
- Email-template overhaul — 47 templates × premium shell migration is
  multi-day work.
- Wholesale provider migration.

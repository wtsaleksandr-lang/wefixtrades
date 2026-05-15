/**
 * ReputationShield welcome email — sent immediately after a customer
 * provisions a ReputationShield tier (Basic/Pro/Premium). Distinct from
 * the generic order-confirmation email because it walks the customer
 * through the one piece of setup we cannot do for them: connecting their
 * Google Business Profile.
 *
 * Without this email, customers historically pay → see nothing → assume
 * the product is broken (root cause of "ReputationShield isn't working"
 * support tickets per the Sprint 1 audit).
 *
 * Idempotency: caller stamps
 * `client_services.metadata.reputationshield_welcome_sent_at` after a
 * successful send. Re-sends are explicitly opt-in (admin override).
 */

import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { createLogger } from "./logger";
import { queueEmail } from "../services/emailQueueService";

const log = createLogger("reputationshield-welcome");

export interface ReputationShieldWelcomeData {
  toEmail: string;
  businessName: string;
  tierLabel: "Basic" | "Pro" | "Premium";
  portalUrl: string;
  /** URL that initiates Google Business Profile OAuth for this client. */
  connectGoogleUrl: string;
  supportEmail?: string;
}

export async function sendReputationShieldWelcome(data: ReputationShieldWelcomeData): Promise<void> {
  const support = data.supportEmail ?? "support@wefixtrades.com";
  const subject = `Your ReputationShield is live — connect Google to start`;

  const intro =
    `Welcome aboard — your <strong>${data.tierLabel}</strong> plan is active for ` +
    `<strong>${data.businessName}</strong>. One quick step before we can start ` +
    `protecting your reviews:`;

  const tierLine =
    data.tierLabel === "Basic"
      ? `<li>Your dashboard fills with monitoring + request stats.</li>`
      : `<li>AI draft responses appear in your portal for your approval.</li>`;

  const bodyHtml = `
    <p style="margin:16px 0 12px 0;font-size:15px;line-height:1.6;">
      <strong>Step 1 — Connect Google Business Profile.</strong>
      We use this to read your incoming reviews and (with your approval)
      post replies on your behalf.
    </p>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.55;opacity:0.8;">
      Takes about 90 seconds. You'll be redirected to Google to grant
      permission, then back to your portal.
    </p>
    <p style="margin:24px 0 8px 0;font-size:14px;font-weight:600;">
      What happens after you connect:
    </p>
    <ol style="margin:0 0 16px 24px;padding:0;font-size:14px;line-height:1.65;">
      <li>We start monitoring your reviews within 6 hours.</li>
      <li>Low-rating reviews (1–2★) trigger an instant alert email to you.</li>
      ${tierLine}
      <li>Request a review from a recent customer right from your portal.</li>
    </ol>
  `.trim();

  const html = buildTransactionalEmail({
    subjectForTitle: subject,
    headline: "ReputationShield is ready",
    intro,
    bodyHtml,
    cta: {
      label: "Connect Google Business Profile",
      url: data.connectGoogleUrl,
      style: "block",
    },
    afterCtaHtml: `
      <p style="margin:16px 0 0 0;font-size:13px;text-align:center;">
        <a href="${data.portalUrl}" style="color:#0d3cfc;text-decoration:none;">Open my portal &rarr;</a>
      </p>
    `,
    supportNote: `Questions? Reply to this email or write to <a href="mailto:${support}">${support}</a> — a real person reads every message.`,
  });

  const text = buildPlainText({
    headline: "ReputationShield is ready",
    intro,
    bodyText:
      `Step 1 — Connect Google Business Profile:\n${data.connectGoogleUrl}\n\n` +
      `Open your portal: ${data.portalUrl}`,
    ctaLabel: "Connect Google Business Profile",
    ctaUrl: data.connectGoogleUrl,
    supportNote: `Questions? ${support}`,
  });

  try {
    await queueEmail(data.toEmail, subject, html, text, {
      category: "reputationshield-welcome",
      tier: data.tierLabel,
    });
    log.info(`Welcome email queued for ${data.toEmail}`);
  } catch (err: any) {
    log.warn(`Welcome email queue failed for ${data.toEmail}: ${err.message}`);
    throw err;
  }
}

/**
 * ContentFlow "complete your setup" reminder email.
 *
 * Wave W-AZ-1. Sent 24h after a ContentFlow checkout when the customer
 * either submitted the quick-setup form with "remind me later" or never
 * touched the form at all. Points them at the deeper 8-step wizard at
 * /portal/content-preferences so the content engine has the brand layer
 * it needs to produce non-generic copy.
 *
 * Capped at one send per onboarding_submission via the worker's
 * idempotency stamp (client_services.metadata.contentflow_reminder_sent_at).
 */
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { createLogger } from "./logger";
import { queueEmail } from "../services/emailQueueService";

const log = createLogger("contentflow-reminder");

export interface ContentFlowReminderData {
  toEmail: string;
  businessName: string;
  /** Absolute URL to the deeper content-preferences wizard. */
  contentPreferencesUrl: string;
  supportEmail?: string;
}

export async function sendContentFlowReminder(data: ContentFlowReminderData): Promise<void> {
  const support = data.supportEmail ?? "support@wefixtrades.com";

  const subject = `Complete your ContentFlow setup for ${data.businessName}`;

  const intro =
    `Your ContentFlow plan for <strong>${data.businessName}</strong> is paid and active, ` +
    `but it can't generate content that sounds like your business until the brand profile ` +
    `is finished. It's a quick 8-step wizard — tone, audience, topics, the things to never ` +
    `say. About 4 minutes.`;

  const bodyHtml = `
    <p style="margin:16px 0 8px 0;font-size:14px;font-weight:600;">
      Once you finish setup, ContentFlow will:
    </p>
    <ul style="margin:0 0 16px 24px;padding:0;font-size:14px;line-height:1.65;">
      <li>Generate articles, social posts, and images in your voice</li>
      <li>Use your industries and topics — not generic boilerplate</li>
      <li>Avoid claims and language you've told us never to use</li>
      <li>Match your visual style (colors, logo, photography mood)</li>
    </ul>
    <p style="margin:12px 0 0 0;font-size:13px;line-height:1.55;opacity:0.85;">
      Until the brand profile is in, we'll hold off on publishing — generic
      content does more harm than good.
    </p>
  `.trim();

  const html = buildTransactionalEmail({
    subjectForTitle: subject,
    headline: "One more step to start your content",
    intro,
    bodyHtml,
    cta: {
      label: "Finish ContentFlow setup",
      url: data.contentPreferencesUrl,
      style: "block",
    },
    supportNote: `Stuck on a step? Reply to this email or write to <a href="mailto:${support}">${support}</a> — a real person reads every message.`,
  });

  const text = buildPlainText({
    headline: "One more step to start your content",
    intro,
    bodyText: `Finish your ContentFlow brand setup:\n${data.contentPreferencesUrl}`,
    ctaLabel: "Finish ContentFlow setup",
    ctaUrl: data.contentPreferencesUrl,
    supportNote: `Need a hand? ${support}`,
  });

  try {
    await queueEmail(data.toEmail, subject, html, text, {
      category: "contentflow-reminder",
    });
    log.info(`ContentFlow reminder queued for ${data.toEmail}`);
  } catch (err: any) {
    log.warn(`ContentFlow reminder queue failed for ${data.toEmail}: ${err.message}`);
    throw err;
  }
}

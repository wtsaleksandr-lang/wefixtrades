/**
 * ReputationShield "connect Google" re-nudge email.
 *
 * Sent by reputationConnectNudgeWorker to customers who activated
 * ReputationShield but never completed the Google Business Profile
 * OAuth step — without which the product produces nothing. The
 * welcome email is the first ask; this is the gentle follow-up a few
 * days later. Capped at MAX_NUDGES sends per customer by the worker.
 */
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { createLogger } from "./logger";
import { queueEmail } from "../services/emailQueueService";

const log = createLogger("reputationshield-connect-nudge");

export interface ReputationConnectNudgeData {
  toEmail: string;
  businessName: string;
  /** Which reminder this is (1 = first follow-up, 2 = final). */
  nudgeNumber: number;
  /** URL that initiates Google Business Profile OAuth / the setup wizard. */
  connectGoogleUrl: string;
  supportEmail?: string;
}

export async function sendReputationConnectNudge(data: ReputationConnectNudgeData): Promise<void> {
  const support = data.supportEmail ?? "support@wefixtrades.com";
  const isFinal = data.nudgeNumber >= 2;

  const subject = isFinal
    ? `Last step for ${data.businessName} — connect Google`
    : `Quick reminder: connect Google to start your reviews`;

  const intro =
    `Your ReputationShield plan for <strong>${data.businessName}</strong> is active and ` +
    `paid for — but it can't do anything until your Google Business Profile is connected. ` +
    `It's a 90-second step and it's the only thing standing between you and automatic ` +
    `review growth.`;

  const bodyHtml = `
    <p style="margin:16px 0 8px 0;font-size:14px;font-weight:600;">
      Once you connect, ReputationShield immediately starts:
    </p>
    <ul style="margin:0 0 16px 24px;padding:0;font-size:14px;line-height:1.65;">
      <li>Monitoring every new review across your platforms</li>
      <li>Asking your customers for reviews after each job</li>
      <li>Drafting professional replies for you to approve</li>
      <li>Alerting you the moment a low rating appears</li>
    </ul>
    ${isFinal ? `
    <p style="margin:16px 0 0 0;font-size:13px;line-height:1.55;opacity:0.8;">
      This is the last reminder we'll send — but your plan stays ready whenever you are.
      If you're stuck, just reply to this email and we'll help you through it.
    </p>` : ""}
  `.trim();

  const html = buildTransactionalEmail({
    subjectForTitle: subject,
    headline: isFinal ? "One step left" : "You're almost set up",
    intro,
    bodyHtml,
    cta: {
      label: "Connect Google Business Profile",
      url: data.connectGoogleUrl,
      style: "block",
    },
    supportNote: `Need a hand? Reply to this email or write to <a href="mailto:${support}">${support}</a> — a real person reads every message.`,
  });

  const text = buildPlainText({
    headline: isFinal ? "One step left" : "You're almost set up",
    intro,
    bodyText: `Connect your Google Business Profile to start:\n${data.connectGoogleUrl}`,
    ctaLabel: "Connect Google Business Profile",
    ctaUrl: data.connectGoogleUrl,
    supportNote: `Need a hand? ${support}`,
  });

  try {
    await queueEmail(data.toEmail, subject, html, text, {
      category: "reputationshield-connect-nudge",
      nudgeNumber: data.nudgeNumber,
    });
    log.info(`Connect-nudge #${data.nudgeNumber} queued for ${data.toEmail}`);
  } catch (err: any) {
    log.warn(`Connect-nudge queue failed for ${data.toEmail}: ${err.message}`);
    throw err;
  }
}

/**
 * Onboarding reminder email — nudges customers whose onboarding
 * submission has been sitting in `not_sent` / `sent` / `viewed`
 * for too long without progress.
 *
 * Different from `onboardingEmail.ts` (the FIRST email) and
 * `onboardingConfirmationEmail.ts` (sent AFTER the form is submitted).
 * This is the in-between nudge that prevents stalled onboarding from
 * silently churning a paying customer before launch.
 *
 * Honours the `service_updates` notification preference on the
 * client (callers should check before invoking, but we also belt-
 * and-braces the unsubscribe check).
 *
 * Safe-fail: catches and logs SMTP errors, never throws.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { isEmailUnsubscribed } from "./unsubscribeStorage";
import { createLogger } from "./logger";

const log = createLogger("onboarding-reminder-email");

export interface OnboardingReminderData {
  to: string;
  recipientName?: string | null;
  businessName: string;
  serviceName: string;
  /** Days since the onboarding form was first sent. Drives copy tone. */
  daysWaiting: number;
  /** Magic-link URL the customer can click to resume the form. */
  formUrl: string;
  /** Optional partial-progress percentage (0-100) to surface in the body. */
  progressPercent?: number;
}

export async function sendOnboardingReminderEmail(data: OnboardingReminderData): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("SMTP not configured — onboarding reminder NOT sent", { to: data.to });
    return false;
  }

  if (await isEmailUnsubscribed(data.to)) {
    log.info("recipient unsubscribed — skipping reminder", { to: data.to });
    return false;
  }

  const greeting = data.recipientName ? `Hi ${data.recipientName},` : `Hi ${data.businessName},`;

  /* Tone scales with how long they've been stuck:
   *  ≤3d : friendly nudge
   *  4-7d : gentle escalation
   *  >7d  : direct ask, mention the cost of delay */
  const tone =
    data.daysWaiting <= 3
      ? `Just a quick nudge — your <strong>${data.serviceName}</strong> setup is waiting on a few details from you. The form takes about 5 minutes.`
      : data.daysWaiting <= 7
      ? `It's been ${data.daysWaiting} days since we sent over your <strong>${data.serviceName}</strong> setup form. We can't kick off the work until it's submitted, so the sooner the better.`
      : `Your <strong>${data.serviceName}</strong> setup form has been waiting ${data.daysWaiting} days. Every day this stays open is a day we can't deliver the service you signed up for. If something is blocking you, reply and we'll help.`;

  const progressLine = data.progressPercent
    ? `<p style="font-size:13px;color:#8B919A;margin:0 0 16px;">You're already <strong style="color:#0d3cfc;">${data.progressPercent}% through</strong> — your answers are saved, just pick up where you left off.</p>`
    : "";

  const html = buildTransactionalEmail({
    subjectForTitle: "Your setup form is waiting",
    recipientEmail: data.to,
    headline: "Finish your setup",
    intro: `${greeting} ${tone}`,
    bodyHtml: progressLine || undefined,
    cta: {
      label: data.progressPercent ? "Resume setup" : "Open setup form",
      url: data.formUrl,
      style: "block",
    },
    pasteLinkFallback: { url: data.formUrl },
    supportNote:
      "Stuck on a question? Reply to this email and we'll help you get unstuck — most replies come back inside an hour during business days.",
  });

  const text = buildPlainText({
    headline: "Finish your setup",
    intro: greeting + " " + tone.replace(/<[^>]+>/g, ""),
    ctaLabel: data.progressPercent ? "Resume setup" : "Open setup form",
    ctaUrl: data.formUrl,
    supportNote: "Stuck on a question? Reply and we'll help.",
  });

  try {
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: data.to,
      subject: `Reminder: finish your ${data.serviceName} setup`,
      html,
      text,
    });
    return true;
  } catch (err) {
    log.error("Failed to send onboarding reminder", { to: data.to, error: String(err) });
    return false;
  }
}

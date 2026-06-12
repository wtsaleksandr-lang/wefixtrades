/**
 * Incomplete-signup re-engagement emails.
 *
 * Wins back free WeFixTrades signups who created an account but never built
 * (published) a QuoteQuick calculator — a measured activation leak (signups
 * auto-login with no email-verify checkpoint, so a user who lands on the
 * dashboard, gets confused, and leaves currently gets NOTHING).
 *
 * A gentle 3-step sequence, each gated on STILL-no-calculator AND
 * not-already-sent-this-step (idempotency lives in the worker):
 *   - Day 1 (~24h)  "finish your calculator"
 *   - Day 3         re-nudge
 *   - Day 7         last call
 *
 * These are re-engagement emails to our OWN signups (legitimate first-party
 * relationship), but treated as MARKETING-class for CAN-SPAM safety:
 * `marketing: true` renders the per-recipient unsubscribe link via
 * buildLegalFooter, and the worker checks isEmailUnsubscribed() before send.
 *
 * Template reuses the production transactional shell
 * (buildTransactionalEmail / buildPlainText) — same pattern as
 * onboardingReminderEmail.ts. Single CTA → the wizard (/wizard).
 *
 * `composeIncompleteSignupEmail()` is a PURE function (subject + html + text,
 * no IO) so the worker test can assert copy without a transport.
 * `sendIncompleteSignupEmail()` is the IO wrapper (transport + suppression),
 * used by the worker's default IO.
 */

import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";

// NOTE: the transport (nodemailer), suppression store (db), and logger
// (@sentry/node) are imported lazily inside sendIncompleteSignupEmail() so
// that composeIncompleteSignupEmail() — a pure renderer — can be imported and
// unit-tested without dragging in the send/IO dependency tree.

/** The three sequence steps, identified by the day they fire on. */
export type IncompleteSignupStep = 1 | 3 | 7;
export const INCOMPLETE_SIGNUP_STEPS: readonly IncompleteSignupStep[] = [1, 3, 7] as const;

export interface IncompleteSignupEmailContext {
  /** Recipient email — drives the footer unsubscribe link. */
  recipientEmail: string;
  /** First name (or business name / "there") for the greeting. */
  firstName: string;
  /** Business name, surfaced in the intro. */
  businessName: string;
  /** Absolute URL to the build wizard (single CTA target). */
  wizardUrl: string;
  /** Absolute support email for the reply-to note. */
  supportEmail: string;
}

interface ComposedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Pure composer: given a step + context, returns subject/html/text. No IO.
 * Copy is warm, short, single CTA, and reassures "free, no card".
 */
export function composeIncompleteSignupEmail(
  step: IncompleteSignupStep,
  ctx: IncompleteSignupEmailContext,
): ComposedEmail {
  const { recipientEmail, firstName, businessName, wizardUrl, supportEmail } = ctx;
  const greeting = `Hi ${firstName},`;

  let subject: string;
  let eyebrow: string;
  let headline: string;
  let intro: string;
  let ctaLabel: string;
  let supportNote: string;

  switch (step) {
    case 1:
      subject = `Finish your quote calculator — ${businessName}`;
      eyebrow = "One step left";
      headline = "Your calculator is one step away";
      intro =
        `${greeting} you created your free WeFixTrades account for ` +
        `<strong style="color:#F0F0F0;">${businessName}</strong> but haven't built your ` +
        `quote calculator yet. It takes about 2 minutes, and you'll have an instant-quote ` +
        `page you can share with customers today. It's <strong style="color:#F0F0F0;">free, ` +
        `no card required.</strong>`;
      ctaLabel = "Build my calculator";
      supportNote =
        `Got stuck somewhere? Just reply to this email and we'll help you finish in a few minutes.`;
      break;

    case 3:
      subject = `Still want your instant-quote page? — ${businessName}`;
      eyebrow = "Pick up where you left off";
      headline = "Your free quote calculator is waiting";
      intro =
        `${greeting} your account for ` +
        `<strong style="color:#F0F0F0;">${businessName}</strong> is set up, but your quote ` +
        `calculator isn't live yet. Trades who add one start capturing leads from their ` +
        `Google profile, website, and socials — all from a single link. ` +
        `It's <strong style="color:#F0F0F0;">free, no card required</strong>, and takes about 2 minutes.`;
      ctaLabel = "Finish in 2 minutes";
      supportNote =
        `Not sure what to put in? Reply and we'll walk you through it — most replies come back within the hour on business days.`;
      break;

    case 7:
    default:
      subject = `Last nudge: build your free calculator — ${businessName}`;
      eyebrow = "Last call";
      headline = "We'll stop nudging after this";
      intro =
        `${greeting} this is the last reminder we'll send about your ` +
        `<strong style="color:#F0F0F0;">${businessName}</strong> quote calculator. ` +
        `It's still <strong style="color:#F0F0F0;">free, no card required</strong> — and once ` +
        `it's live, sharing one link is all it takes to start collecting quote requests. ` +
        `If now isn't the right time, no worries; your account stays open whenever you're ready.`;
      ctaLabel = "Build it now";
      supportNote =
        `Prefer a hand? Reply to this email and we'll set it up with you.`;
      break;
  }

  const html = buildTransactionalEmail({
    recipientEmail,
    // Marketing-class: renders the unsubscribe link + promotes List-Unsubscribe.
    marketing: true,
    subjectForTitle: subject,
    eyebrow,
    headline,
    intro,
    cta: { label: ctaLabel, url: wizardUrl, style: "block" },
    ctaFinePrint: `Free forever — no credit card, no commitment.`,
    pasteLinkFallback: { url: wizardUrl },
    supportNote:
      `${supportNote} Or reach us at ` +
      `<a href="mailto:${supportEmail}" style="color:#0d3cfc;text-decoration:none;">${supportEmail}</a>.`,
  });

  const text = buildPlainText({
    headline,
    intro: intro.replace(/<[^>]+>/g, ""),
    ctaLabel,
    ctaUrl: wizardUrl,
    supportNote: `${supportNote.replace(/<[^>]+>/g, "")} Or reach us at ${supportEmail}.`,
  });

  return { subject, html, text };
}

/**
 * IO wrapper: composes + sends one step's email through the shared
 * transport, after a belt-and-braces unsubscribe-suppression check.
 *
 * Returns true only if an email was actually accepted by the transport.
 * Returns false (no throw) when SMTP isn't configured or the recipient has
 * unsubscribed. Throws only on a genuine send failure, so the worker can
 * isolate per-recipient failures and continue the batch.
 */
export async function sendIncompleteSignupEmail(
  step: IncompleteSignupStep,
  ctx: IncompleteSignupEmailContext,
): Promise<boolean> {
  const { getEmailTransporter, getFromAddress } = await import("./emailTransport");
  const { isEmailUnsubscribed } = await import("./unsubscribeStorage");
  const { createLogger } = await import("./logger");
  const log = createLogger("incomplete-signup-email");

  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("SMTP not configured — incomplete-signup email NOT sent", {
      to: ctx.recipientEmail,
      step,
    });
    return false;
  }

  if (await isEmailUnsubscribed(ctx.recipientEmail)) {
    log.info("recipient unsubscribed — skipping incomplete-signup email", {
      to: ctx.recipientEmail,
      step,
    });
    return false;
  }

  const { subject, html, text } = composeIncompleteSignupEmail(step, ctx);

  await transporter.sendMail({
    from: `WeFixTrades <${getFromAddress()}>`,
    to: ctx.recipientEmail,
    subject,
    html,
    text,
  });
  return true;
}

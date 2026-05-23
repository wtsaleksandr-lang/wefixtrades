/**
 * Dunning email templates — premium thin transactional shell.
 *
 * Each template is a focused, mobile-first single-CTA layout that reuses
 * `emailFooter.ts` (header + chat bubble + legal footer) for brand
 * consistency. Different from the report shell — no KPI grid, no chart,
 * one clear message, one clear button.
 *
 * The CTA always points at /api/billing/portal/:token — a signed-token
 * route that mints a fresh Stripe Billing Portal session per click,
 * so the link works for the email's full 30-day useful life instead of
 * Stripe's 5-minute portal-session window.
 *
 * Templates exported:
 *   - buildDay2ReminderEmail
 *   - buildDay5FinalReminderEmail
 *   - buildDay7WarningEmail
 *   - buildCardExpiringEmail
 *   - buildSubscriptionCanceledEmail
 *
 * All return { subject, html, text } so callers can attach plain-text
 * for spam-score parity.
 */

import { buildEmailHeader, buildChatBubble, buildLegalFooter } from "./emailFooter";

const COLORS = {
  bg: "#0B0F14",
  card: "#151A21",
  cardInner: "#0F141A",
  border: "rgba(255,255,255,0.06)",
  textBright: "#F0F0F0",
  textBody: "#CDD1D6",
  textMuted: "#8B919A",
  accent: "#0d3cfc",
  warn: "#F59E0B",
  alert: "#EF4444",
} as const;

interface BaseEmailParams {
  contactFirstName: string;
  amount?: string;            // pre-formatted, e.g. "$199.00"
  portalUrl: string;          // signed-token CTA URL
  supportEmail: string;
  recipientEmail: string;
  serviceName?: string;       // optional, e.g. "WeFixTrades QuoteQuick"
}

interface CardExpiringParams extends BaseEmailParams {
  cardLast4?: string;
  cardBrand?: string;
  expMonth?: number;
  expYear?: number;
}

/* ─── Shared building blocks ─── */

function buildShell(opts: {
  pillLabel: string;
  pillColor: string;
  headline: string;
  body: string;
  ctaLabel: string;
  portalUrl: string;
  supportNote: string;
  supportEmail: string;
  recipientEmail: string;
}): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>WeFixTrades</title>
</head><body style="margin:0;padding:0;background:${COLORS.bg};">
<div style="font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:${COLORS.bg};padding:32px 12px;">
  <div style="max-width:520px;margin:0 auto;">
    ${buildEmailHeader()}
    <div style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:16px;padding:32px 24px;">
      <p style="font-size:11px;font-weight:700;color:${opts.pillColor};text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px;">${opts.pillLabel}</p>
      <h1 style="font-size:22px;font-weight:700;color:${COLORS.textBright};margin:0 0 12px;line-height:1.3;">
        ${opts.headline}
      </h1>
      <div style="font-size:14px;color:${COLORS.textBody};line-height:1.6;margin:0 0 24px;">
        ${opts.body}
      </div>
      <table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;"><tr><td>
        <a href="${opts.portalUrl}" style="display:inline-block;background:${COLORS.accent};color:${COLORS.bg};font-size:14px;font-weight:700;padding:14px 26px;border-radius:10px;text-decoration:none;mso-padding-alt:0;">
          ${opts.ctaLabel}
        </a>
      </td></tr></table>
      <p style="font-size:12px;color:${COLORS.textMuted};line-height:1.6;margin:0;">
        ${opts.supportNote}
      </p>
      <div style="border-top:1px solid ${COLORS.border};margin:24px 0 14px;"></div>
      <p style="font-size:12px;color:${COLORS.textMuted};line-height:1.6;margin:0;">
        Need to talk? Reply to this email or reach us at
        <a href="mailto:${opts.supportEmail}" style="color:${COLORS.accent};text-decoration:none;">${opts.supportEmail}</a>
        — we can pause billing, adjust your plan, or work out an arrangement.
      </p>
    </div>
    ${buildChatBubble()}
    ${buildLegalFooter({ recipientEmail: opts.recipientEmail })}
  </div>
</div>
</body></html>`;
}

function buildPlainText(opts: {
  headline: string;
  bodyPlain: string;
  ctaLabel: string;
  portalUrl: string;
  supportEmail: string;
}): string {
  return [
    opts.headline,
    "",
    opts.bodyPlain,
    "",
    `${opts.ctaLabel}: ${opts.portalUrl}`,
    "",
    `Need to talk? Reply to this email or reach us at ${opts.supportEmail} — we can pause billing, adjust your plan, or work out an arrangement.`,
    "",
    "WeFixTrades · Toronto, Canada",
  ].join("\n");
}

/* ─── Day 2 — friendly reminder ─── */

export function buildDay2ReminderEmail(params: BaseEmailParams): { subject: string; html: string; text: string } {
  const subject = "Payment issue — action needed";
  const headline = `Quick reminder, ${params.contactFirstName || "there"}`;
  const amountLine = params.amount
    ? `Your last payment of <strong style="color:${COLORS.textBright};">${params.amount}</strong> didn't go through, and we haven't been able to retry it successfully yet.`
    : `Your most recent WeFixTrades payment didn't go through, and we haven't been able to retry it successfully yet.`;

  const body = `
    <p style="margin:0 0 14px;">${amountLine}</p>
    <p style="margin:0;">A 30-second card update is usually all it takes — once your details are current, we'll retry the charge immediately and your service stays uninterrupted.</p>
  `;

  const html = buildShell({
    pillLabel: "Reminder",
    pillColor: COLORS.warn,
    headline,
    body,
    ctaLabel: "Update payment method",
    portalUrl: params.portalUrl,
    supportNote: "Updating your card takes about 30 seconds. We'll retry the charge automatically the moment it's saved.",
    supportEmail: params.supportEmail,
    recipientEmail: params.recipientEmail,
  });

  const text = buildPlainText({
    headline,
    bodyPlain: `${params.amount ? `Your last payment of ${params.amount} didn't go through.` : "Your most recent WeFixTrades payment didn't go through."} A 30-second card update is usually all it takes — once your details are current, we'll retry the charge immediately and your service stays uninterrupted.`,
    ctaLabel: "Update payment method",
    portalUrl: params.portalUrl,
    supportEmail: params.supportEmail,
  });

  return { subject, html, text };
}

/* ─── Day 5 — final reminder ─── */

export function buildDay5FinalReminderEmail(params: BaseEmailParams): { subject: string; html: string; text: string } {
  const subject = "Billing update needed";
  const headline = `Let's get this sorted, ${params.contactFirstName || "there"}`;
  const amountLine = params.amount
    ? `We've now tried a few times to charge <strong style="color:${COLORS.textBright};">${params.amount}</strong> to the card on file, and each retry has come back declined.`
    : `We've now tried a few times to charge the card on file, and each retry has come back declined.`;

  const body = `
    <p style="margin:0 0 14px;">${amountLine}</p>
    <p style="margin:0 0 14px;">Most of the time this just means the card has expired or been replaced — banks issue new ones constantly and we don't always get the update automatically.</p>
    <p style="margin:0;">Drop in a fresh card and we'll get you back to green right away.</p>
  `;

  const html = buildShell({
    pillLabel: "Final reminder",
    pillColor: COLORS.warn,
    headline,
    body,
    ctaLabel: "Update billing details",
    portalUrl: params.portalUrl,
    supportNote: "Once your card is updated we retry within seconds, so there's no service gap on your end.",
    supportEmail: params.supportEmail,
    recipientEmail: params.recipientEmail,
  });

  const text = buildPlainText({
    headline,
    bodyPlain: `${params.amount ? `We've now tried a few times to charge ${params.amount} to the card on file, and each retry has come back declined.` : "We've now tried a few times to charge the card on file, and each retry has come back declined."} Most of the time this just means the card has expired or been replaced. Drop in a fresh card and we'll get you back to green right away.`,
    ctaLabel: "Update billing details",
    portalUrl: params.portalUrl,
    supportEmail: params.supportEmail,
  });

  return { subject, html, text };
}

/* ─── Day 7 — service-pause warning (warning only, no auto-pause) ─── */

export function buildDay7WarningEmail(params: BaseEmailParams): { subject: string; html: string; text: string } {
  const subject = "Final reminder to keep service active";
  const headline = `${params.contactFirstName || "We need a hand"} — your service is at risk`;
  const amountLine = params.amount
    ? `We still haven't been able to collect <strong style="color:${COLORS.textBright};">${params.amount}</strong> on your WeFixTrades subscription.`
    : `We still haven't been able to collect on your WeFixTrades subscription.`;

  const body = `
    <p style="margin:0 0 14px;">${amountLine}</p>
    <p style="margin:0 0 14px;">If we can't get a payment through in the next couple of days, your service may pause automatically — leads stop routing, posts stop publishing, dashboards lock. Nothing gets deleted, but everything sits idle until billing is current.</p>
    <p style="margin:0;">A quick card update gets everything moving again. We'd hate to lose you over a billing hiccup.</p>
  `;

  const html = buildShell({
    pillLabel: "Service at risk",
    pillColor: COLORS.alert,
    headline,
    body,
    ctaLabel: "Keep my service active",
    portalUrl: params.portalUrl,
    supportNote: "Prefer to talk it through? Reply to this email — we can pause billing instead, work out an arrangement, or adjust your plan to fit.",
    supportEmail: params.supportEmail,
    recipientEmail: params.recipientEmail,
  });

  const text = buildPlainText({
    headline,
    bodyPlain: `${params.amount ? `We still haven't been able to collect ${params.amount} on your WeFixTrades subscription.` : "We still haven't been able to collect on your WeFixTrades subscription."} If we can't get a payment through in the next couple of days, your service may pause automatically — nothing gets deleted, but everything sits idle until billing is current. A quick card update gets everything moving again.`,
    ctaLabel: "Keep my service active",
    portalUrl: params.portalUrl,
    supportEmail: params.supportEmail,
  });

  return { subject, html, text };
}

/* ─── Card expiring — standalone, proactive ─── */

export function buildCardExpiringEmail(params: CardExpiringParams): { subject: string; html: string; text: string } {
  const subject = "Your card is about to expire";
  const headline = `Heads-up, ${params.contactFirstName || "there"}`;
  const cardDescription = params.cardBrand && params.cardLast4
    ? `the ${params.cardBrand} card ending in <strong style="color:${COLORS.textBright};">${params.cardLast4}</strong>`
    : "the card on file";
  const expDescription = params.expMonth && params.expYear
    ? ` is set to expire ${String(params.expMonth).padStart(2, "0")}/${String(params.expYear).slice(-2)}`
    : " is about to expire";

  const body = `
    <p style="margin:0 0 14px;">Just a friendly heads-up — ${cardDescription}${expDescription}.</p>
    <p style="margin:0;">Update it ahead of time and your service stays seamless. Takes about 30 seconds.</p>
  `;

  const html = buildShell({
    pillLabel: "Card expiring soon",
    pillColor: COLORS.accent,
    headline,
    body,
    ctaLabel: "Update card on file",
    portalUrl: params.portalUrl,
    supportNote: "If your bank already mailed you a replacement, you can drop in the new details now and we'll use it for the next renewal.",
    supportEmail: params.supportEmail,
    recipientEmail: params.recipientEmail,
  });

  const text = buildPlainText({
    headline,
    bodyPlain: `Just a friendly heads-up — ${params.cardBrand && params.cardLast4 ? `the ${params.cardBrand} card ending in ${params.cardLast4}` : "the card on file"}${params.expMonth && params.expYear ? ` is set to expire ${String(params.expMonth).padStart(2, "0")}/${String(params.expYear).slice(-2)}` : " is about to expire"}. Update it ahead of time and your service stays seamless. Takes about 30 seconds.`,
    ctaLabel: "Update card on file",
    portalUrl: params.portalUrl,
    supportEmail: params.supportEmail,
  });

  return { subject, html, text };
}

/* ─── Subscription canceled — confirmation, no CTA pressure ─── */

export function buildSubscriptionCanceledEmail(params: BaseEmailParams): { subject: string; html: string; text: string } {
  const subject = "Your WeFixTrades subscription has been canceled";
  const headline = `${params.contactFirstName || "Hi"}, your subscription is canceled`;
  const serviceLine = params.serviceName
    ? `Your <strong style="color:${COLORS.textBright};">${params.serviceName}</strong> subscription has been canceled.`
    : `Your WeFixTrades subscription has been canceled.`;

  const body = `
    <p style="margin:0 0 14px;">${serviceLine} You won't be charged again, and we've stopped any further billing reminders.</p>
    <p style="margin:0 0 14px;">Your account stays accessible — nothing gets deleted, leads and reports remain in place. If you change your mind, you can reactivate any time from the billing portal.</p>
    <p style="margin:0;">Whatever made you cancel, we'd genuinely love to know. Reply to this email and tell us — we read every one.</p>
  `;

  const html = buildShell({
    pillLabel: "Canceled",
    pillColor: COLORS.textMuted,
    headline,
    body,
    ctaLabel: "View billing & reactivate",
    portalUrl: params.portalUrl,
    supportNote: "If this cancellation was a mistake, reply within 30 days and we can usually restore everything as it was.",
    supportEmail: params.supportEmail,
    recipientEmail: params.recipientEmail,
  });

  const text = buildPlainText({
    headline,
    bodyPlain: `${params.serviceName ? `Your ${params.serviceName} subscription has been canceled.` : "Your WeFixTrades subscription has been canceled."} You won't be charged again, and we've stopped any further billing reminders. Your account stays accessible — nothing gets deleted. If you change your mind, you can reactivate any time. Whatever made you cancel, we'd love to know — reply and tell us.`,
    ctaLabel: "View billing & reactivate",
    portalUrl: params.portalUrl,
    supportEmail: params.supportEmail,
  });

  return { subject, html, text };
}

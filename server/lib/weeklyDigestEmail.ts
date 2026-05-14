/**
 * Weekly digest email — Friday recap fulfilling the
 * `weekly_digest` notification preference shipped in wave 3.
 *
 * Pulls one week of customer-visible activity into a single email:
 *   - Calls / leads captured
 *   - New reviews (count + average rating)
 *   - MapGuard ranking changes
 *   - Tasks delivered + tasks pending the customer's input
 *
 * Each section is optional — if a customer doesn't have any of the
 * underlying services, that section just doesn't render. An empty
 * digest (no data anywhere) is suppressed at the caller level so
 * we never send a "you had 0 of everything this week" email.
 *
 * Honours the unsubscribe list and the customer's notification
 * preferences (caller is responsible for the prefs check; we
 * additionally belt-and-braces the unsubscribe check).
 *
 * Safe-fail: catches and logs SMTP errors, never throws.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { isEmailUnsubscribed } from "./unsubscribeStorage";
import { createLogger } from "./logger";

const log = createLogger("weekly-digest-email");

export interface WeeklyDigestSection {
  /** Headline number, e.g. "12" for "12 calls". */
  value: string | number;
  /** Plural-aware label: "calls captured", "reviews", etc. */
  label: string;
  /** Optional secondary line — "+3 vs last week", "avg 4.7 ★", etc. */
  detail?: string;
}

export interface WeeklyDigestData {
  to: string;
  recipientName?: string | null;
  businessName: string;
  /** Date strings like "Mon 3 Apr" – "Sun 9 Apr". */
  weekRange: string;
  sections: WeeklyDigestSection[];
  /** Optional one-liner highlighting the biggest win or risk. */
  highlight?: string;
  /** Deep link to the portal overview page. */
  portalUrl: string;
}

export async function sendWeeklyDigestEmail(data: WeeklyDigestData): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("SMTP not configured — weekly digest NOT sent", { to: data.to });
    return false;
  }

  if (await isEmailUnsubscribed(data.to)) {
    log.info("recipient unsubscribed — skipping digest", { to: data.to });
    return false;
  }

  if (data.sections.length === 0) {
    /* Defence in depth — calling code already filters out zero-
     * activity weeks. If we somehow got here anyway, don't send. */
    log.info("digest has no sections — skipping", { to: data.to });
    return false;
  }

  const greeting = data.recipientName ? `Hi ${data.recipientName},` : `Hi ${data.businessName},`;

  /* Stat grid — 1 column on mobile (always, since email clients
   * vary), 2 columns conceptually but rendered as stacked rows for
   * universal compatibility. */
  const sectionRows = data.sections
    .map(
      (s) => `
    <tr>
      <td style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.06);">
        <div style="font-size:24px;font-weight:700;color:#0d3cfc;line-height:1;">${escapeHtml(String(s.value))}</div>
        <div style="font-size:13px;color:#F0F0F0;font-weight:600;margin-top:4px;">${escapeHtml(s.label)}</div>
        ${s.detail ? `<div style="font-size:11px;color:#8B919A;margin-top:2px;">${escapeHtml(s.detail)}</div>` : ""}
      </td>
    </tr>`,
    )
    .join("");

  const sectionsHtml = `
    <div style="margin:18px 0 22px;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:12px;overflow:hidden;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tbody>${sectionRows}</tbody>
      </table>
    </div>
  `;

  const highlightHtml = data.highlight
    ? `<p style="font-size:13px;color:#CDD1D6;line-height:1.6;margin:0 0 16px;padding:14px 16px;border-left:2px solid #0d3cfc;background:#0F141A;border-radius:8px;">${escapeHtml(data.highlight)}</p>`
    : "";

  const html = buildTransactionalEmail({
    subjectForTitle: `Your week in review — ${data.weekRange}`,
    recipientEmail: data.to,
    headline: "Your week in review",
    intro: `${greeting} here's what happened with <strong>${escapeHtml(data.businessName)}</strong> from ${escapeHtml(data.weekRange)}.`,
    bodyHtml: sectionsHtml + highlightHtml,
    cta: {
      label: "Open your portal",
      url: data.portalUrl,
      style: "primary",
    },
    pasteLinkFallback: { url: data.portalUrl },
    supportNote:
      "Don't want weekly digests? You can switch them off in <a href=\"" +
      data.portalUrl +
      "/settings\" style=\"color:inherit;text-decoration:underline;\">Notification preferences</a>.",
  });

  const text = buildPlainText({
    headline: "Your week in review",
    intro:
      greeting +
      " here's what happened from " +
      data.weekRange +
      ":\n\n" +
      data.sections.map((s) => `• ${s.value} ${s.label}${s.detail ? ` (${s.detail})` : ""}`).join("\n") +
      (data.highlight ? `\n\n${data.highlight}` : ""),
    ctaLabel: "Open your portal",
    ctaUrl: data.portalUrl,
    supportNote: "Switch off weekly digests in your portal notification preferences.",
  });

  try {
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: data.to,
      subject: `Your week in review — ${data.weekRange}`,
      html,
      text,
    });
    return true;
  } catch (err) {
    log.error("Failed to send weekly digest", { to: data.to, error: String(err) });
    return false;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

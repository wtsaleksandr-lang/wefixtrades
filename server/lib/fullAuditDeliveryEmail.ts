/**
 * Full Audit Master delivery email — sent when an order transitions to
 * status="completed" inside the Stripe webhook handler. Delivers a
 * shareable link to the consolidated 5-section audit report.
 *
 * Wave 3.5 launch-wiring closeout (2026-05-25).
 * Wave 3.6 (2026-05-25): body now includes the per-section score table
 * via the reportRenderer; share URL points at the new public
 * /full-audit-report/:orderId/:shareToken route.
 */
import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { createLogger } from "./logger";
import type { MasterAuditReport } from "../services/fullAuditMaster/types";
import { renderReportEmailBody } from "../services/fullAuditMaster/reportRenderer";

const log = createLogger("FullAuditDelivery");

export interface FullAuditDeliveryData {
  recipientEmail: string;
  businessUrl: string;
  resultUrl: string;
  /** Optional — when present, the per-section score table is rendered. */
  report?: MasterAuditReport;
}

export async function sendFullAuditDeliveryEmail(data: FullAuditDeliveryData): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("No email transporter — skipping Full Audit delivery email");
    return false;
  }

  const subject = "Your Full Audit Master is ready";

  // Prefer the rendered section table when the pipeline supplied a
  // validated report; fall back to the legacy bullet list so the email
  // still goes out if a stale caller (or test) skipped the field.
  const bodyHtml = data.report
    ? renderReportEmailBody(data.report, data.resultUrl)
    : `
      <p style="font-size:14px;color:rgb(205,209,214);line-height:1.6;margin:0 0 16px;">
        Your Full Audit Master report for <strong style="color:rgb(240,240,240);">${escapeHtml(data.businessUrl)}</strong> is ready.
      </p>
      <p style="font-size:13px;color:rgb(139,145,154);line-height:1.6;margin:0;">
        Open the report below — bookmark the link, it stays available indefinitely.
      </p>
    `;

  const html = buildTransactionalEmail({
    recipientEmail: data.recipientEmail,
    subjectForTitle: subject,
    headerTagline: "Audit complete",
    eyebrow: "FULL AUDIT MASTER",
    headline: "Your audit is ready",
    bodyHtml,
    cta: { label: "Open my audit report", url: data.resultUrl, style: "primary" },
    pasteLinkFallback: { url: data.resultUrl },
    supportNote: "Questions? Reply to this email or write to support@wefixtrades.com.",
  });

  const text = buildPlainText({
    headline: "Your Full Audit Master is ready",
    intro: `Your audit for ${data.businessUrl} is complete${data.report ? ` — overall score ${data.report.overallScore}/100` : ""}.`,
    bodyText: "Five sections covered: desktop speed, mobile speed, SEO, accessibility, and security. Open the link below for the full breakdown.",
    ctaLabel: "Open my audit report",
    ctaUrl: data.resultUrl,
    supportNote: "Questions? Reply to this email.",
  });

  try {
    await transporter.sendMail({
      from: `"WeFixTrades Audits" <${getFromAddress()}>`,
      to: data.recipientEmail,
      subject,
      html,
      text,
    });
    log.info("Full Audit delivery email sent", { to: data.recipientEmail });
    return true;
  } catch (err: any) {
    log.error("Full Audit delivery email send failed", { error: err.message });
    return false;
  }
}

/* ─── Failure email (Wave 3.6) ──────────────────────────────────────── */

export interface FullAuditFailureData {
  recipientEmail: string;
  businessUrl: string;
  orderId: string;
}

/**
 * Sent when the pipeline either threw outright or produced a half-empty
 * report (>2 of 5 sections failed). Offers a refund + a single-click
 * support contact so the customer isn't left with a charge and no
 * deliverable.
 */
export async function sendFullAuditFailureEmail(data: FullAuditFailureData): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("No email transporter — skipping Full Audit failure email");
    return false;
  }

  const subject = "We couldn't complete your Full Audit Master";
  const supportMailto = `mailto:support@wefixtrades.com?subject=${encodeURIComponent(`Refund request — order ${data.orderId}`)}&body=${encodeURIComponent(`Please refund order ${data.orderId} (${data.businessUrl}).`)}`;

  const bodyHtml = `
    <p style="font-size:14px;color:rgb(205,209,214);line-height:1.6;margin:0 0 16px;">
      We hit a snag running your Full Audit Master for
      <strong style="color:rgb(240,240,240);">${escapeHtml(data.businessUrl)}</strong>.
      Several sections didn't come back with usable data, so we'd rather
      apologise and refund you than ship a half-empty report.
    </p>
    <p style="font-size:13px;color:rgb(139,145,154);line-height:1.6;margin:0 0 16px;">
      Reply to this email or click the button below to request your refund —
      we'll process it the same business day.
    </p>
  `;

  const html = buildTransactionalEmail({
    recipientEmail: data.recipientEmail,
    subjectForTitle: subject,
    headerTagline: "Audit didn't complete",
    eyebrow: "FULL AUDIT MASTER",
    headline: "We couldn't complete your audit",
    bodyHtml,
    cta: { label: "Request refund", url: supportMailto, style: "primary" },
    pasteLinkFallback: { url: supportMailto },
    supportNote: "Order " + data.orderId + ". Reply with any context that might help us retry.",
  });

  const text = buildPlainText({
    headline: "We couldn't complete your Full Audit Master",
    intro: `We hit a snag running the audit for ${data.businessUrl}.`,
    bodyText: `Reply to this email with the subject "Refund — order ${data.orderId}" and we'll process it the same business day.`,
    ctaLabel: "Request refund",
    ctaUrl: supportMailto,
    supportNote: "support@wefixtrades.com",
  });

  try {
    await transporter.sendMail({
      from: `"WeFixTrades Audits" <${getFromAddress()}>`,
      to: data.recipientEmail,
      subject,
      html,
      text,
    });
    log.info("Full Audit failure email sent", { to: data.recipientEmail, orderId: data.orderId });
    return true;
  } catch (err: any) {
    log.error("Full Audit failure email send failed", { error: err.message });
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

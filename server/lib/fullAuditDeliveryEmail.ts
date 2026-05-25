/**
 * Full Audit Master delivery email — sent when an order transitions to
 * status="completed" inside the Stripe webhook handler. Delivers a
 * link to the consolidated audit report.
 *
 * Wave 3.5 launch-wiring closeout (2026-05-25).
 */
import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { createLogger } from "./logger";

const log = createLogger("FullAuditDelivery");

export interface FullAuditDeliveryData {
  recipientEmail: string;
  businessUrl: string;
  resultUrl: string;
}

export async function sendFullAuditDeliveryEmail(data: FullAuditDeliveryData): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("No email transporter — skipping Full Audit delivery email");
    return false;
  }

  const subject = "Your Full Audit Master is ready";

  const bodyHtml = `
    <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 16px;">
      Your Full Audit Master report for <strong style="color:#F0F0F0;">${escapeHtml(data.businessUrl)}</strong> is ready.
      It bundles five audits into a single deliverable:
    </p>
    <ul style="margin:0 0 16px 24px;padding:0;font-size:14px;color:#CDD1D6;line-height:1.65;">
      <li>Local SEO checklist (28 ranking factors)</li>
      <li>NAP consistency across 50 directories</li>
      <li>Core Web Vitals (desktop + mobile)</li>
      <li>Trust &amp; authority signals</li>
      <li>Market size for your service area</li>
    </ul>
    <p style="font-size:13px;color:#8B919A;line-height:1.6;margin:0;">
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
    intro: `Your audit for ${data.businessUrl} is complete.`,
    bodyText: "Local SEO, NAP, site speed, trust, market size — combined report.",
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

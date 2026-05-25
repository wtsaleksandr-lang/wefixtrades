/**
 * Citation Builder order confirmation email — sent immediately after
 * checkout.session.completed fires for a citation_builder product.
 *
 * Wave 3.5 launch-wiring closeout (2026-05-25).
 */
import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { createLogger } from "./logger";

const log = createLogger("CitationBuilderOrder");

export interface CitationBuilderOrderData {
  recipientEmail: string;
  businessName: string;
  tier: "starter" | "pro" | "premium";
  directoriesTotal: number;
}

const TIER_LABEL: Record<CitationBuilderOrderData["tier"], string> = {
  starter: "Starter",
  pro: "Pro",
  premium: "Premium",
};

export async function sendCitationBuilderOrderEmail(data: CitationBuilderOrderData): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("No email transporter — skipping Citation Builder order email");
    return false;
  }

  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  const portalUrl = `${baseUrl}/portal/citation-builder`;
  const subject = `Citation Builder ${TIER_LABEL[data.tier]} — order received`;

  const bodyHtml = `
    <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 16px;">
      Thanks for your order — we've kicked off Citation Builder
      <strong style="color:#F0F0F0;">${TIER_LABEL[data.tier]}</strong>
      for <strong style="color:#F0F0F0;">${escapeHtml(data.businessName)}</strong>
      (${data.directoriesTotal} directories).
    </p>
    <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 12px;">What happens next:</p>
    <ol style="margin:0 0 16px 24px;padding:0;font-size:14px;color:#CDD1D6;line-height:1.65;">
      <li>Our team verifies + cleans your NAP within 1 business day.</li>
      <li>If we need anything else, we'll reach out via this email address.</li>
      <li>Submissions start within 2 business days and complete within 7.</li>
      <li>You'll get a completion report with links to every new citation.</li>
    </ol>
    <p style="font-size:13px;color:#8B919A;line-height:1.6;margin:0;">
      Track progress in your portal at any time — the dashboard updates as each directory goes live.
    </p>
  `;

  const html = buildTransactionalEmail({
    recipientEmail: data.recipientEmail,
    subjectForTitle: subject,
    headerTagline: "Order confirmed",
    eyebrow: "CITATION BUILDER",
    headline: "We're on it",
    bodyHtml,
    cta: { label: "View my submission", url: portalUrl, style: "primary" },
    supportNote: `Questions? Reply to this email — a real person reads every message.`,
  });

  const text = buildPlainText({
    headline: `Citation Builder ${TIER_LABEL[data.tier]} — order received`,
    intro: `We've kicked off Citation Builder ${TIER_LABEL[data.tier]} for ${data.businessName} (${data.directoriesTotal} directories).`,
    bodyText: [
      "1. NAP verification within 1 business day.",
      "2. Submissions start within 2 business days.",
      "3. Completion within 7 business days.",
      "4. Completion report with links to every new citation.",
    ].join("\n"),
    ctaLabel: "View my submission",
    ctaUrl: portalUrl,
    supportNote: "Questions? Reply to this email.",
  });

  try {
    await transporter.sendMail({
      from: `"WeFixTrades Citations" <${getFromAddress()}>`,
      to: data.recipientEmail,
      subject,
      html,
      text,
    });
    log.info("Citation Builder order email sent", { to: data.recipientEmail, tier: data.tier });
    return true;
  } catch (err: any) {
    log.error("Citation Builder order email send failed", { error: err.message });
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

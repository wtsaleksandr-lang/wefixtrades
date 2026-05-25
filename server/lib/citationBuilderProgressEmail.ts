/**
 * Citation Builder progress email — fired when an ops admin transitions
 * a submission to status="in_progress" so the customer knows real
 * submissions have started.
 *
 * Wave 3.5 launch-wiring closeout (2026-05-25).
 */
import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { createLogger } from "./logger";

const log = createLogger("CitationBuilderProgress");

export interface CitationBuilderProgressData {
  recipientEmail: string;
  businessName: string;
  tier: "starter" | "pro" | "premium";
  directoriesSubmittedCount: number;
  directoriesTotal: number;
}

export async function sendCitationBuilderProgressEmail(data: CitationBuilderProgressData): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("No email transporter — skipping Citation Builder progress email");
    return false;
  }

  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  const portalUrl = `${baseUrl}/portal/citation-builder`;
  const subject = `Citation Builder — submissions are live (${data.directoriesSubmittedCount}/${data.directoriesTotal})`;

  const bodyHtml = `
    <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 16px;">
      Good news — submissions are live for <strong style="color:#F0F0F0;">${escapeHtml(data.businessName)}</strong>.
      We're <strong style="color:#F0F0F0;">${data.directoriesSubmittedCount}/${data.directoriesTotal}</strong>
      directories in.
    </p>
    <p style="font-size:13px;color:#8B919A;line-height:1.6;margin:0;">
      Most directories accept within 24-48 hours, the slower ones (BBB, Angi) take a few days. You'll get a final email when every listing is live.
    </p>
  `;

  const html = buildTransactionalEmail({
    recipientEmail: data.recipientEmail,
    subjectForTitle: subject,
    headerTagline: "Progress update",
    eyebrow: "CITATION BUILDER",
    headline: "Submissions are live",
    bodyHtml,
    cta: { label: "View progress", url: portalUrl, style: "primary" },
    supportNote: "Questions? Reply to this email.",
  });

  const text = buildPlainText({
    headline: "Citation Builder — submissions are live",
    intro: `${data.directoriesSubmittedCount} of ${data.directoriesTotal} directories submitted.`,
    bodyText: "Most directories accept within 24-48 hours.",
    ctaLabel: "View progress",
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
    log.info("Citation Builder progress email sent", { to: data.recipientEmail });
    return true;
  } catch (err: any) {
    log.error("Citation Builder progress email send failed", { error: err.message });
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

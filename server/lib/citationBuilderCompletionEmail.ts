/**
 * Citation Builder completion email — fired when a submission
 * transitions to status="completed". Includes the directory list and
 * a portal link to the completion report.
 *
 * Wave 3.5 launch-wiring closeout (2026-05-25).
 */
import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { createLogger } from "./logger";

const log = createLogger("CitationBuilderCompletion");

export interface CitationBuilderCompletionData {
  recipientEmail: string;
  businessName: string;
  tier: "starter" | "pro" | "premium";
  directoriesTotal: number;
  /** Optional list of directory names that went live. */
  directories?: string[];
}

export async function sendCitationBuilderCompletionEmail(data: CitationBuilderCompletionData): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("No email transporter — skipping Citation Builder completion email");
    return false;
  }

  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  const portalUrl = `${baseUrl}/portal/citation-builder`;
  const subject = `Citation Builder — all ${data.directoriesTotal} listings are live`;

  const directoryListHtml = (data.directories || []).length
    ? `<ul style="margin:0 0 16px 24px;padding:0;font-size:13px;color:#CDD1D6;line-height:1.55;">
        ${data.directories!.map(d => `<li>${escapeHtml(d)}</li>`).join("")}
       </ul>`
    : `<p style="font-size:13px;color:#8B919A;line-height:1.6;margin:0 0 16px;">Open your portal to see direct links to every new listing.</p>`;

  const bodyHtml = `
    <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 16px;">
      Done — <strong style="color:#F0F0F0;">${escapeHtml(data.businessName)}</strong> is now listed on all
      <strong style="color:#F0F0F0;">${data.directoriesTotal}</strong> directories in your Citation Builder tier.
    </p>
    ${directoryListHtml}
    <p style="font-size:13px;color:#8B919A;line-height:1.6;margin:0;">
      Want continuous monitoring? Citation Tracker ($19/mo) watches your listings and alerts you if any go stale.
    </p>
  `;

  const html = buildTransactionalEmail({
    recipientEmail: data.recipientEmail,
    subjectForTitle: subject,
    headerTagline: "All done",
    eyebrow: "CITATION BUILDER",
    headline: "Your listings are live",
    bodyHtml,
    cta: { label: "View completion report", url: portalUrl, style: "primary" },
    supportNote: "Questions? Reply to this email.",
  });

  const text = buildPlainText({
    headline: `Citation Builder complete — ${data.directoriesTotal} listings live`,
    intro: `${data.businessName} is now listed on all ${data.directoriesTotal} directories in your tier.`,
    bodyText: (data.directories || []).join("\n") || "Open your portal to see all direct links.",
    ctaLabel: "View completion report",
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
    log.info("Citation Builder completion email sent", { to: data.recipientEmail });
    return true;
  } catch (err: any) {
    log.error("Citation Builder completion email send failed", { error: err.message });
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

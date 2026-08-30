/**
 * Citation Builder progress email.
 *
 * THE ONLY CALLER IS `maybeSendProgressEmail()` in
 * server/services/citationBuilder/fulfilment.ts, which fires it the first
 * time an operator records a real submission against a directory — a
 * citation_builder_directory_tasks row moving to `submitted` or `live`.
 *
 * It is deliberately NOT fired by the "start this order" action, and there
 * is no scheduled or timed variant. An order with no recorded work generates
 * no mail, however old it is. The guard
 * `npm run check:citation-builder-fulfilment` fails CI if a second caller
 * appears or if a timer is wired into this path.
 *
 * Written 2026-05-25 with zero callers; wired to real operator work
 * 2026-08-29.
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
      How quickly each one publishes is the directory's call — Google verification and BBB review
      routinely take longer than the rest. Your portal shows where every listing has got to, and
      we'll email you a final report when the order is done.
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

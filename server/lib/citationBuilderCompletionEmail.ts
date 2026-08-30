/**
 * Citation Builder completion email.
 *
 * THE ONLY CALLER IS `completeSubmission()` in
 * server/services/citationBuilder/fulfilment.ts, which refuses to run unless
 * every directory on the order has a recorded outcome and at least one is
 * `live`. Do not call this from a route, a worker or a cron — the guard
 * `npm run check:citation-builder-fulfilment` fails CI if a second caller
 * appears, because a completion report that is not backed by task rows is a
 * claim we did not earn.
 *
 * Written 2026-05-25 with zero callers; wired to real operator work
 * 2026-08-29. The same pass replaced "all N listings are live" with the
 * live count, because N was the tier's marketing number and a directory that
 * rejected the business is not a listing.
 */
import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { createLogger } from "./logger";

const log = createLogger("CitationBuilderCompletion");

export interface CitationBuilderCompletionData {
  recipientEmail: string;
  businessName: string;
  tier: "starter" | "pro" | "premium";
  /** Directories VERIFIED live, each with a recorded listing URL. */
  directoriesLive: number;
  /** Directories worked in total (the real checklist size, not the tier label). */
  directoriesTotal: number;
  /** Directories that rejected the business or did not apply to it. */
  directoriesRejected?: number;
  /** Names of the directories that went live. */
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
  const live = data.directoriesLive;
  const unresolved = Math.max(0, data.directoriesRejected ?? 0);
  const subject = `Citation Builder — ${live} listing${live === 1 ? "" : "s"} live`;

  const directoryListHtml = (data.directories || []).length
    ? `<ul style="margin:0 0 16px 24px;padding:0;font-size:13px;color:#CDD1D6;line-height:1.55;">
        ${data.directories!.map(d => `<li>${escapeHtml(d)}</li>`).join("")}
       </ul>`
    : `<p style="font-size:13px;color:#8B919A;line-height:1.6;margin:0 0 16px;">Open your portal to see direct links to every new listing.</p>`;

  // Only ever states the number we recorded as live. When some directories
  // refused the business or did not apply, the email says so rather than
  // rounding it up to the tier's headline number.
  const unresolvedHtml = unresolved > 0
    ? `<p style="font-size:13px;color:#8B919A;line-height:1.6;margin:0 0 16px;">
         ${unresolved} of the ${data.directoriesTotal} directories we worked did not result in a listing —
         each one is listed in your portal with the reason.
       </p>`
    : "";

  const bodyHtml = `
    <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 16px;">
      Done — <strong style="color:#F0F0F0;">${escapeHtml(data.businessName)}</strong> is now listed on
      <strong style="color:#F0F0F0;">${live}</strong> director${live === 1 ? "y" : "ies"}.
    </p>
    ${directoryListHtml}
    ${unresolvedHtml}
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
    headline: `Citation Builder complete — ${live} listing${live === 1 ? "" : "s"} live`,
    intro: `${data.businessName} is now listed on ${live} director${live === 1 ? "y" : "ies"}.`,
    bodyText:
      ((data.directories || []).join("\n") || "Open your portal to see all direct links.") +
      (unresolved > 0
        ? `\n\n${unresolved} of the ${data.directoriesTotal} directories we worked did not result in a listing — the reason for each is in your portal.`
        : ""),
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

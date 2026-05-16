/**
 * Ad-hoc support email — the outbound side of the Phase 3c concierge.
 *
 * Sends a one-off, branded email to a client from the support address. Used
 * by the admin copilot's `send_support_email` action: the founder asks the
 * copilot to email a client, confirms the rendered email on a confirm card,
 * and it goes out through the standard email queue.
 *
 * Distinct from supportTicketEmails.ts (fixed ticket-lifecycle templates) —
 * this carries free-form body text the copilot composed.
 */

import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { queueEmail } from "../services/emailQueueService";
import { createLogger } from "./logger";

const log = createLogger("support-email");

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Render a plain-text body into escaped HTML paragraphs (blank line = new paragraph). */
function bodyToHtml(body: string): string {
  return body
    .trim()
    .split(/\n{2,}/)
    .map(
      (para) =>
        `<p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 14px;">${escapeHtml(
          para.trim(),
        ).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");
}

export interface SupportEmailInput {
  to: string;
  subject: string;
  /** Free-form plain-text body — blank lines separate paragraphs. */
  body: string;
}

const SUPPORT_NOTE = "You can reply directly to this email and it will reach our team.";

/**
 * Build and queue a branded support email. Throws on a queue failure so the
 * caller (the copilot action) can report it — this is a confirmed send, not a
 * best-effort background email.
 */
export async function sendSupportEmail(input: SupportEmailInput): Promise<void> {
  const html = buildTransactionalEmail({
    recipientEmail: input.to,
    subjectForTitle: input.subject,
    headline: input.subject,
    bodyHtml: bodyToHtml(input.body),
    supportNote: SUPPORT_NOTE,
  });
  const text = buildPlainText({
    headline: input.subject,
    bodyText: input.body.trim(),
    supportNote: SUPPORT_NOTE,
  });
  await queueEmail(input.to, input.subject, html, text, { source: "admin_support_email" });
  log.info(`Support email queued to ${input.to} — "${input.subject}"`);
}

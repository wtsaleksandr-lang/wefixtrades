/**
 * Support ticket transactional emails.
 *
 * Three templates:
 *   1. Ticket created — "We received your request"
 *   2. Ticket reply — "New reply on your ticket"
 *   3. Ticket resolved — "Your ticket has been resolved"
 *
 * All use the transactional shell for consistent branding.
 * Safe-fail: every export catches errors and logs — never throws.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { createLogger } from "./logger";
import { queueEmail } from "../services/emailQueueService";

const log = createLogger("support-ticket-email");

/* ─── Ticket Created ─── */

export interface TicketCreatedData {
  ticketId: number;
  subject: string;
  portalUrl: string;
}

function buildTicketCreatedHtml(recipientEmail: string, data: TicketCreatedData): string {
  const ticketRef = `#${data.ticketId}`;
  return buildTransactionalEmail({
    recipientEmail,
    subjectForTitle: `We received your request — ${ticketRef}`,
    eyebrow: `Ticket ${ticketRef}`,
    headline: "We received your request",
    intro: `Your support ticket "<strong style="color:#F0F0F0;">${escapeHtml(data.subject)}</strong>" has been created. Our team typically responds within a few hours.`,
    bodyHtml: `
      <div style="background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 16px;margin:0 0 6px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td>
              <div style="font-size:11px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Ticket reference</div>
              <div style="font-size:14px;font-weight:600;color:#F0F0F0;">${ticketRef} &mdash; ${escapeHtml(data.subject)}</div>
            </td>
          </tr>
        </table>
      </div>`,
    cta: { label: "View Ticket", url: `${data.portalUrl}/support/${data.ticketId}` },
    pasteLinkFallback: { url: `${data.portalUrl}/support/${data.ticketId}` },
    supportNote: `You can reply directly from your portal or respond to this email. We'll keep you updated at every step.`,
  });
}

/**
 * Send a "ticket created" confirmation to the customer.
 * Never throws.
 */
export async function sendTicketCreatedEmail(
  recipientEmail: string,
  data: TicketCreatedData,
): Promise<boolean> {
  try {
    if (!recipientEmail) { log.warn("No recipient email — skipping ticket created email"); return false; }
    const ticketRef = `#${data.ticketId}`;
    await queueEmail(recipientEmail, `We received your request — ${ticketRef}`, buildTicketCreatedHtml(recipientEmail, data), buildPlainText({ headline: "We received your request", intro: `Your support ticket "${data.subject}" (${ticketRef}) has been created. Our team typically responds within a few hours.`, ctaLabel: "View Ticket", ctaUrl: `${data.portalUrl}/support/${data.ticketId}`, supportNote: "You can reply directly from your portal. We'll keep you updated at every step." }), { source: "support_ticket_created", entity_type: "support_ticket", entity_id: data.ticketId });
    log.info(`Ticket created email queued for ${recipientEmail} — ticket ${ticketRef}`);
    return true;
  } catch (err: any) {
    log.error(`Ticket created email failed for ${recipientEmail}: ${err.message}`);
    return false;
  }
}

/* ─── Ticket Reply ─── */

export interface TicketReplyData {
  ticketId: number;
  subject: string;
  replyPreview: string;
  portalUrl: string;
}

function buildTicketReplyHtml(recipientEmail: string, data: TicketReplyData): string {
  const ticketRef = `#${data.ticketId}`;
  const preview = data.replyPreview.length > 200
    ? data.replyPreview.slice(0, 200) + "..."
    : data.replyPreview;

  return buildTransactionalEmail({
    recipientEmail,
    subjectForTitle: `New reply on ticket ${ticketRef}`,
    eyebrow: `Ticket ${ticketRef}`,
    headline: "New reply on your ticket",
    intro: `Our team has replied to "<strong style="color:#F0F0F0;">${escapeHtml(data.subject)}</strong>".`,
    bodyHtml: `
      <div style="background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px;margin:0 0 6px;">
        <p style="font-size:13px;color:#CDD1D6;line-height:1.6;margin:0;white-space:pre-wrap;">${escapeHtml(preview)}</p>
      </div>`,
    cta: { label: "View Full Reply", url: `${data.portalUrl}/support/${data.ticketId}` },
    pasteLinkFallback: { url: `${data.portalUrl}/support/${data.ticketId}` },
    supportNote: `Reply from your portal to continue the conversation.`,
  });
}

/**
 * Send a "new reply on your ticket" notification to the customer.
 * Only fires for customer-visible admin replies (not internal notes).
 * Never throws.
 */
export async function sendTicketReplyEmail(
  recipientEmail: string,
  data: TicketReplyData,
): Promise<boolean> {
  try {
    if (!recipientEmail) { log.warn("No recipient email — skipping ticket reply email"); return false; }
    const ticketRef = `#${data.ticketId}`;
    await queueEmail(recipientEmail, `New reply on ticket ${ticketRef} — ${data.subject}`, buildTicketReplyHtml(recipientEmail, data), buildPlainText({ headline: "New reply on your ticket", intro: `Our team has replied to "${data.subject}" (${ticketRef}).`, bodyText: data.replyPreview.length > 300 ? data.replyPreview.slice(0, 300) + "..." : data.replyPreview, ctaLabel: "View Full Reply", ctaUrl: `${data.portalUrl}/support/${data.ticketId}`, supportNote: "Reply from your portal to continue the conversation." }), { source: "support_ticket_reply", entity_type: "support_ticket", entity_id: data.ticketId });
    log.info(`Ticket reply email queued for ${recipientEmail} — ticket ${ticketRef}`);
    return true;
  } catch (err: any) {
    log.error(`Ticket reply email failed for ${recipientEmail}: ${err.message}`);
    return false;
  }
}

/* ─── Ticket Resolved ─── */

export interface TicketResolvedData {
  ticketId: number;
  subject: string;
  portalUrl: string;
}

function buildTicketResolvedHtml(recipientEmail: string, data: TicketResolvedData): string {
  const ticketRef = `#${data.ticketId}`;
  return buildTransactionalEmail({
    recipientEmail,
    subjectForTitle: `Ticket ${ticketRef} resolved`,
    eyebrow: `Ticket ${ticketRef}`,
    headline: "Your ticket has been resolved",
    intro: `Your support request "<strong style="color:#F0F0F0;">${escapeHtml(data.subject)}</strong>" has been marked as resolved.`,
    bodyHtml: `
      <div style="background:rgba(102,232,250,0.06);border-left:2px solid #66E8FA;border-radius:4px;padding:12px 14px;margin:0 0 6px;">
        <p style="font-size:13px;color:#CDD1D6;line-height:1.55;margin:0;">
          If this doesn't look right or you need more help, just reply from your portal and we'll reopen the ticket.
        </p>
      </div>`,
    cta: { label: "View Ticket Details", url: `${data.portalUrl}/support/${data.ticketId}` },
    pasteLinkFallback: { url: `${data.portalUrl}/support/${data.ticketId}` },
    supportNote: `Thank you for reaching out. We're always here if you need anything else.`,
  });
}

/**
 * Send a "ticket resolved" notification to the customer.
 * Fires when an admin changes status to "resolved" or "closed".
 * Never throws.
 */
export async function sendTicketResolvedEmail(
  recipientEmail: string,
  data: TicketResolvedData,
): Promise<boolean> {
  try {
    if (!recipientEmail) { log.warn("No recipient email — skipping ticket resolved email"); return false; }
    const ticketRef = `#${data.ticketId}`;
    await queueEmail(recipientEmail, `Ticket ${ticketRef} resolved — ${data.subject}`, buildTicketResolvedHtml(recipientEmail, data), buildPlainText({ headline: "Your ticket has been resolved", intro: `Your support request "${data.subject}" (${ticketRef}) has been marked as resolved.`, bodyText: "If this doesn't look right or you need more help, just reply from your portal and we'll reopen the ticket.", ctaLabel: "View Ticket Details", ctaUrl: `${data.portalUrl}/support/${data.ticketId}`, supportNote: "Thank you for reaching out. We're always here if you need anything else." }), { source: "support_ticket_resolved", entity_type: "support_ticket", entity_id: data.ticketId });
    log.info(`Ticket resolved email queued for ${recipientEmail} — ticket ${ticketRef}`);
    return true;
  } catch (err: any) {
    log.error(`Ticket resolved email failed for ${recipientEmail}: ${err.message}`);
    return false;
  }
}

/* ─── Utilities ─── */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

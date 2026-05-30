/**
 * Shared inbound-email ingestion — the core that turns ONE inbound email into
 * the support-ticket system, independent of HOW the email arrived.
 *
 * Two transports call this:
 *   - the SendGrid Inbound Parse webhook (server/routes/inboundEmailRoutes.ts)
 *   - the IONOS IMAP poller (server/services/inboundEmailImapPoller.ts)
 *
 * Behaviour (unchanged from the original webhook handler):
 *   - dedup by Message-ID,
 *   - match the sender to a client by email (UNVERIFIED — for threading only),
 *   - thread into an existing ticket ONLY when the sender owns the "#<id>"
 *     ticket; otherwise open a new (flagged-if-unverified) ticket,
 *   - hand the ticket to the AI concierge (processInboundEmail), fire-and-forget.
 *
 * Callers are responsible for transport-specific parsing (MIME, multipart) and
 * must pass already-cleaned fields.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { clients, ticketMessages } from "@shared/schema";
import { storage } from "../storage";
import { getOrCreateInternalClientId } from "./inboundClassifier";
import { processInboundEmail } from "./inboundEmailConcierge";
import { createLogger } from "../lib/logger";

const log = createLogger("InboundEmailIngest");

export interface InboundEmailInput {
  /** Bare sender address (lowercased), or null when unparseable. */
  senderEmail: string | null;
  /** Cleaned subject (already capped). */
  subject: string;
  /** Cleaned, quote-stripped body (already capped). */
  content: string;
  /** RFC Message-ID for dedup, or null. */
  messageId: string | null;
}

export interface InboundEmailResult {
  ticketId: number | null;
  isNewTicket: boolean;
  duplicate: boolean;
}

/** Parse a "#<id>" ticket reference from a subject line. */
function extractTicketRef(subject: string): number | null {
  const m = (subject || "").match(/#(\d{1,9})\b/);
  if (!m) return null;
  const id = parseInt(m[1], 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Ingest one already-parsed inbound email. Idempotent on Message-ID. Never
 * throws on the concierge handoff (fire-and-forget); DB errors propagate so
 * the transport can decide whether to retry (the webhook returns 500 → retry).
 */
export async function ingestInboundEmail(input: InboundEmailInput): Promise<InboundEmailResult> {
  const { senderEmail, subject, content, messageId } = input;

  // Dedup — the same message can be delivered twice (SendGrid re-POST, or an
  // IMAP re-fetch before the seen-flag commits).
  if (messageId) {
    const [dupe] = await db
      .select({ id: ticketMessages.id })
      .from(ticketMessages)
      .where(sql`${ticketMessages.metadata}->>'email_message_id' = ${messageId}`)
      .limit(1);
    if (dupe) {
      log.info(`duplicate Message-ID ${messageId} — skipped`);
      return { ticketId: null, isNewTicket: false, duplicate: true };
    }
  }

  // Identity — match the sender to a client (unverified; for ownership only).
  let matchedClientId: number | null = null;
  let matchedUserId: number | null = null;
  if (senderEmail) {
    const [client] = await db
      .select({ id: clients.id, user_id: clients.user_id })
      .from(clients)
      .where(sql`lower(${clients.contact_email}) = ${senderEmail}`)
      .limit(1);
    if (client) {
      matchedClientId = client.id;
      matchedUserId = client.user_id ?? null;
    }
  }

  const msgMeta = {
    inbound: true,
    channel: "email",
    from_email: senderEmail,
    email_message_id: messageId,
    unverified_sender: matchedClientId === null,
  };

  // Threading — honour a "#<id>" only when the sender is matched AND owns it.
  const ref = extractTicketRef(subject);
  let ticketId: number | null = null;
  let isNewTicket = false;

  if (ref && matchedClientId !== null) {
    const existing = await storage.getSupportTicketById(ref);
    if (existing && existing.client_id === matchedClientId) {
      ticketId = existing.id;
      await storage.createTicketMessage({
        ticket_id: ticketId,
        author_id: matchedUserId,
        author_type: "customer",
        visibility: "customer",
        content,
        metadata: msgMeta,
      });
      if (existing.status === "resolved" || existing.status === "closed") {
        await storage.updateSupportTicket(ticketId, { status: "open" });
        await storage.createTicketEvent({
          ticket_id: ticketId,
          actor_id: matchedUserId,
          actor_type: "human",
          action: "reopened",
          old_value: existing.status,
          new_value: "open",
          summary: "Reopened by an inbound email reply",
        });
      } else {
        await storage.createTicketEvent({
          ticket_id: ticketId,
          actor_id: matchedUserId,
          actor_type: "human",
          action: "reply_added",
          summary: "Inbound email reply",
        });
      }
      log.info(`appended reply to ticket #${ticketId}`);
    }
  }

  // No usable ref (or not the sender's ticket) → new ticket.
  if (ticketId === null) {
    const clientId = matchedClientId ?? (await getOrCreateInternalClientId());
    const ticket = await storage.createSupportTicket({
      client_id: clientId,
      subject: matchedClientId === null ? `[Unverified sender] ${subject}` : subject,
      description: content,
      category: "general",
      priority: "normal",
      status: "open",
      source: "inbound_email",
    } as any);
    ticketId = ticket.id;
    isNewTicket = true;

    await storage.createTicketMessage({
      ticket_id: ticketId,
      author_id: matchedUserId,
      author_type: "customer",
      visibility: "customer",
      content,
      metadata: msgMeta,
    });
    await storage.createTicketEvent({
      ticket_id: ticketId,
      actor_id: matchedUserId,
      actor_type: "human",
      action: "created",
      new_value: "open",
      summary: `Ticket opened from inbound email (${senderEmail ?? "unknown sender"})`,
    });
    log.info(`opened ticket #${ticketId} from ${senderEmail ?? "unknown"}`);
  }

  // Hand to the AI concierge: triages (reply / ignore / escalate) and, when the
  // concierge is off, falls back to the plain new-ticket founder alert.
  if (ticketId) void processInboundEmail(ticketId, isNewTicket);

  return { ticketId, isNewTicket, duplicate: false };
}

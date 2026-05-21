/**
 * Inbound email concierge (Phase 3e-ii-b).
 *
 * After inboundEmailRoutes ingests an email into a support ticket, this
 * triages it and acts — in ONE model call:
 *   - reply     → a genuine support question; the concierge writes + sends a
 *                 reply, threaded back to the ticket.
 *   - ignore    → marketing / junk / automated noise; an internal note is
 *                 added, no reply is sent, the founder is NOT pinged.
 *   - uncertain → can't tell, or needs account-specific / human judgment;
 *                 escalated to the founder via notifyFounder().
 *
 * Identity is UNVERIFIED (§7): the concierge answers general/support
 * questions only — never account data, never account-changing actions.
 *
 * Two gates, both required for the AI to engage:
 *   - INBOUND_EMAIL_AI_ENABLED env flag (default off) — the launch switch.
 *   - the email_enabled channel kill switch (3a) — the runtime pause.
 * When the concierge is off, a new inbound ticket still gets the plain
 * new-ticket founder alert, so nothing goes unnoticed.
 *
 * Fire-and-forget + fully safe-fail: never throws.
 */

import { streamChat, getModel } from "./aiService";
import { getAiChannelSettings } from "./aiChannelSettings";
import { aiChannelGateOn } from "./aiChannelGate";
import { notifyFounder } from "./founderNotify";
import { sendSupportEmail } from "../lib/supportEmail";
import { sendAdminNewTicketAlert } from "../lib/supportTicketEmails";
import { logUsage } from "./usageTracker";
import { storage } from "../storage";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { clients, type SupportTicket } from "@shared/schema";
import { createLogger } from "../lib/logger";

const log = createLogger("InboundConcierge");

function portalUrl(): string {
  const base = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  return `${base}/portal`;
}

function adminUrl(ticketId: number): string {
  const base = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  return `${base}/admin/crm/support/${ticketId}`;
}

interface TriageResult {
  decision: "reply" | "ignore" | "uncertain";
  reason: string;
  reply?: string;
}

interface ThreadTurn {
  who: string;
  text: string;
}

/* ─── Prompt ─── */

function buildSystemPrompt(): string {
  return `You are the customer-support concierge for WeFixTrades, a company that sells digital marketing and automation services to trades businesses (plumbers, electricians, roofers, and similar). You are handling an inbound support EMAIL.

The sender's identity is NOT verified — a From header can be forged. You may answer general and "how do I" support questions, but you must NEVER disclose account-specific data (invoices, balances, account status, personal details, which services someone has) and NEVER take or promise account-changing actions. If the email needs account-specific help, your reply should ask them to sign in to their portal at ${portalUrl()}, where their identity is confirmed.

Decide what to do with this email. Respond with ONLY a JSON object — no prose, no code fences:
{"decision":"reply"|"ignore"|"uncertain","reason":"<one short sentence>","reply":"<plain-text email reply — required only when decision is reply>"}

- "reply": a real customer needing help, with a question you can answer well WITHOUT account-specific data. Put a complete, friendly, concise reply in "reply". Do not add a subject line, a greeting like "Hi", or a signature — those are handled automatically.
- "ignore": marketing, cold sales pitches, spam, newsletters, automated or no-reply notifications — anything that is not a real customer needing support. Omit "reply".
- "uncertain": you genuinely cannot tell whether it needs a response, OR it needs account-specific help, OR it needs a human/business decision (refunds, complaints, anything sensitive or contractual). Omit "reply" — the founder will be asked.

Be decisive: most genuine questions are "reply" and most junk is "ignore". Use "uncertain" only when you truly cannot classify it or it clearly needs a human.`;
}

function buildUserMessage(subject: string, thread: ThreadTurn[]): string {
  const lines = [`Email subject: ${subject}`, "", "Conversation so far (oldest first):"];
  for (const turn of thread) {
    lines.push(`--- ${turn.who} ---`, turn.text, "");
  }
  return lines.join("\n");
}

/** Parse the model's triage JSON, tolerating code fences / stray prose. */
function parseTriage(raw: string): TriageResult | null {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1));
    if (obj?.decision === "reply" || obj?.decision === "ignore" || obj?.decision === "uncertain") {
      return {
        decision: obj.decision,
        reason: typeof obj.reason === "string" ? obj.reason : "",
        reply: typeof obj.reply === "string" ? obj.reply : undefined,
      };
    }
  } catch { /* fall through to null */ }
  return null;
}

/** Build the "Re: …" reply subject, ensuring a #<id> tag so replies thread. */
function buildReplySubject(ticketSubject: string, ticketId: number): string {
  let s = ticketSubject
    .replace(/^\[Unverified sender\]\s*/i, "")
    .replace(/\(#\d+\)/g, "")
    .replace(/#\d+/g, "")
    .replace(/^\s*re:\s*/i, "")
    .trim();
  if (!s) s = "your support request";
  return `Re: ${s} (#${ticketId})`;
}

/* ─── Founder alert when the concierge is off ─── */

async function alertFounderPlain(ticket: SupportTicket, senderEmail: string | null): Promise<void> {
  const notified = await sendAdminNewTicketAlert({
    ticketId: ticket.id,
    subject: ticket.subject,
    clientName: senderEmail || "Unknown sender",
    category: ticket.category || "general",
    priority: ticket.priority || "normal",
    description: ticket.description || "",
    source: ticket.source || "inbound_email",
    adminUrl: adminUrl(ticket.id),
  });
  if (notified) {
    await storage.updateSupportTicket(ticket.id, { admin_notified: true }).catch(() => {});
  }
}

/* ─── Escalation ─── */

async function escalate(ticket: SupportTicket, reason: string): Promise<void> {
  await notifyFounder({
    type: "inbound_email_uncertain",
    title: `Inbound email needs your call: "${ticket.subject}"`,
    summary: `The AI wasn't sure how to handle support ticket #${ticket.id}.\n\nReason: ${reason}\n\nOpen the ticket to read the email and reply.`,
    entityType: "support_ticket",
    entityId: ticket.id,
  });
  await storage.createTicketMessage({
    ticket_id: ticket.id,
    author_id: null,
    author_type: "system",
    visibility: "internal",
    content: `AI triage: escalated to the founder — ${reason}`,
    metadata: { ai_generated: true, channel: "email", triage: "uncertain" },
  }).catch(() => {});
}

/* ─── Triage + act ─── */

async function triageAndAct(
  ticket: SupportTicket,
  thread: ThreadTurn[],
  senderEmail: string | null,
): Promise<void> {
  const startMs = Date.now();
  const stream = streamChat({
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: buildUserMessage(ticket.subject, thread) }],
    maxTokens: 1500,
  });
  const msg = await stream.finalMessage();
  const rawText = msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");

  // Cost attribution — the matched client's portal user, when there is one.
  let userId: number | undefined;
  try {
    const [c] = await db
      .select({ user_id: clients.user_id })
      .from(clients)
      .where(eq(clients.id, ticket.client_id))
      .limit(1);
    userId = c?.user_id ?? undefined;
  } catch { /* attribution is best-effort */ }

  logUsage({
    model: getModel(),
    surface: "portal",
    channel: "email",
    provider: "anthropic",
    userId,
    inputTokens: msg.usage?.input_tokens,
    outputTokens: msg.usage?.output_tokens,
    latencyMs: Date.now() - startMs,
    success: true,
  });

  const triage = parseTriage(rawText);
  if (!triage) {
    await escalate(ticket, "The AI could not classify this email.");
    return;
  }

  if (triage.decision === "reply") {
    const body = (triage.reply || "").trim();
    if (!body) {
      await escalate(ticket, "The AI meant to reply but produced no message text.");
      return;
    }
    if (!senderEmail) {
      await escalate(ticket, "The AI wanted to reply but no sender address was found.");
      return;
    }
    await sendSupportEmail({
      to: senderEmail,
      subject: buildReplySubject(ticket.subject, ticket.id),
      body,
    });
    await storage.createTicketMessage({
      ticket_id: ticket.id,
      author_id: null,
      author_type: "admin",
      visibility: "customer",
      content: body,
      metadata: { ai_generated: true, channel: "email" },
    });
    await storage.createTicketEvent({
      ticket_id: ticket.id,
      actor_id: null,
      actor_type: "system",
      action: "reply_added",
      summary: "AI concierge replied to the inbound email",
    });
    if (ticket.status === "open") {
      await storage.updateSupportTicket(ticket.id, { status: "waiting_on_customer" });
    }
    log.info(`[concierge] replied to ticket #${ticket.id}`);
    return;
  }

  if (triage.decision === "ignore") {
    await storage.createTicketMessage({
      ticket_id: ticket.id,
      author_id: null,
      author_type: "system",
      visibility: "internal",
      content: `AI triage: not a support request — ${triage.reason || "marketing / junk"}. No reply sent.`,
      metadata: { ai_generated: true, channel: "email", triage: "ignore" },
    });
    log.info(`[concierge] ticket #${ticket.id} classified as ignore`);
    return;
  }

  // uncertain
  await escalate(ticket, triage.reason || "The AI was not sure how to handle this email.");
}

/* ─── Entry point ─── */

/**
 * Triage and act on a freshly-ingested inbound email. Called fire-and-forget
 * by the inbound webhook. Never throws.
 */
export async function processInboundEmail(ticketId: number, isNewTicket: boolean): Promise<void> {
  let ticket: SupportTicket | undefined;
  try {
    ticket = await storage.getSupportTicketById(ticketId);
  } catch (err) {
    log.error(`[concierge] could not load ticket #${ticketId}`, { error: String(err) });
    return;
  }
  if (!ticket) return;

  try {
    const messages = await storage.listTicketMessages(ticketId, "all");

    // Reply-to address — the most recent inbound customer message's sender.
    let senderEmail: string | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const meta = messages[i].metadata as any;
      if (messages[i].author_type === "customer" && meta?.from_email) {
        senderEmail = String(meta.from_email);
        break;
      }
    }

    const channels = await getAiChannelSettings();
    // W-BA-1: per-channel emergency kill switch must also be ON. Fails CLOSED
    // — if we can't read the gate, we don't respond.
    const channelGateOn = await aiChannelGateOn("email");
    const conciergeActive =
      process.env.INBOUND_EMAIL_AI_ENABLED === "true" &&
      channels.email_enabled &&
      channelGateOn;

    if (!conciergeActive) {
      // AI off — make sure a new inbound ticket still reaches the founder.
      if (isNewTicket) await alertFounderPlain(ticket, senderEmail);
      return;
    }

    // A human owns this ticket — don't let the AI talk over them.
    if (ticket.assigned_to) {
      log.info(`[concierge] ticket #${ticketId} assigned to a human — skipping`);
      return;
    }

    const thread = messages
      .filter((m) => m.visibility === "customer")
      .slice(-10)
      .map<ThreadTurn>((m) => ({
        who: m.author_type === "customer" ? "Customer" : "Support",
        text: m.content,
      }));
    if (thread.length === 0) return;

    try {
      await triageAndAct(ticket, thread, senderEmail);
    } catch (err) {
      log.error(`[concierge] triage failed for #${ticketId} — escalating`, { error: String(err) });
      await escalate(ticket, "The AI hit an error processing this email and needs you to take a look.");
    }
  } catch (err) {
    log.error(`[concierge] processInboundEmail failed for #${ticketId}`, { error: String(err) });
  }
}

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
import { runTextFallbackChain, readyFallbackProviders } from "./llmFallbackChain";
import { getAiChannelSettings } from "./aiChannelSettings";
import { aiChannelGateOn } from "./aiChannelGate";
import { aiGateAllowed } from "./aiSystemGate";
import { notifyFounder } from "./founderNotify";
import { sendSupportEmail } from "../lib/supportEmail";
import { sendAdminNewTicketAlert } from "../lib/supportTicketEmails";
import { logUsage } from "./usageTracker";
import { storage } from "../storage";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { clients, type SupportTicket } from "@shared/schema";
import { createLogger } from "../lib/logger";
import { runAgentLoop, type AgentLoopResult } from "./aiAgentLoop";
import { adminAgentTools } from "./adminAgentTools";
import { getCopilotAction, type PendingAction } from "./copilotActionRegistry";
import { writeAudit } from "../lib/auditLog";
import { noisyCatch } from "../lib/silentFailureGuard";
import { isEmailUnsubscribed } from "../lib/unsubscribeStorage";
import crypto from "crypto";

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

/**
 * Deterministic pre-AI guard: does this look like automated / bulk / no-reply
 * mail that the concierge must NEVER draft a reply to? High-precision on
 * purpose — only patterns that are almost never a real human support request.
 * Catches the obvious cases before any AI call (saves cost + removes the risk
 * of the model "replying" to a mailer-daemon or a newsletter). Genuine spam
 * that slips past this still gets caught by the model's "ignore" triage.
 */
const AUTOMATED_LOCALPARTS = [
  "noreply", "no-reply", "no_reply", "donotreply", "do-not-reply", "do_not_reply",
  "mailer-daemon", "mailerdaemon", "postmaster", "bounce", "bounces",
  "notification", "notifications", "notify", "alert", "alerts", "automated",
  "auto-confirm", "mailer", "newsletter", "news", "updates", "noreply-",
];
const AUTOMATED_SUBJECT_PATTERNS: RegExp[] = [
  /^\s*(out of office|automatic reply|auto[- ]?reply)\b/i,
  /\b(delivery status notification|undeliverable|mail delivery failed|returned mail)\b/i,
  /\bunsubscribe\b/i,
];

export function looksAutomatedSender(senderEmail: string | null, subject: string): boolean {
  if (senderEmail) {
    const addr = senderEmail.toLowerCase();
    const local = addr.split("@")[0] || "";
    if (AUTOMATED_LOCALPARTS.some((p) => local === p || local.startsWith(p))) return true;
    // Catch "...+noreply@" or "bounce+123@" style VERP/automated addresses.
    if (/(^|[.+_-])(noreply|no-reply|bounce|mailer-daemon|postmaster)([.+_-]|$)/.test(local)) return true;
  }
  return AUTOMATED_SUBJECT_PATTERNS.some((re) => re.test(subject || ""));
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
    // Wave 114 — was silent .catch(() => {}); if the admin_notified
    // stamp fails, the next ticket scan can re-fire the notification
    // (admin gets a duplicate). noisyCatch surfaces the write failure.
    await noisyCatch(
      storage.updateSupportTicket(ticket.id, { admin_notified: true }),
      { op: "inboundEmail.stampAdminNotified", meta: { ticketId: ticket.id } },
    );
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
  // Wave 114 — was silent .catch(() => {}); the internal escalation
  // note is the audit trail for "AI escalated this to the founder".
  // Losing it leaves the human with no in-thread record of why the
  // ticket got escalated.
  await noisyCatch(
    storage.createTicketMessage({
      ticket_id: ticket.id,
      author_id: null,
      author_type: "system",
      visibility: "internal",
      content: `AI triage: escalated to the founder — ${reason}`,
      metadata: { ai_generated: true, channel: "email", triage: "uncertain" },
    }),
    { op: "inboundEmail.writeEscalationNote", meta: { ticketId: ticket.id, reason } },
  );
}

/* ─── Triage + act ─── */

async function triageAndAct(
  ticket: SupportTicket,
  thread: ThreadTurn[],
  senderEmail: string | null,
): Promise<void> {
  const startMs = Date.now();

  // Cost attribution — the matched client's portal user, when there is one.
  // Resolved BEFORE the model call so it can attribute the fallback path too.
  let userId: number | undefined;
  try {
    const [c] = await db
      .select({ user_id: clients.user_id })
      .from(clients)
      .where(eq(clients.id, ticket.client_id))
      .limit(1);
    userId = c?.user_id ?? undefined;
  } catch { /* attribution is best-effort */ }

  const aiInput = {
    system: buildSystemPrompt(),
    messages: [{ role: "user" as const, content: buildUserMessage(ticket.subject, thread) }],
    maxTokens: 1500,
  };

  // Primary: Anthropic streaming. On ANY failure (5xx, circuit open, timeout)
  // cascade through the multi-provider fallback chain so a provider outage
  // never silently drops a customer auto-reply. If the WHOLE chain also fails,
  // the throw propagates to processInboundEmail's catch → escalate to founder
  // (the email is never lost). The chain logs its own usage with the real
  // provider; the manual anthropic success log fires only on the primary path.
  let rawText: string;
  try {
    const stream = streamChat(aiInput);
    const msg = await stream.finalMessage();
    rawText = msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
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
  } catch (primaryErr: any) {
    log.warn("concierge primary (anthropic) failed — engaging fallback chain", {
      ticketId: ticket.id,
      providers: readyFallbackProviders(),
      error: primaryErr?.message?.slice(0, 300),
    });
    const result = await runTextFallbackChain({
      ...aiInput,
      surface: "portal",
      channel: "email",
      userId,
    });
    rawText = result.text;
    log.info("concierge served by fallback provider", {
      ticketId: ticket.id,
      provider: result.provider,
      model: result.model,
    });
  }

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

    const replySubject = buildReplySubject(ticket.subject, ticket.id);

    // DRAFT-FOR-REVIEW: store the proposed reply for the founder's approval and
    // notify them — do NOT email the customer yet. The founder sends it from
    // the ticket page (POST .../ai-draft/send) or discards it.
    if (draftModeEnabled()) {
      await storage.createTicketMessage({
        ticket_id: ticket.id,
        author_id: null,
        author_type: "system",
        visibility: "internal",
        content: body,
        metadata: {
          ai_generated: true,
          channel: "email",
          draft: true,
          draft_status: "pending",
          proposed_to: senderEmail,
          proposed_subject: replySubject,
        },
      });
      await storage.createTicketEvent({
        ticket_id: ticket.id,
        actor_id: null,
        actor_type: "system",
        action: "ai_draft_created",
        summary: "AI concierge drafted a reply — awaiting your review",
      });
      await notifyFounder({
        type: "inbound_email_draft",
        title: `Draft reply ready: "${ticket.subject}"`,
        summary: `The AI drafted a reply to ${senderEmail} on ticket #${ticket.id}. Review and send it from the ticket.\n\n--- proposed reply ---\n${body.slice(0, 800)}`,
        entityType: "support_ticket",
        entityId: ticket.id,
      });
      log.info(`[concierge] drafted reply for ticket #${ticket.id} (awaiting review)`);
      return;
    }

    await sendSupportEmail({
      to: senderEmail,
      subject: replySubject,
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

/* ═══════════════════════════════════════════════════════════════════
   W-BA-5: multi-step agent-loop path (Phase 3 step 3e).
   Wires the inbound email path through the BA-0 multi-step loop with
   the BA-3 / BA-4 auto-tier admin tools.  Gated by BA5_AGENT_LOOP_ENABLED.
   ═══════════════════════════════════════════════════════════════════ */

const AGENT_LOOP_MAX_STEPS = 6;       // tighter than BA-0 default of 8 — email is conversational, not investigative
const AGENT_LOOP_COST_CAP_CENTS = 50; // $0.50/email — between BA-0 default $1 and BB-1 customer cap $0.25
const REPLY_TOOL_NAME = "send_support_email_reply";

/** Decide whether the multi-step loop should run. Default ON in non-prod, OFF
 *  in prod, unless the env flag is set explicitly. */
function agentLoopEnabled(): boolean {
  const raw = process.env.BA5_AGENT_LOOP_ENABLED;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return process.env.NODE_ENV !== "production";
}

/**
 * Draft-for-review mode (default ON, safe). When on, the concierge WRITES the
 * reply but stores it as a pending draft for the founder to approve + send,
 * instead of auto-emailing the customer. Flip INBOUND_EMAIL_DRAFT_MODE=false to
 * let it auto-send to clear-cut support questions. While on, the multi-step
 * agent loop is bypassed so every reply flows through the single, interceptable
 * draft path.
 */
export function draftModeEnabled(): boolean {
  return process.env.INBOUND_EMAIL_DRAFT_MODE !== "false";
}

export interface DraftActionResult {
  ok: boolean;
  reason?: string;
}

/** Find the latest pending AI draft on a ticket (not yet sent or discarded). */
async function findPendingDraft(ticketId: number) {
  const messages = await storage.listTicketMessages(ticketId, "all");
  for (let i = messages.length - 1; i >= 0; i--) {
    const meta = messages[i].metadata as any;
    if (meta?.draft === true && meta?.draft_status === "pending") {
      // Already actioned if a later message references this draft id.
      const actioned = messages.some(
        (m) => (m.metadata as any)?.from_draft_message_id === messages[i].id,
      );
      if (actioned) return { draft: null, actioned: true } as const;
      return { draft: messages[i], actioned: false } as const;
    }
  }
  return { draft: null, actioned: false } as const;
}

/**
 * Approve + send a pending AI-drafted reply to the ORIGINAL sender (the draft's
 * stored proposed_to, which for an unverified inbound sender is the real email
 * address — not a client contact record). Double-send guarded. Called by the
 * admin ticket UI / the admin copilot.
 */
export async function sendAiDraft(ticketId: number, byUserId?: number): Promise<DraftActionResult> {
  const { draft, actioned } = await findPendingDraft(ticketId);
  if (actioned) return { ok: false, reason: "draft already sent or discarded" };
  if (!draft) return { ok: false, reason: "no pending draft on this ticket" };
  const meta = draft.metadata as any;
  const to = meta?.proposed_to as string | undefined;
  const subject = (meta?.proposed_subject as string | undefined) || "your support request";
  if (!to) return { ok: false, reason: "draft has no recipient address" };

  await sendSupportEmail({ to, subject, body: draft.content });
  await storage.createTicketMessage({
    ticket_id: ticketId,
    author_id: byUserId ?? null,
    author_type: "admin",
    visibility: "customer",
    content: draft.content,
    metadata: { ai_generated: true, channel: "email", from_draft_message_id: draft.id },
  });
  await storage.createTicketEvent({
    ticket_id: ticketId,
    actor_id: byUserId ?? null,
    actor_type: "human",
    action: "reply_added",
    summary: "Approved + sent the AI-drafted reply",
  });
  const ticket = await storage.getSupportTicketById(ticketId);
  if (ticket?.status === "open") {
    await storage.updateSupportTicket(ticketId, { status: "waiting_on_customer" });
  }
  log.info(`[concierge] AI draft approved + sent for ticket #${ticketId}`);
  return { ok: true };
}

/** Discard a pending AI draft (records an internal note; nothing is sent). */
export async function discardAiDraft(ticketId: number, byUserId?: number): Promise<DraftActionResult> {
  const { draft, actioned } = await findPendingDraft(ticketId);
  if (actioned) return { ok: false, reason: "draft already sent or discarded" };
  if (!draft) return { ok: false, reason: "no pending draft on this ticket" };
  await storage.createTicketMessage({
    ticket_id: ticketId,
    author_id: byUserId ?? null,
    author_type: "system",
    visibility: "internal",
    content: "AI draft discarded by reviewer — no reply sent.",
    metadata: { ai_generated: false, channel: "email", from_draft_message_id: draft.id, draft_discarded: true },
  });
  await storage.createTicketEvent({
    ticket_id: ticketId,
    actor_id: byUserId ?? null,
    actor_type: "human",
    action: "note_added",
    summary: "Discarded the AI-drafted reply",
  });
  log.info(`[concierge] AI draft discarded for ticket #${ticketId}`);
  return { ok: true };
}

/** Build the system prompt for the multi-step loop. Mirrors the
 *  identity-unverified, no-account-data guardrails of the legacy single-call
 *  path, and tells the model which tools it has + when to use the reply tool
 *  vs. let the founder handle it via the draft fallback. */
function buildEmailSystemPrompt(args: {
  ticket: SupportTicket;
  senderEmail: string | null;
  matched: boolean;
}): string {
  const { ticket, senderEmail, matched } = args;
  return `You are the customer-support concierge for WeFixTrades, a company that sells digital marketing and automation services to trades businesses (plumbers, electricians, roofers, and similar). You are handling an inbound support EMAIL.

The sender's identity is NOT verified — a From header can be forged. You may answer general and "how do I" support questions, but you must NEVER disclose account-specific data (invoices, balances, account status, personal details, which services someone has) and NEVER take or promise account-changing actions. If the email needs account-specific help, ask the customer to sign in to their portal at ${portalUrl()}, where their identity is confirmed.

Context for this run:
- Ticket #${ticket.id}: "${ticket.subject}"
- Sender email: ${senderEmail ?? "(unknown)"}
- Sender matched to a known client: ${matched ? "yes" : "no"}

You have three tools available:
- send_support_email_reply: send a customer-visible reply on this ticket. Use this when the email is a real support question you can answer well without account-specific data. Pass ticket_id=${ticket.id} and a plain-text body — no greeting or signature, the email shell adds both. Call at most once.
- notify_admin_of_ticket: flag the ticket for the founder's attention. Use for refunds, complaints, lawsuits, contractual asks, or anything sensitive or account-changing. Pass ticket_id=${ticket.id} and a short reason. Internal only — does not contact the customer.
- send_admin_sms: ignore this tool for email-channel work. Do not call it.

If the email is obvious marketing / spam / automated noise, just say so in plain text and call no tool — the system will record it as ignored and not contact the customer. If you cannot decide, also call no tool and the founder will be looped in via the draft fallback.

Be decisive, brief, and helpful. One tool call per turn. Never invent ticket IDs.`;
}

/** Detect whether the loop actually sent an email (i.e. invoked the reply
 *  tool successfully). Scans the steps list for a non-error tool_result
 *  whose tool was send_support_email_reply. */
function loopSentReply(result: AgentLoopResult): boolean {
  for (const step of result.steps) {
    if (
      step.type === "tool_result" &&
      step.payload?.tool === REPLY_TOOL_NAME &&
      !step.payload?.is_error
    ) {
      // The action either auto-sent OR downgraded to a draft — both come
      // back as a non-error tool_result. Distinguish via the narrative.
      const narrative = String((step.payload?.result as any)?.narrative ?? "");
      if (narrative.startsWith("Sent ")) return true;
    }
  }
  return false;
}

/** Build a ToolExecutor for an `auto`-tier admin action that uses a synthetic
 *  PendingAction whose `user_id` is the matched sender's portal user. Mirrors
 *  the shape of `executorFromCopilotAction()` from aiAgentLoop.ts but does
 *  NOT enforce `ctx.userId` (we pass the user id at executor-build time,
 *  outside the loop's context). */
function buildAdminAutoExecutor(actionName: string, confirmedByUserId: number) {
  return async (args: Record<string, unknown>, ctx: { loopRunId: string; sessionId?: string; stepIndex: number }) => {
    const action = getCopilotAction("admin", actionName);
    if (!action) throw new Error(`Action "${actionName}" not registered on the admin surface`);
    if (action.riskTier !== "auto") {
      throw new Error(`Action "${actionName}" is tier "${action.riskTier}" — must be "auto" to run inside the loop.`);
    }
    const pending: PendingAction = {
      call_id: crypto.randomUUID(),
      surface: "admin",
      action_name: actionName,
      args,
      user_id: confirmedByUserId,
      session_id: ctx.sessionId ?? `loop_${ctx.loopRunId}`,
      expires: Date.now() + 5 * 60 * 1000,
    };
    const result = await action.execute(pending, confirmedByUserId);
    return { ok: true, narrative: result.narrative };
  };
}

/** Triage + act via the BA-0 multi-step loop (W-BA-5). */
async function triageAndActViaLoop(args: {
  ticket: SupportTicket;
  thread: ThreadTurn[];
  senderEmail: string | null;
  matchedClientId: number | null;
  matchedUserId: number | null;
}): Promise<void> {
  const { ticket, thread, senderEmail, matchedClientId, matchedUserId } = args;

  // The admin actions (send_support_email_reply) write a ticket message with
  // author_id = confirmedByUserId, which references users.id. Use the matched
  // sender's portal user id when we have one; fall back to the legacy single-
  // call path when we don't (legacy writes author_id = null, which is the
  // pre-existing concierge contract for unverified senders).
  if (matchedUserId == null) {
    log.info(`[concierge] ticket #${ticket.id} — no matched user for loop path; using legacy single-call`);
    await triageAndAct(ticket, thread, senderEmail);
    return;
  }

  const sessionId = `inbound_email_${ticket.id}_${crypto.randomUUID().slice(0, 8)}`;
  const conversationHistory = thread.map((t) => ({
    role: (t.who === "Customer" ? "user" : "assistant") as "user" | "assistant",
    content: t.text,
  }));
  // The loop expects the conversation to end on a `user` message. If the
  // latest thread turn is from Support, append a brief synthetic prompt so
  // the model has something to reason against.
  if (
    conversationHistory.length === 0 ||
    conversationHistory[conversationHistory.length - 1].role !== "user"
  ) {
    conversationHistory.push({
      role: "user",
      content: "(awaiting the customer's next message — handle this thread)",
    });
  }

  const toolExecutors: Record<string, ReturnType<typeof buildAdminAutoExecutor>> = {
    send_support_email_reply: buildAdminAutoExecutor("send_support_email_reply", matchedUserId),
    notify_admin_of_ticket: buildAdminAutoExecutor("notify_admin_of_ticket", matchedUserId),
    send_admin_sms: buildAdminAutoExecutor("send_admin_sms", matchedUserId),
  };

  let result: AgentLoopResult;
  try {
    result = await runAgentLoop({
      systemPrompt: buildEmailSystemPrompt({
        ticket,
        senderEmail,
        matched: matchedClientId != null,
      }),
      conversationHistory,
      tools: adminAgentTools as any,
      toolExecutors,
      surface: "portal",
      actionSurface: "admin",
      userId: matchedUserId,
      clientId: matchedClientId ?? undefined,
      sessionId,
      maxSteps: AGENT_LOOP_MAX_STEPS,
      costCapCents: AGENT_LOOP_COST_CAP_CENTS,
    });
  } catch (err: any) {
    log.error(`[concierge] agent loop failed for ticket #${ticket.id}`, { error: String(err?.message ?? err) });
    await escalate(ticket, "The AI hit an error running the multi-step loop and needs you to take a look.");
    return;
  }

  if (loopSentReply(result)) {
    log.info(`[concierge] ticket #${ticket.id} replied via agent loop`, {
      steps: result.steps.length,
      costCents: result.totalCostCents,
      loopRunId: result.loopRunId,
    });
    return;
  }

  // Loop ended without sending — record a draft in audit_log so the admin
  // sees it in the inbox, and do NOT send anything customer-facing.
  await writeAudit({
    actorId: String(matchedUserId),
    actorType: "system",
    action: "ai_drafted_inbound_reply",
    entityType: "support_ticket",
    entityId: String(ticket.id),
    metadata: {
      ticket_id: ticket.id,
      client_id: ticket.client_id,
      sender_email: senderEmail,
      subject: ticket.subject,
      loop_run_id: result.loopRunId,
      loop_status: result.status,
      total_cost_cents: result.totalCostCents,
      step_count: result.steps.length,
      reply_text: result.reply || null,
      reason: result.errorMessage || `loop ended without calling ${REPLY_TOOL_NAME}`,
      session_id: sessionId,
    },
  });

  log.info(`[concierge] ticket #${ticket.id} drafted via agent loop (no reply sent)`, {
    status: result.status,
    costCents: result.totalCostCents,
    loopRunId: result.loopRunId,
  });
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

    // Deterministic guard: never draft/reply to automated, bulk, or no-reply
    // mail (mailer-daemon, newsletters, delivery-status, auto-replies). File a
    // note and stop BEFORE any AI call — no reply, no founder ping (it's noise).
    if (looksAutomatedSender(senderEmail, ticket.subject)) {
      log.info(`[concierge] ticket #${ticketId} — automated/bulk sender, no reply`, { senderEmail });
      await noisyCatch(
        storage.createTicketMessage({
          ticket_id: ticketId,
          author_type: "system",
          visibility: "internal",
          content: `AI triage: skipped — sender looks automated/bulk (${senderEmail ?? "unknown"}); no reply sent.`,
          metadata: { ai_generated: true, channel: "email", triage: "automated_skip" },
        }),
        { op: "inboundEmail.automatedSkipNote", meta: { ticketId } },
      );
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

    // W-BA-5: when the multi-step loop is enabled, gate AX-1 (system-wide AI
    // kill switch) + AX-2 (per-sender unsubscribe) BEFORE the loop is
    // started, so a tripped gate or unsubscribed sender never reaches the
    // model. AX-1 is also re-checked inside the loop between steps; this
    // pre-check just fails fast.
    // Draft-mode forces the single-call path so every reply funnels through the
    // one interceptable draft point (the loop's reply tool would auto-send).
    const useAgentLoop = agentLoopEnabled() && !draftModeEnabled();
    if (useAgentLoop) {
      const gate = await aiGateAllowed("portal").catch(() => ({ allowed: false, reason: "gate read failed" }));
      if (!gate.allowed) {
        log.info(`[concierge] ticket #${ticketId} — AX-1 system gate blocked (${gate.reason ?? "unknown"})`);
        if (isNewTicket) await alertFounderPlain(ticket, senderEmail);
        return;
      }
      if (senderEmail) {
        const unsubscribed = await isEmailUnsubscribed(senderEmail).catch(() => false);
        if (unsubscribed) {
          log.info(`[concierge] ticket #${ticketId} — sender ${senderEmail} is unsubscribed; skipping AI reply`);
          if (isNewTicket) await alertFounderPlain(ticket, senderEmail);
          return;
        }
      }
    }

    // Resolve the matched portal user for the sender so the loop's tool
    // executors have a real `confirmedByUserId` to write tickets / audit
    // rows against. Best-effort — falls back to the legacy single-call path
    // when no user match exists (see triageAndActViaLoop()).
    let matchedClientId: number | null = ticket.client_id ?? null;
    let matchedUserId: number | null = null;
    try {
      const [c] = await db
        .select({ user_id: clients.user_id })
        .from(clients)
        .where(eq(clients.id, ticket.client_id))
        .limit(1);
      matchedUserId = c?.user_id ?? null;
    } catch { /* best-effort — falls back to legacy below */ }

    try {
      if (useAgentLoop) {
        await triageAndActViaLoop({
          ticket,
          thread,
          senderEmail,
          matchedClientId,
          matchedUserId,
        });
      } else {
        await triageAndAct(ticket, thread, senderEmail);
      }
    } catch (err) {
      log.error(`[concierge] triage failed for #${ticketId} — escalating`, { error: String(err) });
      await escalate(ticket, "The AI hit an error processing this email and needs you to take a look.");
    }
  } catch (err) {
    log.error(`[concierge] processInboundEmail failed for #${ticketId}`, { error: String(err) });
  }
}

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
    const useAgentLoop = agentLoopEnabled();
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

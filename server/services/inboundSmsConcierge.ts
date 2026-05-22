/**
 * Inbound SMS concierge (Phase 3 step 3f — W-BA-6).
 *
 * Mirrors the BA-5 inbound-EMAIL concierge: takes a fresh inbound SMS that
 * has already been matched to a `lead` + persisted via storeSmsMessage() and
 * routes it through the BA-0 multi-step agent loop with the BA-3 / BA-4
 * admin auto-tier tools.
 *
 * Channel-specific knobs vs. BA-5:
 *   - cost cap:   30¢ (BA-5 = 50¢)   — SMS conversations are tighter and
 *                                       per-segment cost is real money
 *   - max steps:  5    (BA-5 = 6)    — SMS conversations should resolve
 *                                       faster than email
 *
 * Behavioural contract mirrors BA-5 exactly:
 *   - Caller is responsible for gating (system gate + channel gate +
 *     STOP/opt-out) BEFORE calling this — we don't re-check those here.
 *   - When the sender's phone has no portal-user match, we return
 *     `{ handled: false }` so the caller can fall back to the legacy
 *     single-call path.
 *   - On loop completion:
 *       * send_admin_sms called and sent      → log success
 *       * send_admin_sms called but downgraded → BA-4 already wrote
 *         `ai_drafted_admin_sms` to audit_log; we log success
 *       * loop ended without a reply tool     → write
 *         `ai_drafted_inbound_sms_reply` audit row, no send
 *       * loop_limit_exceeded / cost_cap_exceeded / gate_blocked / error →
 *         write `ai_drafted_inbound_sms_reply` with reason, no send
 *
 * Env flag: BA6_AGENT_LOOP_ENABLED — default ON in non-prod, OFF in prod.
 */

import crypto from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { supportTickets } from "@shared/schemas/db";
import { runAgentLoop, type AgentLoopResult } from "./aiAgentLoop";
import { adminAgentTools } from "./adminAgentTools";
import { getCopilotAction, type PendingAction } from "./copilotActionRegistry";
import { writeAudit } from "../lib/auditLog";
import { createLogger } from "../lib/logger";
import type { Lead, Calculator } from "@shared/schemas/db";

const log = createLogger("InboundSmsConcierge");

const AGENT_LOOP_MAX_STEPS = 5;        // tighter than BA-5's 6 — SMS resolves faster
const AGENT_LOOP_COST_CAP_CENTS = 30;  // $0.30/SMS run — below BA-5's 50¢ because Twilio per-segment cost is real
const REPLY_TOOL_NAME = "send_admin_sms";

/** Decide whether the multi-step loop should run. Default ON in non-prod,
 *  OFF in prod, unless the env flag is set explicitly. */
export function agentLoopEnabledBA6(): boolean {
  const raw = process.env.BA6_AGENT_LOOP_ENABLED;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return process.env.NODE_ENV !== "production";
}

/* ─── Local helper (copied from BA-5 — keep BA-5 untouched) ───
 *
 * Builds a ToolExecutor for an `auto`-tier admin action that uses a
 * synthetic PendingAction whose `user_id` is the matched sender's portal
 * user. Mirrors the shape of `executorFromCopilotAction()` from aiAgentLoop.ts
 * but does NOT enforce ctx.userId (we pass the user id at executor-build
 * time, outside the loop's context). */
function buildAdminAutoExecutor(actionName: string, confirmedByUserId: number) {
  return async (
    args: Record<string, unknown>,
    ctx: { loopRunId: string; sessionId?: string; stepIndex: number },
  ) => {
    const action = getCopilotAction("admin", actionName);
    if (!action) throw new Error(`Action "${actionName}" not registered on the admin surface`);
    if (action.riskTier !== "auto") {
      throw new Error(
        `Action "${actionName}" is tier "${action.riskTier}" — must be "auto" to run inside the loop.`,
      );
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

/** Scan the loop's step list for a successful send_admin_sms invocation.
 *  The action returns a non-error tool_result for BOTH the auto-send path
 *  and the draft-downgrade path; distinguish via the narrative. */
function loopSentSms(result: AgentLoopResult): boolean {
  for (const step of result.steps) {
    if (
      step.type === "tool_result" &&
      step.payload?.tool === REPLY_TOOL_NAME &&
      !step.payload?.is_error
    ) {
      const narrative = String((step.payload?.result as any)?.narrative ?? "");
      // The BA-4 action prefixes successful sends with "Sent an AI-assisted SMS …".
      // A downgrade narrative starts with "I drafted an SMS reply …".
      if (narrative.startsWith("Sent ")) return true;
    }
  }
  return false;
}

/** Scan the loop's step list for ANY call (success or downgrade) to the SMS
 *  reply tool. Used to decide whether BA-4 already wrote a draft to audit_log
 *  (in which case we DON'T double-write one). */
function loopCalledSmsTool(result: AgentLoopResult): boolean {
  for (const step of result.steps) {
    if (
      step.type === "tool_result" &&
      step.payload?.tool === REPLY_TOOL_NAME &&
      !step.payload?.is_error
    ) {
      return true;
    }
  }
  return false;
}

/* ─── Prompt ─── */

function buildSmsSystemPrompt(args: {
  ticketId: number;
  senderPhone: string;
  businessName: string;
}): string {
  const { ticketId, senderPhone, businessName } = args;
  return `You are the customer-support concierge for ${businessName}, a trades business on the WeFixTrades platform. You are handling an inbound customer SMS.

The sender's identity is NOT verified — phone numbers can be spoofed. You may help with general "how do I" / scheduling / quote-follow-up questions, but you must NEVER disclose account-specific data (invoice amounts, balance, contract terms, personal details) and NEVER take or promise account-changing actions. If the SMS needs account-specific help, ask the customer to contact the business by phone or email.

Context for this run:
- Support ticket #${ticketId} (auto-opened for this SMS thread)
- Sender phone: ${senderPhone}

You have these tools available:
- send_admin_sms: send a customer-visible SMS reply on this ticket via Twilio. Use this when the SMS is a real question you can answer well in under ~250 characters without account-specific data. Pass ticket_id=${ticketId} and a plain-text body — no signature, the SMS layer appends one. Call at most once. Keep it short; SMS segments cost money.
- notify_admin_of_ticket: flag the ticket for the business owner's attention. Use for refunds, complaints, complex scheduling, or anything sensitive. Pass ticket_id=${ticketId} and a short reason. Internal only — does not contact the customer.
- send_support_email_reply: ignore for SMS-channel work. Do not call it.

If the SMS is obvious spam / wrong-number / one-word noise, just say so in plain text and call no tool — the system will record it and not contact the customer. If you cannot decide, also call no tool and the founder will be looped in via the draft fallback.

Be decisive, brief (one or two short sentences), and helpful. One tool call per turn. Never invent ticket IDs.`;
}

/* ─── Ticket resolution ─── */

/** Find an open support ticket on this calculator OR create a fresh one so
 *  send_admin_sms has somewhere to anchor its admission checks. Returns the
 *  ticket_id we will pass into the loop. Best-effort — throws on DB failure. */
async function findOrCreateConversationTicket(args: {
  lead: Lead;
  calculator: Calculator;
  clientId: number;
  senderPhone: string;
  body: string;
}): Promise<number> {
  const { lead, calculator, clientId, senderPhone, body } = args;

  // Look for the most-recent open / waiting ticket on this calculator+client
  // that was auto-opened for an inbound SMS conversation (source flag).
  try {
    const rows = await db
      .select({ id: supportTickets.id, status: supportTickets.status })
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.calculator_id, calculator.id),
          eq(supportTickets.client_id, clientId),
          eq(supportTickets.source, "ai_escalation"),
        ),
      )
      .orderBy(desc(supportTickets.created_at))
      .limit(5);
    const reusable = rows.find(
      (r) => r.status !== "resolved" && r.status !== "closed",
    );
    if (reusable) return reusable.id;
  } catch (err: any) {
    log.warn("ticket reuse lookup failed — will create fresh", { error: err?.message });
  }

  const subject = `[Auto] Inbound SMS from ${senderPhone} — ${calculator.business_name}`;
  const description = [
    `Channel:  sms`,
    `From:     ${senderPhone}`,
    `Lead ID:  ${lead.id}`,
    `Calc:     ${calculator.business_name} (#${calculator.id})`,
    "",
    "Initial message:",
    body.slice(0, 4000),
  ].join("\n");

  const ticket = await storage.createSupportTicket({
    calculator_id: calculator.id,
    client_id: clientId,
    subject,
    description,
    category: "service",
    priority: "normal",
    status: "open",
    source: "ai_escalation",
  } as any);

  return ticket.id;
}

/* ─── Public entry ─── */

export interface ProcessInboundSmsInput {
  lead: Lead;
  calculator: Calculator;
  senderPhone: string;
  body: string;
  /** Last few SMS turns on this thread (oldest → newest), for the loop's
   *  conversationHistory. The most recent turn should be the inbound message
   *  this call is reacting to. */
  thread: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface ProcessInboundSmsResult {
  /** True iff the loop took ownership of the reply (either sent via the tool
   *  or wrote a draft). False means the caller should fall back to the legacy
   *  single-call path. */
  handled: boolean;
  /** Optional outbound reply text — populated only when the loop ended in a
   *  text response with no tool call (rare). Caller MAY send this; in practice
   *  we leave it unset and let the loop's tool drive sends. */
  reply?: string;
}

/**
 * Run the BA-6 multi-step loop for one inbound SMS. The caller MUST have
 * already:
 *   - verified the Twilio signature
 *   - checked the AI system gate (aiGateAllowed) + sms channel gate
 *     (aiChannelGateOn("sms"))
 *   - checked the STOP / opt-out / blacklist state
 *   - persisted the inbound SMS via storeSmsMessage()
 *
 * Never throws — returns { handled: false } on any error so the caller can
 * fall back to its legacy path.
 */
export async function processInboundSmsViaLoop(
  input: ProcessInboundSmsInput,
): Promise<ProcessInboundSmsResult> {
  const { lead, calculator, senderPhone, body, thread } = input;

  try {
    // 1. Resolve the calculator owner's client + portal user. send_admin_sms
    //    writes ticket events keyed on confirmedByUserId, so we need a real
    //    portal user id. No user_id → caller falls back to legacy path.
    if (!calculator.user_id) {
      log.info("no calculator.user_id — falling back to legacy", { calcId: calculator.id });
      return { handled: false };
    }
    let client = await storage.findClientByUserId(calculator.user_id);
    if (!client || !client.user_id) {
      log.info("no client / user_id for calculator owner — falling back to legacy", {
        calcId: calculator.id,
      });
      return { handled: false };
    }

    // Sanity: the cost-attribution + tool-executor confirmedByUserId is the
    // CALCULATOR OWNER's portal user (the trade business), not the sender.
    // That mirrors BA-5, where author_id on ticket messages is the matched
    // portal user. The sender's identity stays UNVERIFIED end-to-end.
    const confirmedByUserId = client.user_id;
    const clientId = client.id;

    // 2. Find-or-create a support ticket on this calculator so send_admin_sms
    //    admission checks (which look up getSmsThreads(ticket.calculator_id))
    //    can find the existing thread.
    let ticketId: number;
    try {
      ticketId = await findOrCreateConversationTicket({
        lead,
        calculator,
        clientId,
        senderPhone,
        body,
      });
    } catch (err: any) {
      log.error("findOrCreateConversationTicket failed — falling back to legacy", {
        calcId: calculator.id,
        error: err?.message,
      });
      return { handled: false };
    }

    // 3. Build conversation history. The loop wants it to end on a `user`
    //    turn; if it doesn't, append a synthetic prompt so the model has
    //    something to reason against (matches BA-5's pattern).
    const conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [...thread];
    if (
      conversationHistory.length === 0 ||
      conversationHistory[conversationHistory.length - 1].role !== "user"
    ) {
      conversationHistory.push({
        role: "user",
        content: body,
      });
    }

    const sessionId = `inbound_sms_${ticketId}_${crypto.randomUUID().slice(0, 8)}`;

    const toolExecutors: Record<string, ReturnType<typeof buildAdminAutoExecutor>> = {
      send_admin_sms: buildAdminAutoExecutor("send_admin_sms", confirmedByUserId),
      notify_admin_of_ticket: buildAdminAutoExecutor("notify_admin_of_ticket", confirmedByUserId),
      send_support_email_reply: buildAdminAutoExecutor("send_support_email_reply", confirmedByUserId),
    };

    // 4. Run the loop.
    let result: AgentLoopResult;
    try {
      result = await runAgentLoop({
        systemPrompt: buildSmsSystemPrompt({
          ticketId,
          senderPhone,
          businessName: calculator.business_name,
        }),
        conversationHistory,
        tools: adminAgentTools as any,
        toolExecutors,
        surface: "portal",
        actionSurface: "admin",
        userId: confirmedByUserId,
        clientId,
        sessionId,
        maxSteps: AGENT_LOOP_MAX_STEPS,
        costCapCents: AGENT_LOOP_COST_CAP_CENTS,
      });
    } catch (err: any) {
      log.error("agent loop threw — writing draft and yielding ownership", {
        ticketId,
        error: String(err?.message ?? err),
      });
      await writeAudit({
        actorId: String(confirmedByUserId),
        actorType: "system",
        action: "ai_drafted_inbound_sms_reply",
        entityType: "support_ticket",
        entityId: String(ticketId),
        metadata: {
          ticket_id: ticketId,
          client_id: clientId,
          sender_phone: senderPhone,
          channel: "sms",
          calculator_id: calculator.id,
          lead_id: lead.id,
          loop_status: "error",
          reason: `loop threw: ${String(err?.message ?? err)}`,
          session_id: sessionId,
        },
      }).catch(() => {});
      // Loop crashed — DON'T claim ownership; the caller's legacy path can try.
      return { handled: false };
    }

    // 5. Branch on outcome.
    if (loopSentSms(result)) {
      log.info("inbound SMS replied via agent loop", {
        ticketId,
        steps: result.steps.length,
        costCents: result.totalCostCents,
        loopRunId: result.loopRunId,
      });
      return { handled: true };
    }

    if (loopCalledSmsTool(result)) {
      // The send_admin_sms tool was called but downgraded to a draft — BA-4
      // already wrote an `ai_drafted_admin_sms` row. Don't double-write.
      log.info("inbound SMS downgraded to draft via send_admin_sms", {
        ticketId,
        loopRunId: result.loopRunId,
      });
      return { handled: true };
    }

    // No reply tool was called. Write `ai_drafted_inbound_sms_reply` with the
    // loop's final state + reason, and claim ownership so the caller does not
    // also fire a single-call reply.
    await writeAudit({
      actorId: String(confirmedByUserId),
      actorType: "system",
      action: "ai_drafted_inbound_sms_reply",
      entityType: "support_ticket",
      entityId: String(ticketId),
      metadata: {
        ticket_id: ticketId,
        client_id: clientId,
        sender_phone: senderPhone,
        channel: "sms",
        calculator_id: calculator.id,
        lead_id: lead.id,
        loop_run_id: result.loopRunId,
        loop_status: result.status,
        total_cost_cents: result.totalCostCents,
        step_count: result.steps.length,
        reply_text: result.reply || null,
        reason: result.errorMessage || `loop ended without calling ${REPLY_TOOL_NAME}`,
        session_id: sessionId,
      },
    }).catch(() => {});

    log.info("inbound SMS drafted via agent loop (no reply sent)", {
      ticketId,
      status: result.status,
      costCents: result.totalCostCents,
      loopRunId: result.loopRunId,
    });
    return { handled: true };
  } catch (err: any) {
    // Defensive — never let this concierge throw out of the webhook.
    log.error("processInboundSmsViaLoop unhandled error — falling back to legacy", {
      error: String(err?.message ?? err),
    });
    return { handled: false };
  }
}


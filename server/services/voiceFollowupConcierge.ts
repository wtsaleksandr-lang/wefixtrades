/**
 * Vapi voice-call follow-up concierge (Phase 3 step 3h — W-BA-8).
 *
 * Mirrors the BA-5 (email) / BA-6 (SMS) inbound concierges: when a TradeLine
 * Vapi call ends, route the post-call follow-up generation through the BA-0
 * multi-step agent loop with the BA-3 / BA-4 admin auto-tier tools. Lets the
 * model reason across multiple steps (text the caller, email a quote summary,
 * notify the business owner) instead of single-shot.
 *
 * Channel-specific knobs:
 *   - cost cap:   40¢ — between BA-5 (email, 50¢) and BA-6 (SMS, 30¢); voice
 *                       follow-ups can touch BOTH channels
 *   - max steps:  5   — same as BA-6; the model should resolve quickly
 *
 * Pre-loop gates (caller — vapiRoutes — owns them):
 *   - AX-1 system gate (aiGateAllowed)
 *   - voice channel gate (aiChannelGateOn("voice"))
 *   - per-client cost band (over_cap → skip)
 *   - voice follow-up opt-out signal (config.notifications.outboundSmsEnabled
 *     !== false — pre-existing TradeLine signal for outbound caller contact)
 *
 * Anonymous callers (no resolved TradeLine client) → caller skips this and
 * uses the legacy single-call wft sales-line path.
 *
 * Outcome routing (mirrors BA-5/BA-6):
 *   - Loop CALLED a reply tool successfully           → log success, no draft
 *   - Loop CALLED a reply tool but downgraded         → BA-3/BA-4 already wrote
 *                                                       their own draft row;
 *                                                       log success, no double-
 *                                                       write
 *   - Loop ended on plain text with no tool           → write
 *                                                       `ai_drafted_voice_followup`
 *                                                       audit row, send nothing
 *   - loop_limit_exceeded / cost_cap_exceeded /
 *     gate_blocked / error                            → write
 *                                                       `ai_drafted_voice_followup`
 *                                                       audit row with reason
 *
 * Env flag: BA8_AGENT_LOOP_ENABLED — default ON in non-prod, OFF in prod.
 *
 * NEVER throws — returns `{ handled: false }` so the caller can fall back to
 * the legacy single-call notification dispatch.
 */

import crypto from "crypto";
import { runAgentLoop, type AgentLoopResult } from "./aiAgentLoop";
import { adminAgentTools } from "./adminAgentTools";
import { getCopilotAction, type PendingAction } from "./copilotActionRegistry";
import { writeAudit } from "../lib/auditLog";
import { createLogger } from "../lib/logger";
import { storage } from "../storage";
import type { Client } from "@shared/schema";
import type { TradelineLeadData } from "@shared/schemas/adminCrm";
import type { VapiCallReport } from "./vapiService";

const log = createLogger("VoiceFollowupConcierge");

const AGENT_LOOP_MAX_STEPS = 5;        // same as BA-6 — voice follow-ups should resolve quickly
const AGENT_LOOP_COST_CAP_CENTS = 40;  // between BA-5 email 50¢ and BA-6 sms 30¢
const EMAIL_REPLY_TOOL = "send_support_email_reply";
const SMS_REPLY_TOOL = "send_admin_sms";
const NOTIFY_ADMIN_TOOL = "notify_admin_of_ticket";

/** Voice transcripts can be very long. To avoid blowing the model's context
 *  budget, when >4000 chars keep the first/last 1500 and replace the middle
 *  with a single placeholder. */
const TRANSCRIPT_FULL_LIMIT = 4000;
const TRANSCRIPT_EDGE_CHARS = 1500;

/** Decide whether the multi-step loop should run. Default ON in non-prod,
 *  OFF in prod, unless the env flag is set explicitly. */
export function agentLoopEnabledBA8(): boolean {
  const raw = process.env.BA8_AGENT_LOOP_ENABLED;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return process.env.NODE_ENV !== "production";
}

/** Truncate a transcript to keep the loop's context budget bounded. */
export function truncateTranscript(transcript: string): string {
  if (transcript.length <= TRANSCRIPT_FULL_LIMIT) return transcript;
  const head = transcript.slice(0, TRANSCRIPT_EDGE_CHARS);
  const tail = transcript.slice(-TRANSCRIPT_EDGE_CHARS);
  const omitted = transcript.length - TRANSCRIPT_EDGE_CHARS * 2;
  return `${head}\n\n[... ${omitted} chars omitted ...]\n\n${tail}`;
}

/* ─── Local helper (copied from BA-5 / BA-6 — keep them untouched) ───
 *
 * Builds a ToolExecutor for an `auto`-tier admin action that uses a
 * synthetic PendingAction whose `user_id` is the matched client's portal
 * user. Mirrors the shape of `executorFromCopilotAction()` from
 * aiAgentLoop.ts but does NOT enforce ctx.userId (we pass the user id at
 * executor-build time, outside the loop's context). */
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

/** Did the loop successfully send via any reply tool? Mirrors BA-5/BA-6:
 *  successful sends begin with "Sent " in the narrative; downgrades to a
 *  draft begin with a different prefix. */
function loopSentReply(result: AgentLoopResult): boolean {
  for (const step of result.steps) {
    if (
      step.type === "tool_result" &&
      (step.payload?.tool === EMAIL_REPLY_TOOL ||
        step.payload?.tool === SMS_REPLY_TOOL) &&
      !step.payload?.is_error
    ) {
      const narrative = String((step.payload?.result as any)?.narrative ?? "");
      if (narrative.startsWith("Sent ")) return true;
    }
  }
  return false;
}

/** Did the loop call any reply tool (success OR downgrade) — the BA-3/BA-4
 *  actions already write their own draft rows on downgrade, so we DON'T
 *  double-write here. */
function loopCalledAnyReplyTool(result: AgentLoopResult): boolean {
  for (const step of result.steps) {
    if (
      step.type === "tool_result" &&
      (step.payload?.tool === EMAIL_REPLY_TOOL ||
        step.payload?.tool === SMS_REPLY_TOOL) &&
      !step.payload?.is_error
    ) {
      return true;
    }
  }
  return false;
}

/* ─── Prompt ─── */

function buildVoiceFollowupSystemPrompt(args: {
  ticketId: number;
  businessName: string;
  callerName: string;
  callerPhone: string;
  callerEmail: string | null;
  jobType: string;
  urgency: string;
  summary: string;
}): string {
  const { ticketId, businessName, callerName, callerPhone, callerEmail, jobType, urgency, summary } = args;
  const emailAvailable = !!callerEmail;
  return `You are the post-call follow-up concierge for ${businessName}, a trades business on the WeFixTrades platform. A phone call with a prospective customer just ended and you are responsible for following up.

The caller's identity is NOT verified — phone numbers and addresses given on a call can be wrong. You may send a confirmation / quote-summary / next-step message, but you must NEVER disclose account-specific data (invoice amounts, balances, contract terms) and NEVER promise account-changing actions. Stick to what was said on the call.

Context for this follow-up:
- Support ticket #${ticketId} (auto-opened for this call)
- Caller name:   ${callerName}
- Caller phone:  ${callerPhone}
- Caller email:  ${callerEmail ?? "(not captured)"}
- Job type:      ${jobType}
- Urgency:       ${urgency}
- Call summary:  ${summary}

You have these tools available — pick the ones that make sense, ONE TOOL CALL PER TURN:
- ${SMS_REPLY_TOOL}: text the caller's phone with a short confirmation or next-step message (e.g. "Hi ${callerName}, thanks for calling ${businessName} — confirming we'll be in touch about ${jobType} today."). Pass ticket_id=${ticketId} and a body under ~250 characters. Use this when there's something useful to send the caller now.
- ${EMAIL_REPLY_TOOL}: ${emailAvailable
    ? `email the caller a longer quote summary or next-step details. Pass ticket_id=${ticketId} and a plain-text body — no greeting or signature, the email shell adds both.`
    : `IGNORE — caller didn't give an email address. Do not call this tool.`}
- ${NOTIFY_ADMIN_TOOL}: flag the ticket for the business owner's attention. Use for urgent / complex / sensitive calls that need a human callback. Pass ticket_id=${ticketId} and a short reason. Internal only — does not contact the caller.

If the call was junk / wrong-number / hang-up / nothing actionable, just say so in plain text and call no tool — the system will record it and not contact the caller. If you cannot decide, also call no tool and the business owner will be looped in via the draft fallback.

Be decisive, brief, helpful. Never invent ticket IDs. Never make promises beyond what the call covered.`;
}

/* ─── Initial-message helper ─── */

function buildInitialUserMessage(args: {
  leadData: TradelineLeadData;
  summary: string;
  transcript: string;
}): string {
  const { leadData, summary, transcript } = args;
  const lines: string[] = [
    "A phone call just ended. Decide what follow-up (if any) to send.",
    "",
    "Captured fields:",
    `- caller_name:        ${leadData.caller_name ?? "(unknown)"}`,
    `- caller_phone:       ${leadData.caller_phone ?? "(unknown)"}`,
    `- caller_address:     ${leadData.caller_address ?? "(not captured)"}`,
    `- job_type:           ${leadData.job_type ?? "(unknown)"}`,
    `- urgency:            ${leadData.urgency ?? "(unknown)"}`,
    `- job_description:    ${leadData.job_description ?? "(not captured)"}`,
    `- preferred_date:     ${leadData.preferred_date ?? "(not captured)"}`,
    "",
    `Call summary: ${summary || "(none)"}`,
    "",
    "Transcript (possibly truncated):",
    truncateTranscript(transcript),
  ];
  return lines.join("\n");
}

/* ─── Ticket resolution ─── */

/** Find or create a support ticket so send_admin_sms / send_support_email_reply
 *  admission checks can find an anchor. */
async function findOrCreateFollowupTicket(args: {
  clientId: number;
  calculatorId: number | null;
  businessName: string;
  callerPhone: string;
  callLogId: number;
  leadData: TradelineLeadData;
}): Promise<number> {
  const { clientId, calculatorId, businessName, callerPhone, callLogId, leadData } = args;

  const subject = `[Voice] Call from ${leadData.caller_name || callerPhone} — ${businessName}`;
  const descriptionLines = [
    `Channel:   voice`,
    `From:      ${leadData.caller_name || "Unknown"} (${callerPhone})`,
    `Call log:  #${callLogId}`,
    `Job type:  ${leadData.job_type ?? "(unknown)"}`,
    `Urgency:   ${leadData.urgency ?? "(unknown)"}`,
    "",
    "Initial call summary:",
    (leadData.job_description || "(none)").slice(0, 4000),
  ];

  const ticket = await storage.createSupportTicket({
    calculator_id: calculatorId ?? null,
    client_id: clientId,
    subject,
    description: descriptionLines.join("\n"),
    category: "service",
    priority: leadData.urgency === "emergency" ? "high" : "normal",
    status: "open",
    source: "ai_escalation",
  } as any);

  return ticket.id;
}

/* ─── Public entry ─── */

export interface ProcessVoiceFollowupInput {
  clientServiceId: number;
  client: Client;
  /** Optional — TradeLine calls aren't anchored to a calculator. When unset
   *  the auto-opened support ticket is created without a calculator link. */
  calculatorId?: number | null;
  callLogId: number;
  leadData: TradelineLeadData;
  report: VapiCallReport;
  callerEmail?: string | null;
}

export interface ProcessVoiceFollowupResult {
  /** True iff the loop took ownership of the follow-up (either sent via a
   *  tool or wrote a draft). False means the caller should fall back to the
   *  legacy single-call notification dispatch. */
  handled: boolean;
}

/**
 * Run the BA-8 multi-step loop for one ended Vapi call. The caller MUST have
 * already:
 *   - verified the Vapi webhook signature
 *   - extracted the lead data + logged the call
 *   - checked the AI system gate (aiGateAllowed("portal"))
 *   - checked the voice channel gate (aiChannelGateOn("voice"))
 *   - checked the per-client cost band is not `over_cap`
 *   - checked the voice follow-up opt-out signal
 *     (config.notifications.outboundSmsEnabled !== false)
 *
 * Never throws — returns `{ handled: false }` on any error so the caller can
 * fall back to its legacy single-call notification dispatch.
 */
export async function processVoiceFollowupViaLoop(
  input: ProcessVoiceFollowupInput,
): Promise<ProcessVoiceFollowupResult> {
  const { clientServiceId, client, callLogId, leadData, report, callerEmail } = input;

  try {
    // The admin actions write ticket messages keyed on confirmedByUserId,
    // which references users.id. We use the BUSINESS OWNER's portal user
    // (the trade business), not the caller — mirrors BA-5/BA-6.
    if (!client.user_id) {
      log.info("no client.user_id — falling back to legacy notifications", {
        clientId: client.id,
        callLogId,
      });
      return { handled: false };
    }
    const confirmedByUserId = client.user_id;
    const clientId = client.id;

    // 1. Find-or-create a support ticket so the admin tools have an anchor.
    let ticketId: number;
    try {
      ticketId = await findOrCreateFollowupTicket({
        clientId,
        calculatorId: input.calculatorId ?? null,
        businessName: client.business_name || "the business",
        callerPhone: leadData.caller_phone || report.customerNumber || "(unknown)",
        callLogId,
        leadData,
      });
    } catch (err: any) {
      log.error("findOrCreateFollowupTicket failed — falling back to legacy", {
        clientId,
        callLogId,
        error: err?.message,
      });
      return { handled: false };
    }

    const sessionId = `voice_followup_${report.callId}_${crypto.randomUUID().slice(0, 8)}`;
    const callerPhone = leadData.caller_phone || report.customerNumber || "(unknown)";

    // 2. Compose the initial user message.
    const conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [
      {
        role: "user",
        content: buildInitialUserMessage({
          leadData,
          summary: report.summary || "",
          transcript: report.transcript || "",
        }),
      },
    ];

    // 3. Wire tool executors. The email tool is wired even when no email was
    //    captured — the system prompt tells the model NOT to use it; this
    //    just keeps the registry consistent if the model ignores guidance,
    //    and the action's own admission checks will catch invalid args.
    const toolExecutors: Record<string, ReturnType<typeof buildAdminAutoExecutor>> = {
      [SMS_REPLY_TOOL]: buildAdminAutoExecutor(SMS_REPLY_TOOL, confirmedByUserId),
      [EMAIL_REPLY_TOOL]: buildAdminAutoExecutor(EMAIL_REPLY_TOOL, confirmedByUserId),
      [NOTIFY_ADMIN_TOOL]: buildAdminAutoExecutor(NOTIFY_ADMIN_TOOL, confirmedByUserId),
    };

    // 4. Run the loop.
    let result: AgentLoopResult;
    try {
      result = await runAgentLoop({
        systemPrompt: buildVoiceFollowupSystemPrompt({
          ticketId,
          businessName: client.business_name || "the business",
          callerName: leadData.caller_name || "the caller",
          callerPhone,
          callerEmail: callerEmail ?? null,
          jobType: leadData.job_type || "general inquiry",
          urgency: leadData.urgency || "normal",
          summary: report.summary || leadData.job_description || "(none)",
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
        callLogId,
        error: String(err?.message ?? err),
      });
      await writeAudit({
        actorId: String(confirmedByUserId),
        actorType: "system",
        action: "ai_drafted_voice_followup",
        entityType: "support_ticket",
        entityId: String(ticketId),
        metadata: {
          ticket_id: ticketId,
          client_id: clientId,
          client_service_id: clientServiceId,
          call_log_id: callLogId,
          call_id: report.callId,
          caller_phone: callerPhone,
          caller_email: callerEmail ?? null,
          channel: "voice_followup",
          loop_status: "error",
          reason: `loop threw: ${String(err?.message ?? err)}`,
          session_id: sessionId,
        },
      }).catch(() => {});
      // Loop crashed — DON'T claim ownership; the caller's legacy path can try.
      return { handled: false };
    }

    // 5. Branch on outcome.
    if (loopSentReply(result)) {
      log.info("voice follow-up sent via agent loop", {
        ticketId,
        callLogId,
        steps: result.steps.length,
        costCents: result.totalCostCents,
        loopRunId: result.loopRunId,
      });
      return { handled: true };
    }

    if (loopCalledAnyReplyTool(result)) {
      // A reply tool was called but downgraded to a draft — BA-3/BA-4 already
      // wrote their own draft audit row. Don't double-write.
      log.info("voice follow-up downgraded to draft via reply tool", {
        ticketId,
        callLogId,
        loopRunId: result.loopRunId,
      });
      return { handled: true };
    }

    // No reply tool was called. Record an `ai_drafted_voice_followup` audit
    // row with the loop's final state + reason. Claim ownership so the
    // caller does not also fire the legacy single-call dispatch.
    await writeAudit({
      actorId: String(confirmedByUserId),
      actorType: "system",
      action: "ai_drafted_voice_followup",
      entityType: "support_ticket",
      entityId: String(ticketId),
      metadata: {
        ticket_id: ticketId,
        client_id: clientId,
        client_service_id: clientServiceId,
        call_log_id: callLogId,
        call_id: report.callId,
        caller_phone: callerPhone,
        caller_email: callerEmail ?? null,
        channel: "voice_followup",
        loop_run_id: result.loopRunId,
        loop_status: result.status,
        total_cost_cents: result.totalCostCents,
        step_count: result.steps.length,
        reply_text: result.reply || null,
        reason:
          result.errorMessage ||
          `loop ended without calling ${SMS_REPLY_TOOL} or ${EMAIL_REPLY_TOOL}`,
        session_id: sessionId,
      },
    }).catch(() => {});

    log.info("voice follow-up drafted via agent loop (no reply sent)", {
      ticketId,
      callLogId,
      status: result.status,
      costCents: result.totalCostCents,
      loopRunId: result.loopRunId,
    });
    return { handled: true };
  } catch (err: any) {
    // Defensive — never let this concierge throw out of the webhook.
    log.error("processVoiceFollowupViaLoop unhandled error — falling back to legacy", {
      callLogId: input.callLogId,
      error: String(err?.message ?? err),
    });
    return { handled: false };
  }
}

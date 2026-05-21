/**
 * Admin Copilot — Phase 3 auto-tier agent-loop tools (W-BA-3).
 *
 * Two `auto`-tier actions registered on the `admin` surface for the BA-0
 * multi-step agent loop. They execute without a human confirm click when
 * admission criteria pass and downgrade safely when they don't.
 *
 * 1. `send_support_email_reply`
 *    Sends a customer-visible reply on an existing support ticket through
 *    the existing SendGrid path (`sendTicketReplyEmail`). Auto-tier
 *    ADMITTED only if ALL four are true:
 *      a. The ticket has an existing thread (≥1 prior message — i.e. this
 *         is not the very first inbound).
 *      b. The `email` channel gate is on (read from `ai_channel_gates`).
 *      c. The client's AI cost band is `within` or `soft_cap` (not `over`).
 *      d. The ticket subject contains no escalation keywords (lawsuit,
 *         refund, cancel, urgent, complaint).
 *    Otherwise the action DOWNGRADES to a draft: it writes an
 *    `ai_drafted_support_email` row to `audit_log` carrying the full payload
 *    so the admin can review and send it manually. No new table required.
 *
 *    Named `send_support_email_reply` rather than `send_support_email` to
 *    avoid clobbering the existing low-tier client-scoped
 *    `send_support_email` action in `adminTools.ts` (different schema —
 *    that one takes `client_id`, this one takes `ticket_id`).
 *
 * 2. `notify_admin_of_ticket`
 *    Internal action — records an admin activity-log entry and best-effort
 *    fires a Slack ping via the existing `fireAlert()` (uses
 *    `SLACK_WEBHOOK_URL`). Always `auto`-tier: no external comms, no
 *    customer-visible side effect. Returns `tool_error` only if BOTH the
 *    activity-log write AND the Slack ping fail.
 *
 * The loop's per-step Anthropic call already records usage via
 * `usageTracker` (BA-2, PR #454) — there's no additional cost-tracking
 * call to make here.
 *
 * Channel gates and budget bands fail CLOSED: if either throws or returns
 * a denial, `send_support_email_reply` downgrades to a draft rather than
 * sending.
 */

import { storage } from "../storage";
import { writeAudit } from "../lib/auditLog";
import { sendTicketReplyEmail } from "../lib/supportTicketEmails";
import { aiChannelGateOn } from "./aiChannelGate";
import { getClientBudgetBand } from "./aiBudget";
import { fireAlert } from "./alertService";
import {
  registerCopilotAction,
  type CopilotAction,
  type ActionTool,
  type PendingAction,
  type ActionExecutionResult,
} from "./copilotActionRegistry";
import { createLogger } from "../lib/logger";

const log = createLogger("AdminAgentTools");

/* ─── Constants ─── */

/** Subject-line tokens that block auto-tier sending — anything contractual
 *  or escalation-y stays in the draft lane for human review. */
const ESCALATION_KEYWORDS = [
  "lawsuit",
  "refund",
  "cancel",
  "urgent",
  "complaint",
];

const AI_FOOTER = "\n\n— [AI-assisted reply]";

function portalUrl(): string {
  const base = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  return `${base}/portal`;
}

function subjectContainsEscalation(subject: string): boolean {
  const lower = subject.toLowerCase();
  return ESCALATION_KEYWORDS.some((kw) => lower.includes(kw));
}

/* ═══════════════════════════════════════════════════════════════════
   1. send_support_email_reply  (auto-tier with draft fallback)
   ═══════════════════════════════════════════════════════════════════ */

const SEND_SUPPORT_EMAIL_REPLY_TOOL: ActionTool = {
  name: "send_support_email_reply",
  description:
    "Send an AI-assisted reply to an open support ticket. " +
    "Use when the admin asks you to respond to a ticket and the conversation is already underway. " +
    "The ticket_id MUST come from the support ticket the admin is currently viewing — never invent an ID. " +
    "Write the full reply body in plain text. Do not add a greeting or signature; the email shell adds both. " +
    "The reply is sent only when admission checks pass (existing thread, email channel on, client within budget, " +
    "no escalation keywords in the subject); otherwise it is saved as a draft for the admin to review. " +
    "Do not call this tool more than once per turn.",
  input_schema: {
    type: "object",
    properties: {
      ticket_id: {
        type: "number",
        description: "Numeric database ID of the support ticket.",
      },
      body: {
        type: "string",
        description: "The reply body in plain text. Blank lines separate paragraphs.",
      },
    },
    required: ["ticket_id", "body"],
  },
};

interface AdmissionContext {
  hasThread: boolean;
  emailGateOn: boolean;
  budgetBand: "within" | "soft_cap" | "over";
  escalation: boolean;
}

function admissionPassed(ctx: AdmissionContext): boolean {
  return (
    ctx.hasThread &&
    ctx.emailGateOn &&
    (ctx.budgetBand === "within" || ctx.budgetBand === "soft_cap") &&
    !ctx.escalation
  );
}

async function executeSendSupportEmailReply(
  action: PendingAction,
  confirmedByUserId: number,
): Promise<ActionExecutionResult> {
  const { args } = action;
  const ticketId = args.ticket_id;
  const rawBody = typeof args.body === "string" ? args.body.trim() : "";

  if (typeof ticketId !== "number" || !Number.isInteger(ticketId) || ticketId <= 0) {
    throw new Error("Invalid ticket_id: must be a positive integer");
  }
  if (!rawBody) throw new Error("The reply body is empty.");
  if (rawBody.length > 6000) throw new Error("The reply body is too long.");

  const ticket = await storage.getSupportTicketById(ticketId);
  if (!ticket) throw new Error(`Ticket #${ticketId} not found`);

  /* ── Admission checks (all four must pass for auto-send) ── */

  // 1. Existing thread? Count any prior messages on the ticket.
  let hasThread = false;
  try {
    const messages = await storage.listTicketMessages(ticketId, "all");
    hasThread = messages.length >= 1;
  } catch (err: any) {
    // Fail closed — treat read failure as "no thread" so we downgrade.
    log.warn("listTicketMessages failed during admission check", {
      ticketId,
      error: err?.message,
    });
    hasThread = false;
  }

  // 2. Email channel gate — fail closed on any error (aiChannelGateOn
  //    already returns false on infrastructure error per its contract).
  let emailGateOn = false;
  try {
    emailGateOn = await aiChannelGateOn("email");
  } catch (err: any) {
    log.warn("aiChannelGateOn threw — failing closed", { error: err?.message });
    emailGateOn = false;
  }

  // 3. Per-client AI cost band — fail closed on error.
  let budgetBand: "within" | "soft_cap" | "over" = "over";
  try {
    const info = await getClientBudgetBand(ticket.client_id);
    budgetBand = info.band;
  } catch (err: any) {
    log.warn("getClientBudgetBand threw — failing closed", {
      clientId: ticket.client_id,
      error: err?.message,
    });
    budgetBand = "over";
  }

  // 4. Subject escalation keywords.
  const escalation = subjectContainsEscalation(ticket.subject);

  const ctx: AdmissionContext = { hasThread, emailGateOn, budgetBand, escalation };
  const passes = admissionPassed(ctx);

  const bodyWithFooter = rawBody + AI_FOOTER;

  /* ── Downgrade path: write a draft to audit_log ── */
  if (!passes) {
    const failedChecks: string[] = [];
    if (!hasThread) failedChecks.push("no_thread");
    if (!emailGateOn) failedChecks.push("email_gate_off");
    if (budgetBand === "over") failedChecks.push("budget_over_cap");
    if (escalation) failedChecks.push("escalation_keyword");

    await writeAudit({
      actorId: String(confirmedByUserId),
      actorType: "admin",
      action: "ai_drafted_support_email",
      entityType: "support_ticket",
      entityId: String(ticketId),
      metadata: {
        ticket_id: ticketId,
        client_id: ticket.client_id,
        subject: ticket.subject,
        body: bodyWithFooter,
        failed_checks: failedChecks,
        admission_context: ctx,
        session_id: action.session_id,
      },
    });

    log.info("send_support_email_reply downgraded to draft", {
      ticketId,
      failedChecks,
    });

    return {
      narrative:
        `I drafted a reply for ticket #${ticketId} but didn't send it — ` +
        `auto-send admission failed (${failedChecks.join(", ")}). ` +
        `The draft is saved in the audit log for you to review and send manually.`,
    };
  }

  /* ── Auto-send path ── */

  // Look up the client's contact email through the ticket — same pattern
  // as adminSupportRoutes.ts uses for human-driven replies.
  const client = await storage.getClientById(ticket.client_id);
  if (!client) throw new Error(`Client #${ticket.client_id} not found`);
  if (!client.contact_email) {
    throw new Error(
      `${client.business_name} has no contact email on file — can't send the reply.`,
    );
  }

  // 1. Append the reply as a customer-visible ticket message.
  await storage.createTicketMessage({
    ticket_id: ticketId,
    author_id: confirmedByUserId,
    author_type: "admin",
    visibility: "customer",
    content: bodyWithFooter,
    metadata: { source: "ai_copilot", session_id: action.session_id },
  });

  // 2. Add a ticket event so the audit trail picks it up alongside human replies.
  await storage.createTicketEvent({
    ticket_id: ticketId,
    actor_id: confirmedByUserId,
    actor_type: "human",
    action: "reply_added",
    summary: "AI Copilot replied to customer (auto-tier)",
  });

  // 3. Bump updated_at.
  await storage.updateSupportTicket(ticketId, {});

  // 4. Send the customer-facing email via the existing SendGrid path.
  await sendTicketReplyEmail(client.contact_email, {
    ticketId: ticket.id,
    subject: ticket.subject,
    replyPreview: bodyWithFooter,
    portalUrl: portalUrl(),
  });

  // 5. Record the send to audit_log.
  await writeAudit({
    actorId: String(confirmedByUserId),
    actorType: "admin",
    action: "ai_sent_support_email",
    entityType: "support_ticket",
    entityId: String(ticketId),
    metadata: {
      ticket_id: ticketId,
      client_id: ticket.client_id,
      subject: ticket.subject,
      body: bodyWithFooter,
      admission_context: ctx,
      session_id: action.session_id,
    },
  });

  log.info("send_support_email_reply sent", { ticketId, clientId: ticket.client_id });

  return {
    narrative:
      `Sent an AI-assisted reply on ticket #${ticketId} ("${ticket.subject}") to ` +
      `${client.business_name} (${client.contact_email}). It's on its way out through the email queue.`,
  };
}

const SEND_SUPPORT_EMAIL_REPLY_ACTION: CopilotAction = {
  name: "send_support_email_reply",
  surface: "admin",
  riskTier: "auto",
  tool: SEND_SUPPORT_EMAIL_REPLY_TOOL,
  execute: executeSendSupportEmailReply,
};

/* ═══════════════════════════════════════════════════════════════════
   2. notify_admin_of_ticket  (auto-tier, internal-only)
   ═══════════════════════════════════════════════════════════════════ */

const NOTIFY_ADMIN_OF_TICKET_TOOL: ActionTool = {
  name: "notify_admin_of_ticket",
  description:
    "Create an internal admin notification for a support ticket that needs attention. " +
    "Use when an inbound ticket has high urgency or a sentiment red flag. " +
    "The ticket_id MUST come from the visible ticket context — never invent an ID. " +
    "Provide a short `reason` describing why the founder should look at this ticket. " +
    "This is INTERNAL-ONLY — it does not contact the customer. Do not call this tool more than once per turn.",
  input_schema: {
    type: "object",
    properties: {
      ticket_id: {
        type: "number",
        description: "Numeric database ID of the support ticket.",
      },
      reason: {
        type: "string",
        description: "One-sentence explanation of why this ticket needs admin attention.",
      },
      severity: {
        type: "string",
        enum: ["info", "warning", "critical"],
        description: "Notification severity. Defaults to 'warning' if omitted.",
      },
    },
    required: ["ticket_id", "reason"],
  },
};

async function executeNotifyAdminOfTicket(
  action: PendingAction,
  confirmedByUserId: number,
): Promise<ActionExecutionResult> {
  const { args } = action;
  const ticketId = args.ticket_id;
  const reason = typeof args.reason === "string" ? args.reason.trim() : "";
  const severity = (typeof args.severity === "string" && ["info", "warning", "critical"].includes(args.severity)
    ? args.severity
    : "warning") as "info" | "warning" | "critical";

  if (typeof ticketId !== "number" || !Number.isInteger(ticketId) || ticketId <= 0) {
    throw new Error("Invalid ticket_id: must be a positive integer");
  }
  if (!reason) throw new Error("A reason for the notification is required.");
  if (reason.length > 500) throw new Error("The reason is too long.");

  const ticket = await storage.getSupportTicketById(ticketId);
  if (!ticket) throw new Error(`Ticket #${ticketId} not found`);

  // Best-effort: in-app via admin_activity_log; Slack via fireAlert.
  // Only return tool_error if BOTH paths fail.
  let inAppOk = false;
  let slackOk = false;

  try {
    await storage.logAdminActivity({
      actor_type: "ai_agent",
      actor_id: confirmedByUserId,
      actor_name: "AI Copilot",
      action: "ai_tool.notify_admin_of_ticket",
      entity_type: "support_ticket",
      entity_id: ticketId,
      summary: `AI flagged ticket #${ticketId} for admin attention: ${reason}`,
      metadata: {
        tool_name: "notify_admin_of_ticket",
        ticket_id: ticketId,
        client_id: ticket.client_id,
        subject: ticket.subject,
        priority: ticket.priority,
        severity,
        reason,
        session_id: action.session_id,
      },
    });
    inAppOk = true;
  } catch (err: any) {
    log.warn("admin_activity_log write failed", { ticketId, error: err?.message });
  }

  try {
    // fireAlert handles SLACK_WEBHOOK_URL if configured, plus dedupes &
    // emails the founder. It never throws — guard anyway.
    await fireAlert({
      severity,
      category: "support_ticket_attention",
      title: `Ticket #${ticketId} — ${ticket.subject}`,
      details: reason,
      metadata: {
        ticket_id: ticketId,
        client_id: ticket.client_id,
        priority: ticket.priority,
        source: "ai_copilot",
      },
    });
    slackOk = true;
  } catch (err: any) {
    log.warn("fireAlert failed", { ticketId, error: err?.message });
  }

  if (!inAppOk && !slackOk) {
    throw new Error(
      "Couldn't create an admin notification — both the in-app log and Slack ping failed.",
    );
  }

  const pathsUsed = [inAppOk ? "in-app" : null, slackOk ? "Slack" : null]
    .filter(Boolean)
    .join(" + ");

  return {
    narrative:
      `Flagged ticket #${ticketId} ("${ticket.subject}") for admin attention ` +
      `via ${pathsUsed}. Reason: ${reason}`,
  };
}

const NOTIFY_ADMIN_OF_TICKET_ACTION: CopilotAction = {
  name: "notify_admin_of_ticket",
  surface: "admin",
  riskTier: "auto",
  tool: NOTIFY_ADMIN_OF_TICKET_TOOL,
  execute: executeNotifyAdminOfTicket,
};

/* ═══════════════════════════════════════════════════════════════════
   Registration + public surface
   ═══════════════════════════════════════════════════════════════════ */

registerCopilotAction(SEND_SUPPORT_EMAIL_REPLY_ACTION);
registerCopilotAction(NOTIFY_ADMIN_OF_TICKET_ACTION);

/** Anthropic tool definitions for the new auto-tier admin agent tools.
 *  Re-exported alongside `ADMIN_TOOLS` so the chat route can ADD (not
 *  replace) them on the model call. */
export const adminAgentTools: ActionTool[] = [
  SEND_SUPPORT_EMAIL_REPLY_TOOL,
  NOTIFY_ADMIN_OF_TICKET_TOOL,
];

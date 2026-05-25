/**
 * Admin Copilot — Phase 3 agent-loop tools (W-BA-3, W-BA-4).
 *
 * Three actions registered on the `admin` surface for the BA-0 multi-step
 * agent loop. AI-safety audit 2026-05-24 downgraded the two
 * customer-visible-send actions from `auto` to `low` tier — they now
 * pause for an admin confirm click via /api/admin/tool-confirm rather
 * than firing inside the loop. The internal `notify_admin_of_ticket`
 * remains `auto` because it has no customer-visible side effect.
 *
 * 1. `send_support_email_reply`  (low-tier — confirm required)
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
 * 2. `notify_admin_of_ticket`  (auto — internal-only)
 *    Internal action — records an admin activity-log entry and best-effort
 *    fires a Slack ping via the existing `fireAlert()` (uses
 *    `SLACK_WEBHOOK_URL`). Always `auto`-tier: no external comms, no
 *    customer-visible side effect. Returns `tool_error` only if BOTH the
 *    activity-log write AND the Slack ping fail.
 *
 * 3. `send_admin_sms`  (low-tier — confirm required, W-BA-4)
 *    Sends a customer-visible SMS reply on an open support ticket through
 *    Twilio (`sendSMS` in `server/twilioClient.ts`). The phone number is
 *    looked up server-side from the customer's existing SMS thread on the
 *    ticket's calculator — never accepted from the model. Auto-tier
 *    ADMITTED only if ALL four are true:
 *      a. The customer already has an existing SMS thread with this
 *         business (>= 1 prior smsMessages row on the calculator with the
 *         resolved lead) — this is not first-contact via SMS.
 *      b. The `sms` channel gate is on (read from `ai_channel_gates`).
 *      c. The client's AI cost band is `within` or `soft_cap`.
 *      d. The reply body has no escalation keywords AND no PII tokens
 *         (credit card / SSN / password / license number patterns).
 *    Otherwise the action DOWNGRADES to a draft (`ai_drafted_admin_sms`
 *    audit row carrying the payload). SMS cost is recorded to the
 *    `client_variable_costs` ledger (kind=sms) via `recordSmsCostForClient`
 *    on send. The body is capped at 320 chars (single Twilio segment of
 *    GSM-7 + safety margin for the appended "— sent by … (AI-assisted)"
 *    footer) to avoid silent double-segment billing.
 *
 * The loop's per-step Anthropic call already records usage via
 * `usageTracker` (BA-2, PR #454) — there's no additional AI-cost call to
 * make here. SMS sends DO require a separate variable-cost increment
 * (`recordSmsCostForClient`), because Twilio costs are not in token
 * accounting.
 *
 * Channel gates and budget bands fail CLOSED: if either throws or returns
 * a denial, sends downgrade to a draft rather than going out.
 */

import { storage } from "../storage";
import { writeAudit } from "../lib/auditLog";
import { sendTicketReplyEmail } from "../lib/supportTicketEmails";
import { aiChannelGateOn } from "./aiChannelGate";
import { getClientBudgetBand } from "./aiBudget";
import { fireAlert } from "./alertService";
import { sendSMS } from "../twilioClient";
import { recordSmsCostForClient } from "./clientCostBilling";
import {
  registerCopilotAction,
  type CopilotAction,
  type ActionTool,
  type PendingAction,
  type ActionExecutionResult,
  type ToolCallSummary,
} from "./copilotActionRegistry";
import { createLogger } from "../lib/logger";
import { redactPii } from "../lib/redactPii";

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
        subject: redactPii(ticket.subject),
        body: redactPii(bodyWithFooter),
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
      subject: redactPii(ticket.subject),
      body: redactPii(bodyWithFooter),
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

/** Confirmation-card preview for send_support_email_reply. Renders the
 *  ticket id + a body excerpt so the admin sees what's about to go out
 *  before clicking confirm. */
function summarizeSendSupportEmailReply(args: Record<string, unknown>): ToolCallSummary {
  const ticketId = typeof args.ticket_id === "number" ? args.ticket_id : undefined;
  const body = typeof args.body === "string" ? args.body.trim() : "";
  const preview = body.length > 240 ? body.slice(0, 237) + "…" : body;
  const lines = [
    ticketId ? `Ticket: #${ticketId}` : "Ticket: (missing id)",
    "Reply body:",
    preview || "(empty)",
  ];
  return { title: "Send support-ticket reply", lines };
}

const SEND_SUPPORT_EMAIL_REPLY_ACTION: CopilotAction = {
  name: "send_support_email_reply",
  surface: "admin",
  // Tier downgraded auto → low: customer-visible outbound email must
  // pause for an admin confirm click. The agent loop short-circuits on
  // any non-auto action and chatRoutes hands off to /api/admin/tool-confirm.
  riskTier: "low",
  tool: SEND_SUPPORT_EMAIL_REPLY_TOOL,
  execute: executeSendSupportEmailReply,
  summarize: summarizeSendSupportEmailReply,
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
   3. send_admin_sms  (auto-tier with draft fallback) — W-BA-4
   ═══════════════════════════════════════════════════════════════════ */

/** SMS-body PII patterns. Conservative — false positives just downgrade
 *  to draft. Order matters only for readability. */
const PII_PATTERNS: { name: string; re: RegExp }[] = [
  // Credit card-ish 13–19 digit run (spaces / dashes allowed).
  { name: "credit_card", re: /\b(?:\d[ -]*?){13,19}\b/ },
  // US SSN.
  { name: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/ },
  // Password / license number callouts.
  { name: "password_token", re: /\b(password|passwd|pwd)\s*[:=]/i },
  { name: "license_number", re: /\b(license|licence|dl)\s*#?\s*[:=]?\s*[A-Z0-9-]{6,}\b/i },
];

/** Max total SMS body length (incl. footer) — one Twilio GSM-7 segment is
 *  160 chars; concatenated segments are billed each. 320 = max two
 *  segments. We disallow anything beyond that so a chatty model can't
 *  silently 3× the per-send cost. */
const SMS_MAX_TOTAL_CHARS = 320;

function bodyContainsEscalation(body: string): boolean {
  const lower = body.toLowerCase();
  return ESCALATION_KEYWORDS.some((kw) => lower.includes(kw));
}

function detectPii(body: string): string[] {
  return PII_PATTERNS.filter((p) => p.re.test(body)).map((p) => p.name);
}

function buildSmsFooter(businessName: string): string {
  // Keep footer compact — every char counts toward the segment cap.
  const safeName = businessName.trim().slice(0, 40) || "WeFixTrades";
  return `\n— sent by ${safeName} (AI-assisted)`;
}

const SEND_ADMIN_SMS_TOOL: ActionTool = {
  name: "send_admin_sms",
  description:
    "Send an AI-assisted SMS reply to a customer on an existing support ticket via Twilio. " +
    "Use ONLY when the customer already has an established SMS thread with this business and " +
    "the admin is asking you to reply via SMS specifically. The ticket_id MUST come from the " +
    "ticket the admin is currently viewing — never invent an ID. The customer's phone number is " +
    "resolved server-side from their existing SMS thread; do NOT pass a phone number. Write the " +
    "full reply body in plain text. Do not add a signature; the SMS layer appends one. The total " +
    "message (your body + footer) must stay under 320 characters. The SMS is sent only when " +
    "admission checks pass (existing SMS thread, sms channel on, client within budget, no " +
    "escalation keywords, no PII in body); otherwise it is saved as a draft for the admin to " +
    "review. Do not call this tool more than once per turn.",
  input_schema: {
    type: "object",
    properties: {
      ticket_id: {
        type: "number",
        description: "Numeric database ID of the support ticket the SMS reply belongs to.",
      },
      body: {
        type: "string",
        description:
          "The SMS reply body in plain text. Keep it short — under ~250 chars to leave room " +
          "for the auto-appended footer.",
      },
    },
    required: ["ticket_id", "body"],
  },
};

interface SmsAdmissionContext {
  hasThread: boolean;
  smsGateOn: boolean;
  budgetBand: "within" | "soft_cap" | "over";
  escalation: boolean;
  piiTokens: string[];
}

function smsAdmissionPassed(ctx: SmsAdmissionContext): boolean {
  return (
    ctx.hasThread &&
    ctx.smsGateOn &&
    (ctx.budgetBand === "within" || ctx.budgetBand === "soft_cap") &&
    !ctx.escalation &&
    ctx.piiTokens.length === 0
  );
}

async function executeSendAdminSms(
  action: PendingAction,
  confirmedByUserId: number,
): Promise<ActionExecutionResult> {
  const { args } = action;
  const ticketId = args.ticket_id;
  const rawBody = typeof args.body === "string" ? args.body.trim() : "";

  if (typeof ticketId !== "number" || !Number.isInteger(ticketId) || ticketId <= 0) {
    throw new Error("Invalid ticket_id: must be a positive integer");
  }
  if (!rawBody) throw new Error("The SMS body is empty.");
  // Pre-footer cap — the footer is short but we want to fail fast on
  // very long bodies before doing any DB work.
  if (rawBody.length > SMS_MAX_TOTAL_CHARS) {
    throw new Error(
      `The SMS body is too long (${rawBody.length} chars). Keep it under ${SMS_MAX_TOTAL_CHARS}.`,
    );
  }

  const ticket = await storage.getSupportTicketById(ticketId);
  if (!ticket) throw new Error(`Ticket #${ticketId} not found`);

  // Resolve phone server-side from the customer's existing SMS thread on
  // the ticket's calculator. NEVER trust a phone number from the model.
  // Strategy: pick the most-recent thread on this calculator whose lead
  // has a phone. If there is no such thread, we fail admission (no
  // existing thread).
  let resolvedPhone: string | null = null;
  let hasThread = false;
  try {
    if (ticket.calculator_id != null) {
      const threads = await storage.getSmsThreads(ticket.calculator_id);
      // Pick the thread with the most-recent message timestamp whose lead
      // has a usable phone number.
      let bestTs = -1;
      for (const t of threads) {
        if (!t.lead?.phone) continue;
        if (t.messages.length === 0) continue;
        const lastTs = t.messages.reduce((acc, m) => {
          const ts = m.created_at ? new Date(m.created_at).getTime() : 0;
          return ts > acc ? ts : acc;
        }, 0);
        if (lastTs > bestTs) {
          bestTs = lastTs;
          resolvedPhone = t.lead.phone;
        }
      }
      hasThread = resolvedPhone != null && bestTs > 0;
    }
  } catch (err: any) {
    log.warn("getSmsThreads failed during admission check — failing closed", {
      ticketId,
      error: err?.message,
    });
    hasThread = false;
    resolvedPhone = null;
  }

  // SMS channel gate — fail closed.
  let smsGateOn = false;
  try {
    smsGateOn = await aiChannelGateOn("sms");
  } catch (err: any) {
    log.warn("aiChannelGateOn(sms) threw — failing closed", { error: err?.message });
    smsGateOn = false;
  }

  // Per-client AI cost band — fail closed on error.
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

  // Content checks — escalation keywords + PII tokens in the body.
  const escalation = bodyContainsEscalation(rawBody);
  const piiTokens = detectPii(rawBody);

  const ctx: SmsAdmissionContext = {
    hasThread,
    smsGateOn,
    budgetBand,
    escalation,
    piiTokens,
  };
  const passes = smsAdmissionPassed(ctx);

  // Need the client for the business name (footer) + audit metadata.
  const client = await storage.getClientById(ticket.client_id);
  if (!client) throw new Error(`Client #${ticket.client_id} not found`);

  const footer = buildSmsFooter(client.business_name);
  let bodyWithFooter = rawBody + footer;

  // Hard cap — if footer pushes us past the limit, trim the body so the
  // total stays under SMS_MAX_TOTAL_CHARS rather than silently double-billing.
  if (bodyWithFooter.length > SMS_MAX_TOTAL_CHARS) {
    const trimTo = SMS_MAX_TOTAL_CHARS - footer.length - 1; // -1 for ellipsis
    const trimmed = rawBody.slice(0, Math.max(0, trimTo)).trimEnd();
    bodyWithFooter = trimmed + "…" + footer;
  }

  /* ── Downgrade path: write a draft to audit_log ── */
  if (!passes) {
    const failedChecks: string[] = [];
    if (!hasThread) failedChecks.push("no_sms_thread");
    if (!smsGateOn) failedChecks.push("sms_gate_off");
    if (budgetBand === "over") failedChecks.push("budget_over_cap");
    if (escalation) failedChecks.push("escalation_keyword");
    if (piiTokens.length > 0) failedChecks.push(`pii:${piiTokens.join(",")}`);

    await writeAudit({
      actorId: String(confirmedByUserId),
      actorType: "admin",
      action: "ai_drafted_admin_sms",
      entityType: "support_ticket",
      entityId: String(ticketId),
      metadata: {
        ticket_id: ticketId,
        client_id: ticket.client_id,
        business_name: client.business_name,
        // Phone is intentionally omitted on draft when we couldn't
        // resolve one — including it would leak nothing useful.
        resolved_phone: resolvedPhone,
        body: redactPii(bodyWithFooter),
        failed_checks: failedChecks,
        admission_context: ctx,
        session_id: action.session_id,
      },
    });

    log.info("send_admin_sms downgraded to draft", {
      ticketId,
      failedChecks,
    });

    return {
      narrative:
        `I drafted an SMS reply for ticket #${ticketId} but didn't send it — ` +
        `auto-send admission failed (${failedChecks.join(", ")}). ` +
        `The draft is saved in the audit log for you to review and send manually.`,
    };
  }

  /* ── Auto-send path ── */

  // Defensive: passes guarantees resolvedPhone is non-null (hasThread
  // requires it) but narrow the type for TypeScript.
  if (!resolvedPhone) {
    throw new Error(
      "Phone resolution invariant violated — passed admission with no phone.",
    );
  }

  // 1. Send the SMS via Twilio. sendSMS throws on Twilio credential gaps
  //    or API failure; let those surface as a tool error so the loop
  //    reports them rather than silently swallowing a failed send.
  let twilioSid: string;
  try {
    twilioSid = await sendSMS(resolvedPhone, bodyWithFooter, "sms");
  } catch (err: any) {
    log.error("send_admin_sms Twilio send failed", {
      ticketId,
      error: err?.message,
    });
    throw new Error(`Couldn't send the SMS — ${err?.message ?? "Twilio error"}`);
  }

  // 2. Record the SMS cost on the per-client variable-cost ledger.
  //    Treat anything over 160 chars as a 2-segment send (Twilio's
  //    GSM-7 boundary). Best-effort — never block on metering failure.
  const segments = bodyWithFooter.length > 160 ? 2 : 1;
  try {
    await recordSmsCostForClient({ clientId: ticket.client_id, segments });
  } catch (err: any) {
    log.warn("recordSmsCostForClient failed — non-fatal", {
      clientId: ticket.client_id,
      error: err?.message,
    });
  }

  // 3. Add a ticket event so the audit trail picks up the SMS send.
  try {
    await storage.createTicketEvent({
      ticket_id: ticketId,
      actor_id: confirmedByUserId,
      actor_type: "human",
      action: "sms_sent",
      summary: "AI Copilot sent SMS reply to customer (auto-tier)",
    });
  } catch (err: any) {
    log.warn("createTicketEvent failed — non-fatal", {
      ticketId,
      error: err?.message,
    });
  }

  // 4. Bump updated_at on the ticket so it surfaces in admin views.
  try {
    await storage.updateSupportTicket(ticketId, {});
  } catch {
    // Non-fatal — purely a freshness signal.
  }

  // 5. Record the send to audit_log.
  await writeAudit({
    actorId: String(confirmedByUserId),
    actorType: "admin",
    action: "ai_sent_admin_sms",
    entityType: "support_ticket",
    entityId: String(ticketId),
    metadata: {
      ticket_id: ticketId,
      client_id: ticket.client_id,
      business_name: client.business_name,
      // Phone is recorded on send (audit need) but not echoed to chat.
      resolved_phone: resolvedPhone,
      body: redactPii(bodyWithFooter),
      segments,
      twilio_sid: twilioSid,
      admission_context: ctx,
      session_id: action.session_id,
    },
  });

  log.info("send_admin_sms sent", {
    ticketId,
    clientId: ticket.client_id,
    segments,
    sid: twilioSid,
  });

  return {
    narrative:
      `Sent an AI-assisted SMS on ticket #${ticketId} to ${client.business_name}'s customer ` +
      `(${segments} segment${segments === 1 ? "" : "s"}, Twilio SID ${twilioSid}).`,
  };
}

/** Confirmation-card preview for send_admin_sms. Renders the ticket id
 *  + the body so the admin sees exactly what the customer will receive
 *  via SMS before clicking confirm. */
function summarizeSendAdminSms(args: Record<string, unknown>): ToolCallSummary {
  const ticketId = typeof args.ticket_id === "number" ? args.ticket_id : undefined;
  const body = typeof args.body === "string" ? args.body.trim() : "";
  const preview = body.length > 240 ? body.slice(0, 237) + "…" : body;
  const lines = [
    ticketId ? `Ticket: #${ticketId}` : "Ticket: (missing id)",
    "SMS body:",
    preview || "(empty)",
  ];
  return { title: "Send SMS reply via Twilio", lines };
}

const SEND_ADMIN_SMS_ACTION: CopilotAction = {
  name: "send_admin_sms",
  surface: "admin",
  // Tier downgraded auto → low: customer-visible outbound SMS must pause
  // for an admin confirm click. Same confirm path as send_support_email_reply.
  riskTier: "low",
  tool: SEND_ADMIN_SMS_TOOL,
  execute: executeSendAdminSms,
  summarize: summarizeSendAdminSms,
};

/* ═══════════════════════════════════════════════════════════════════
   Registration + public surface
   ═══════════════════════════════════════════════════════════════════ */

registerCopilotAction(SEND_SUPPORT_EMAIL_REPLY_ACTION);
registerCopilotAction(NOTIFY_ADMIN_OF_TICKET_ACTION);
registerCopilotAction(SEND_ADMIN_SMS_ACTION);

/** Anthropic tool definitions for the new auto-tier admin agent tools.
 *  Re-exported alongside `ADMIN_TOOLS` so the chat route can ADD (not
 *  replace) them on the model call. */
export const adminAgentTools: ActionTool[] = [
  SEND_SUPPORT_EMAIL_REPLY_TOOL,
  NOTIFY_ADMIN_OF_TICKET_TOOL,
  SEND_ADMIN_SMS_TOOL,
];

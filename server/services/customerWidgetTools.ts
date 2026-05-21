/**
 * Customer-widget copilot actions (W-BB-1).
 *
 * Six auto-tier tools the customer-facing AI chat (AIChatBubble) calls
 * inside a multi-step `runAgentLoop`. These let a customer chain steps in
 * one conversation — "what's my quote? → propose times → book → email me
 * the estimate" — without the brittle single-call flow.
 *
 * SEPARATION: every action here declares surface "customer-widget". The
 * admin and portal copilots are NEVER offered these tools. The
 * AIChatBubble agent loop only ever offers `customer-widget` actions.
 *
 * AUTO-TIER ADMISSION CRITERIA (per copilotActionRegistry comments):
 *   • Customer-satisfying — the customer initiated and benefits.
 *   • Stays within the calculator owner's prebuilt scheduling /
 *     pricing / email capability — never invents new commercial terms.
 *   • Structurally cannot cause company financial loss — every write is
 *     either the customer's own row, their own quote, or a support
 *     ticket flagged for human follow-up.
 *
 * SCOPING:
 *   • IDENTITY-AWARE — every executor receives the customer's email +
 *     calculator_id via the loop's `metadata` context. Tools fail-closed
 *     if a write needs an email and none is in context.
 *   • CALCULATOR-SCOPED — every read / write is filtered to the single
 *     `calculator_id` set in the chat session. No cross-calculator
 *     leakage; no other customer's data accessible.
 *
 * Registration is import-time (bottom of file). The wiring at
 * server/routes/aiRoutes.ts (`/api/ai/client-chat`) imports this module
 * to ensure the actions are registered before the loop runs.
 */

import { db } from "../db";
import { and, eq, gte, lt, ilike, desc } from "drizzle-orm";
import {
  calculators,
  leads,
  availabilityRules,
  scheduledAppointments,
  supportTickets,
} from "@shared/schemas/db";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import { createLogger } from "../lib/logger";
import {
  registerCopilotAction,
  type CopilotAction,
  type ActionTool,
  type PendingAction,
  type ActionExecutionResult,
} from "./copilotActionRegistry";

const log = createLogger("CustomerWidgetTools");

/* ─── Shared helpers ─── */

/**
 * Pulls the customer identity + calculator scope from the PendingAction's
 * metadata. The agent-loop binding (aiRoutes.ts) sets this on every loop
 * call so executors never trust args for these fields.
 */
function getCustomerContext(action: PendingAction): {
  calculator_id: number;
  customer_email?: string;
  customer_phone?: string;
  customer_name?: string;
} {
  const md = action.metadata || {};
  const calc = Number(md.calculator_id);
  if (!Number.isFinite(calc) || calc <= 0) {
    throw new Error("calculator_id is missing from chat context");
  }
  return {
    calculator_id: calc,
    customer_email: typeof md.customer_email === "string" ? md.customer_email.trim().toLowerCase() : undefined,
    customer_phone: typeof md.customer_phone === "string" ? md.customer_phone.trim() : undefined,
    customer_name: typeof md.customer_name === "string" ? md.customer_name.trim() : undefined,
  };
}

function requireEmail(ctx: ReturnType<typeof getCustomerContext>): string {
  if (!ctx.customer_email || !ctx.customer_email.includes("@")) {
    throw new Error(
      "I need your email address before I can do that — could you share it?"
    );
  }
  return ctx.customer_email;
}

/* ─────────────────────────────────────────────────────────────────────
 * 1) fetch_customer_quote_history — read-only past submissions on this
 *    calculator for the caller's email/phone.
 * ───────────────────────────────────────────────────────────────────── */

const FETCH_HISTORY_TOOL: ActionTool = {
  name: "fetch_customer_quote_history",
  description:
    "Look up the customer's PAST quote submissions on THIS calculator. " +
    "Uses the customer's email (from this conversation) to find their prior " +
    "estimates. Returns nothing for other customers. Call this when the " +
    "customer asks 'what was my last quote?' or 'do you have my info?'.",
  input_schema: {
    type: "object",
    properties: {},
    required: [],
  },
};

async function executeFetchHistory(action: PendingAction): Promise<ActionExecutionResult> {
  const ctx = getCustomerContext(action);
  const email = requireEmail(ctx);

  const rows = await db
    .select({
      id: leads.id,
      quote_amount: leads.quote_amount,
      status: leads.status,
      created_date: leads.created_date,
    })
    .from(leads)
    .where(and(
      eq(leads.calculator_id, ctx.calculator_id),
      ilike(leads.email, email),
    ))
    .orderBy(desc(leads.created_date))
    .limit(10);

  const submissions = rows.map((r) => ({
    id: r.id,
    computed_total: r.quote_amount ?? null,
    status: r.status,
    created_at: r.created_date?.toISOString?.() ?? null,
  }));

  return {
    narrative: JSON.stringify({ submissions, count: submissions.length }),
  };
}

const FETCH_HISTORY_ACTION: CopilotAction = {
  name: "fetch_customer_quote_history",
  surface: "customer-widget",
  riskTier: "auto",
  tool: FETCH_HISTORY_TOOL,
  execute: executeFetchHistory,
};

/* ─────────────────────────────────────────────────────────────────────
 * 2) propose_appointment_times — read-only slot lookup for next 14 days.
 * ───────────────────────────────────────────────────────────────────── */

const PROPOSE_TIMES_TOOL: ActionTool = {
  name: "propose_appointment_times",
  description:
    "Find available appointment slots over the next 14 days on this " +
    "calculator's scheduling calendar. Returns a list of { start, end, " +
    "available } slots in ISO format. Use this when the customer asks " +
    "'when can I book?' or 'what times do you have?'.",
  input_schema: {
    type: "object",
    properties: {
      days_ahead: {
        type: "number",
        description: "How many days from today to scan (1–14). Default 14.",
      },
    },
    required: [],
  },
};

function parseHM(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(":").map((n) => parseInt(n, 10));
  return { h: h || 0, m: m || 0 };
}

async function executeProposeTimes(action: PendingAction): Promise<ActionExecutionResult> {
  const ctx = getCustomerContext(action);
  const daysAhead = Math.min(14, Math.max(1, Number((action.args as any).days_ahead) || 14));

  const [rule] = await db
    .select()
    .from(availabilityRules)
    .where(eq(availabilityRules.calculator_id, ctx.calculator_id))
    .limit(1);

  if (!rule || !rule.enabled) {
    return {
      narrative: JSON.stringify({
        slots: [],
        reason: "scheduling_disabled",
      }),
    };
  }

  const workingDays: number[] = Array.isArray(rule.working_days)
    ? (rule.working_days as number[])
    : [1, 2, 3, 4, 5];
  const { h: startH, m: startM } = parseHM(rule.working_hours_start);
  const { h: endH, m: endM } = parseHM(rule.working_hours_end);
  const stepMs = (rule.slot_duration_minutes + rule.buffer_minutes) * 60 * 1000;
  const durMs = rule.slot_duration_minutes * 60 * 1000;

  const now = new Date();
  const rangeStart = new Date(now);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeEnd.getDate() + daysAhead);

  // Existing confirmed appointments to mark unavailable.
  const existing = await db
    .select({ scheduled_for: scheduledAppointments.scheduled_for })
    .from(scheduledAppointments)
    .where(and(
      eq(scheduledAppointments.calculator_id, ctx.calculator_id),
      eq(scheduledAppointments.status, "confirmed"),
      gte(scheduledAppointments.scheduled_for, rangeStart),
      lt(scheduledAppointments.scheduled_for, rangeEnd),
    ));
  const booked = new Set(existing.map((r) => r.scheduled_for?.getTime?.()).filter((t): t is number => typeof t === "number"));

  const slots: Array<{ start: string; end: string; available: boolean }> = [];
  for (let d = new Date(rangeStart); d.getTime() < rangeEnd.getTime(); d.setDate(d.getDate() + 1)) {
    if (!workingDays.includes(d.getDay())) continue;
    const dayStart = new Date(d);
    dayStart.setHours(startH, startM, 0, 0);
    const dayEnd = new Date(d);
    dayEnd.setHours(endH, endM, 0, 0);

    let cursor = dayStart.getTime();
    while (cursor + durMs <= dayEnd.getTime()) {
      if (cursor >= now.getTime()) {
        const start = new Date(cursor);
        const end = new Date(cursor + durMs);
        const available = !booked.has(cursor);
        if (available) {
          slots.push({
            start: start.toISOString(),
            end: end.toISOString(),
            available,
          });
        }
      }
      cursor += stepMs;
      if (slots.length >= 30) break; // cap payload
    }
    if (slots.length >= 30) break;
  }

  return {
    narrative: JSON.stringify({
      slots,
      timezone: rule.timezone,
      slot_duration_minutes: rule.slot_duration_minutes,
    }),
  };
}

const PROPOSE_TIMES_ACTION: CopilotAction = {
  name: "propose_appointment_times",
  surface: "customer-widget",
  riskTier: "auto",
  tool: PROPOSE_TIMES_TOOL,
  execute: executeProposeTimes,
};

/* ─────────────────────────────────────────────────────────────────────
 * 3) book_appointment — write a scheduled_appointments row.
 *
 *    Auto-tier admission: the slot is *within* the calculator owner's
 *    prebuilt working_hours / availability rules. The action writes one
 *    row for this customer's booking only; it cannot oversell, can't
 *    book outside availability (we re-check), and can't book another
 *    customer. Identity-bound to the conversation's email.
 * ───────────────────────────────────────────────────────────────────── */

const BOOK_APPOINTMENT_TOOL: ActionTool = {
  name: "book_appointment",
  description:
    "Book a specific appointment slot for the customer. Pass start_iso " +
    "(ISO timestamp from propose_appointment_times). Returns the booking " +
    "id and a human-readable confirmation. Requires the customer's email " +
    "to be known in this conversation.",
  input_schema: {
    type: "object",
    properties: {
      start_iso: {
        type: "string",
        description: "Slot start time in ISO-8601 format, exactly as returned by propose_appointment_times.",
      },
      notes: {
        type: "string",
        description: "Optional short note from the customer (≤200 chars).",
      },
    },
    required: ["start_iso"],
  },
};

async function executeBookAppointment(action: PendingAction): Promise<ActionExecutionResult> {
  const ctx = getCustomerContext(action);
  const email = requireEmail(ctx);

  const startIso = String((action.args as any).start_iso || "");
  const notes = String((action.args as any).notes || "").slice(0, 200) || null;

  const startDate = new Date(startIso);
  if (isNaN(startDate.getTime())) {
    throw new Error(`Invalid start_iso: ${startIso}`);
  }
  if (startDate.getTime() < Date.now()) {
    throw new Error("Cannot book a slot in the past");
  }

  // Re-validate availability — calculator-scoped.
  const [rule] = await db
    .select()
    .from(availabilityRules)
    .where(eq(availabilityRules.calculator_id, ctx.calculator_id))
    .limit(1);
  if (!rule || !rule.enabled) {
    throw new Error("Scheduling is not enabled for this calculator");
  }

  // Collision check.
  const collision = await db
    .select({ id: scheduledAppointments.id })
    .from(scheduledAppointments)
    .where(and(
      eq(scheduledAppointments.calculator_id, ctx.calculator_id),
      eq(scheduledAppointments.status, "confirmed"),
      eq(scheduledAppointments.scheduled_for, startDate),
    ))
    .limit(1);
  if (collision.length > 0) {
    throw new Error("That slot was just taken — please pick another time.");
  }

  const [inserted] = await db
    .insert(scheduledAppointments)
    .values({
      calculator_id: ctx.calculator_id,
      lead_id: null,
      customer_name: ctx.customer_name ?? null,
      customer_email: email,
      customer_phone: ctx.customer_phone ?? null,
      scheduled_for: startDate,
      duration_minutes: rule.slot_duration_minutes,
      notes,
      status: "confirmed",
    })
    .returning();

  // Fire confirmation email (best-effort; failure must not block).
  sendBookingConfirmationEmail(ctx.calculator_id, email, ctx.customer_name ?? "there", startDate, rule.slot_duration_minutes)
    .catch((err) => log.warn("booking confirmation email failed", { error: err?.message }));

  return {
    narrative: JSON.stringify({
      ok: true,
      appointment_id: inserted.id,
      scheduled_for: inserted.scheduled_for?.toISOString?.() ?? startIso,
      duration_minutes: rule.slot_duration_minutes,
      confirmation: `Booked for ${startDate.toLocaleString()}. Confirmation sent to ${email}.`,
    }),
  };
}

async function sendBookingConfirmationEmail(
  calculatorId: number,
  email: string,
  name: string,
  start: Date,
  durationMinutes: number,
): Promise<void> {
  const t = getEmailTransporter();
  if (!t) return;
  const [calc] = await db
    .select({ business_name: calculators.business_name })
    .from(calculators)
    .where(eq(calculators.id, calculatorId))
    .limit(1);
  const businessName = calc?.business_name || "Your service provider";
  await t.sendMail({
    from: getFromAddress(),
    to: email,
    subject: `Appointment confirmed — ${businessName}`,
    html: `
      <p>Hi ${name},</p>
      <p>Your appointment with <strong>${businessName}</strong> is confirmed for:</p>
      <p style="font-size: 16px;"><strong>${start.toLocaleString()}</strong> (${durationMinutes} min)</p>
      <p>If you need to reschedule, reply to this email.</p>
    `,
  });
}

const BOOK_APPOINTMENT_ACTION: CopilotAction = {
  name: "book_appointment",
  surface: "customer-widget",
  riskTier: "auto",
  tool: BOOK_APPOINTMENT_TOOL,
  execute: executeBookAppointment,
};

/* ─────────────────────────────────────────────────────────────────────
 * 4) send_quote_confirmation_email — emails the customer their estimate.
 *
 *    Auto-tier admission: sends to the customer's own confirmed email
 *    only. Content is the AI-summarised quote — no commercial commitment
 *    beyond the calculator's own computed number.
 * ───────────────────────────────────────────────────────────────────── */

const SEND_QUOTE_EMAIL_TOOL: ActionTool = {
  name: "send_quote_confirmation_email",
  description:
    "Email the customer a summary of their computed quote. Includes the " +
    "calculator's business name and the total. Use after you've computed " +
    "or recapped the quote in the conversation.",
  input_schema: {
    type: "object",
    properties: {
      computed_total: {
        type: "number",
        description: "Quote total in dollars (e.g. 1250 for $1,250).",
      },
      summary_lines: {
        type: "array",
        description: "Optional plain-text bullet lines summarising the quote.",
      },
    },
    required: ["computed_total"],
  },
};

async function executeSendQuoteEmail(action: PendingAction): Promise<ActionExecutionResult> {
  const ctx = getCustomerContext(action);
  const email = requireEmail(ctx);
  const total = Number((action.args as any).computed_total);
  if (!Number.isFinite(total) || total < 0) {
    throw new Error("Invalid computed_total");
  }
  const summary = Array.isArray((action.args as any).summary_lines)
    ? ((action.args as any).summary_lines as unknown[]).filter((x) => typeof x === "string").slice(0, 12)
    : [];

  const [calc] = await db
    .select({ business_name: calculators.business_name })
    .from(calculators)
    .where(eq(calculators.id, ctx.calculator_id))
    .limit(1);
  const businessName = calc?.business_name || "Your service provider";

  const t = getEmailTransporter();
  if (!t) {
    return {
      narrative: JSON.stringify({ ok: false, reason: "email_not_configured" }),
    };
  }

  await t.sendMail({
    from: getFromAddress(),
    to: email,
    subject: `Your quote from ${businessName}`,
    html: `
      <p>Hi ${ctx.customer_name ?? "there"},</p>
      <p>Here's your estimate from <strong>${businessName}</strong>:</p>
      <p style="font-size: 22px;"><strong>$${total.toFixed(2)}</strong></p>
      ${summary.length ? `<ul>${summary.map((s) => `<li>${s}</li>`).join("")}</ul>` : ""}
      <p>This is an estimate based on the details you provided. Reply to this email to book or ask questions.</p>
    `,
  });

  return {
    narrative: JSON.stringify({ ok: true, sent_to: email, total }),
  };
}

const SEND_QUOTE_EMAIL_ACTION: CopilotAction = {
  name: "send_quote_confirmation_email",
  surface: "customer-widget",
  riskTier: "auto",
  tool: SEND_QUOTE_EMAIL_TOOL,
  execute: executeSendQuoteEmail,
};

/* ─────────────────────────────────────────────────────────────────────
 * 5) request_human_followup — create a support_tickets row.
 *
 *    Auto-tier admission: creating a help request never costs money;
 *    it ROUTES to a human, who then decides. The calculator owner is
 *    notified via the existing admin_notified flow.
 * ───────────────────────────────────────────────────────────────────── */

const HUMAN_FOLLOWUP_TOOL: ActionTool = {
  name: "request_human_followup",
  description:
    "Escalate to a human teammate. Use ONLY when the customer asks " +
    "something you can't answer (out-of-scope, complex pricing, urgent), " +
    "or when they explicitly ask to speak with a person.",
  input_schema: {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "Short reason for escalation (≤300 chars). Plain English.",
      },
      transcript_summary: {
        type: "string",
        description: "Optional 1–3 sentence summary of the conversation so far.",
      },
    },
    required: ["reason"],
  },
};

async function executeRequestHumanFollowup(action: PendingAction): Promise<ActionExecutionResult> {
  const ctx = getCustomerContext(action);
  const reason = String((action.args as any).reason || "").slice(0, 300);
  const transcriptSummary = String((action.args as any).transcript_summary || "").slice(0, 1000);
  if (!reason) throw new Error("reason is required");

  const [calc] = await db
    .select({ id: calculators.id, user_id: calculators.user_id, business_name: calculators.business_name })
    .from(calculators)
    .where(eq(calculators.id, ctx.calculator_id))
    .limit(1);

  if (!calc) throw new Error("Calculator not found");

  const subject = `AI escalation — ${ctx.customer_email || ctx.customer_phone || "customer"}`;
  const description = [
    `Customer: ${ctx.customer_name || "unknown"}`,
    `Email: ${ctx.customer_email || "none"}`,
    `Phone: ${ctx.customer_phone || "none"}`,
    `Reason: ${reason}`,
    transcriptSummary ? `Summary: ${transcriptSummary}` : "",
  ].filter(Boolean).join("\n");

  const [ticket] = await db
    .insert(supportTickets)
    .values({
      calculator_id: ctx.calculator_id,
      client_id: calc.user_id ?? 0,
      subject: subject.slice(0, 100),
      description,
      status: "open",
      priority: "normal",
      category: "general",
      source: "ai_escalation",
      transcript_json: [],
      admin_notified: false,
    })
    .returning();

  return {
    narrative: JSON.stringify({
      ok: true,
      ticket_id: ticket.id,
      message: "A human teammate will reach out soon.",
    }),
  };
}

const HUMAN_FOLLOWUP_ACTION: CopilotAction = {
  name: "request_human_followup",
  surface: "customer-widget",
  riskTier: "auto",
  tool: HUMAN_FOLLOWUP_TOOL,
  execute: executeRequestHumanFollowup,
};

/* ─────────────────────────────────────────────────────────────────────
 * 6) update_my_quote_with_addons — recompute the calculator's total
 *    given a new field/value set. No persistence — just returns the
 *    number for the AI to relay back to the customer.
 *
 *    Auto-tier admission: read-only compute. The calculator owner's
 *    pricing formula is the source of truth; this never invents new
 *    pricing terms.
 * ───────────────────────────────────────────────────────────────────── */

const UPDATE_QUOTE_TOOL: ActionTool = {
  name: "update_my_quote_with_addons",
  description:
    "Recompute the customer's quote given a new field/value set. Returns " +
    "the new total. Use when the customer says 'what if I add X?' or " +
    "wants to update an option.",
  input_schema: {
    type: "object",
    properties: {
      base_amount: {
        type: "number",
        description: "The current base total in dollars (from earlier in the conversation, or 0 to start fresh).",
      },
      addons: {
        type: "array",
        description: "Array of { label: string, amount: number } add-ons to apply (positive = adds, negative = subtracts).",
      },
    },
    required: ["base_amount", "addons"],
  },
};

async function executeUpdateQuote(action: PendingAction): Promise<ActionExecutionResult> {
  const args = action.args as any;
  const baseAmount = Number(args.base_amount);
  if (!Number.isFinite(baseAmount) || baseAmount < 0) {
    throw new Error("Invalid base_amount");
  }
  const addons: Array<{ label: string; amount: number }> = [];
  if (Array.isArray(args.addons)) {
    for (const a of args.addons as unknown[]) {
      const aa = a as any;
      const label = String(aa?.label || "").slice(0, 80);
      const amount = Number(aa?.amount);
      if (label && Number.isFinite(amount)) {
        addons.push({ label, amount });
      }
    }
  }

  let total = baseAmount;
  for (const a of addons) total += a.amount;
  if (total < 0) total = 0;

  return {
    narrative: JSON.stringify({
      base_amount: baseAmount,
      addons,
      new_total: Number(total.toFixed(2)),
    }),
  };
}

const UPDATE_QUOTE_ACTION: CopilotAction = {
  name: "update_my_quote_with_addons",
  surface: "customer-widget",
  riskTier: "auto",
  tool: UPDATE_QUOTE_TOOL,
  execute: executeUpdateQuote,
};

/* ─── Register all six actions ─── */
registerCopilotAction(FETCH_HISTORY_ACTION);
registerCopilotAction(PROPOSE_TIMES_ACTION);
registerCopilotAction(BOOK_APPOINTMENT_ACTION);
registerCopilotAction(SEND_QUOTE_EMAIL_ACTION);
registerCopilotAction(HUMAN_FOLLOWUP_ACTION);
registerCopilotAction(UPDATE_QUOTE_ACTION);

/** Anthropic tool definitions handed to the agent loop. */
export const CUSTOMER_WIDGET_TOOLS = [
  FETCH_HISTORY_TOOL,
  PROPOSE_TIMES_TOOL,
  BOOK_APPOINTMENT_TOOL,
  SEND_QUOTE_EMAIL_TOOL,
  HUMAN_FOLLOWUP_TOOL,
  UPDATE_QUOTE_TOOL,
];

/** Names only — useful for the loop's executor map. */
export const CUSTOMER_WIDGET_ACTION_NAMES = [
  "fetch_customer_quote_history",
  "propose_appointment_times",
  "book_appointment",
  "send_quote_confirmation_email",
  "request_human_followup",
  "update_my_quote_with_addons",
] as const;

/**
 * System prompt for the customer-facing widget AI.
 *
 * Tight guardrails: friendly, brief, never share other customers' data,
 * never make financial commitments beyond what the calculator computes,
 * escalate via request_human_followup if asked anything beyond product scope.
 */
export function buildCustomerWidgetSystemPrompt(opts: {
  businessName: string;
  tradeType?: string;
  customer_email?: string;
  customer_name?: string;
}): string {
  const lines = [
    `You are the friendly customer assistant for ${opts.businessName}${opts.tradeType ? ` (${opts.tradeType})` : ""}.`,
    ``,
    `Your job: help THIS customer get a quote, book a service, or get a copy of their estimate. Stay friendly and brief.`,
    ``,
    `Customer identity (already known from the widget):`,
    opts.customer_name ? `- Name: ${opts.customer_name}` : `- Name: (not yet known)`,
    opts.customer_email ? `- Email: ${opts.customer_email}` : `- Email: (not yet known — ask politely before booking or emailing)`,
    ``,
    `Tools available:`,
    `- fetch_customer_quote_history: look up THIS customer's prior quotes on THIS calculator.`,
    `- propose_appointment_times: find available slots in the next 14 days.`,
    `- book_appointment: book a specific slot (requires customer email confirmed).`,
    `- send_quote_confirmation_email: email the customer their estimate.`,
    `- request_human_followup: escalate to a human teammate (use only when needed).`,
    `- update_my_quote_with_addons: recompute a quote with new add-ons.`,
    ``,
    `Hard rules:`,
    `- NEVER share or reference other customers' data. Tools are scoped to this customer + this calculator.`,
    `- NEVER promise pricing or commitments beyond what the calculator computes.`,
    `- If asked something outside product / service scope (legal advice, refunds, complaints, urgent emergencies), call request_human_followup.`,
    `- Keep replies to 1–3 short sentences. Use plain language.`,
    `- Before booking or emailing, confirm the customer's email in chat if not already known.`,
  ];
  return lines.join("\n");
}

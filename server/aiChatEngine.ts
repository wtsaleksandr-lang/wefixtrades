import OpenAI from "openai";
import { calculateEstimate, type EstimateInputs } from "@shared/calculateEstimate";
import { storage } from "./storage";
import type { Calculator } from "@shared/schema";
import { createLogger } from "./lib/logger";

const log = createLogger("AIChatEngine");

const ALLOWED_TOOLS = {
  demo_ai_employee: ["demo_generate_estimate", "demo_show_slots"] as string[],
  platform_support_ai: ["create_support_ticket", "get_account_context"] as string[],
  client_ai_employee: ["generate_estimate", "show_available_slots", "create_booking", "submit_lead"] as string[],
} as const;

export type AgentType = keyof typeof ALLOWED_TOOLS;

const TRADE_PRESETS: Record<string, { rate: number; unit: string; description: string }> = {
  plumbing: { rate: 125, unit: "hour", description: "residential and commercial plumbing" },
  electrical: { rate: 110, unit: "hour", description: "electrical installation and repair" },
  hvac: { rate: 130, unit: "hour", description: "HVAC installation, repair and maintenance" },
  roofing: { rate: 8, unit: "sq ft", description: "roofing installation and repair" },
  painting: { rate: 4, unit: "sq ft", description: "interior and exterior painting" },
  landscaping: { rate: 85, unit: "hour", description: "lawn care and landscaping" },
  cleaning: { rate: 0.12, unit: "sq ft", description: "residential and commercial cleaning" },
  flooring: { rate: 6, unit: "sq ft", description: "flooring installation and repair" },
  default: { rate: 95, unit: "hour", description: "home services" },
};

const DEMO_SLOTS = [
  { date: "tomorrow", time: "9:00 AM", available: true },
  { date: "tomorrow", time: "11:00 AM", available: true },
  { date: "tomorrow", time: "2:00 PM", available: true },
  { date: "in 2 days", time: "10:00 AM", available: true },
  { date: "in 2 days", time: "3:00 PM", available: true },
];

export function buildSystemPrompt(agentType: AgentType, context?: {
  businessName?: string;
  tradeType?: string;
  tradeCategory?: string;
  trainingProfile?: Record<string, any>;
  pricingConfig?: Record<string, any>;
  calculatorStatus?: string;
  /** W-BB-3 — when the calculator is configured with `resultPanel.range_mode`
   *  the AI must speak the price as a range ("$2,400-$2,800") rather than a
   *  pinpoint number, so the chat response matches what the widget renders.
   *  `band_pct` is the ±% band used for the spoken range. */
  priceDisplayMode?: { mode: 'single' | 'range'; band_pct?: number };
}): string {
  // W-BB-3 — shared price-display guidance. When the calculator is in range
  // mode, the AI must speak prices as a range so it matches what the widget
  // renders ($2,400-$2,800 vs $2,500). Empty string when in single mode so
  // the legacy prompt is unchanged.
  const rangeGuidance = context?.priceDisplayMode?.mode === 'range'
    ? `\n\nPRICE DISPLAY MODE: range (±${context.priceDisplayMode.band_pct ?? 8}%). Always quote estimates as a range like "$2,400-$2,800" rather than a single number. The calculator widget shows ranges to reduce buyer commitment anxiety — your replies must match.`
    : '';

  if (agentType === "demo_ai_employee") {
    const category = context?.tradeCategory || "default";
    const preset = TRADE_PRESETS[category] || TRADE_PRESETS.default;
    return `You are a friendly and professional AI assistant demonstrating how an AI employee works for a ${preset.description} business.

You help potential customers by:
- Answering questions about services and pricing
- Generating instant estimates using the demo_generate_estimate tool
- Showing available time slots using the demo_show_slots tool
- Collecting basic lead information

IMPORTANT: This is a DEMO. Always mention this is a sample experience when relevant.
Keep responses concise (2-3 sentences max). Be helpful and conversational.
Current trade category: ${category} (rate ~$${preset.rate}/${preset.unit})${rangeGuidance}`;
  }

  if (agentType === "platform_support_ai") {
    return `You are a helpful platform support agent for QuickQuote, a SaaS tool that helps tradespeople create instant quote calculators.

You help business owners who are using the QuickQuote platform by:
- Answering questions about features, settings, and how to use the platform
- Troubleshooting common issues (slug conflicts, pricing config errors, embedding issues)
- Explaining pricing plans and limitations
- Creating support tickets for complex issues using the create_support_ticket tool
- Getting account context using the get_account_context tool

Context about this user: ${context?.calculatorStatus ? `Calculator status: ${context.calculatorStatus}` : "Status unknown"}
Business: ${context?.businessName || "Unknown"}

Keep responses helpful, concise, and actionable. If you can't resolve an issue, offer to create a support ticket.`;
  }

  if (agentType === "client_ai_employee") {
    const profile = context?.trainingProfile || {};
    const services = Array.isArray(profile.services) ? profile.services.join(", ") : "general services";
    const tone = profile.tone || "professional";
    const businessSummary = profile.business_summary || "";
    const serviceArea = profile.service_area || "";
    const workingHours = profile.working_hours || {};
    const days = Array.isArray(workingHours.days) ? workingHours.days.join(", ") : "Monday–Friday";
    const startTime = workingHours.start_time || "8:00";
    const endTime = workingHours.end_time || "17:00";
    const emergencyService = profile.emergency_service ? "We also offer emergency service." : "";
    const escalationPhone = profile.escalation_phone ? `For urgent matters, call ${profile.escalation_phone}.` : "";

    const toneInstructions: Record<string, string> = {
      professional: "Be professional, courteous, and precise.",
      friendly: "Be warm, friendly, and approachable. Use a conversational tone.",
      direct: "Be direct and to the point. Skip pleasantries.",
      premium: "Be polished, premium, and sophisticated. Convey quality and exclusivity.",
    };

    return `You are an AI assistant for ${context?.businessName || "this business"}.
${businessSummary ? `About us: ${businessSummary}` : ""}
Services: ${services}
${serviceArea ? `Service area: ${serviceArea}` : ""}
Available: ${days}, ${startTime}–${endTime}. ${emergencyService}
${escalationPhone}

${toneInstructions[tone] || toneInstructions.professional}

You can help customers by:
- Answering questions about our services
- Generating instant estimates using the generate_estimate tool
- Showing available appointment slots using the show_available_slots tool
- Booking appointments using the create_booking tool
- Collecting contact information using the submit_lead tool

Keep responses concise (2-4 sentences). Always be helpful and guide customers toward booking or getting a quote.${rangeGuidance}`;
  }

  return "You are a helpful assistant.";
}

const DEMO_TOOL_DEFS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "demo_generate_estimate",
      description: "Generate a demo price estimate based on trade category and quantity",
      parameters: {
        type: "object",
        properties: {
          quantity: { type: "number", description: "Quantity (hours, sq ft, units, etc)" },
          trade_category: { type: "string", description: "Trade category (plumbing, electrical, etc)" },
        },
        required: ["quantity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "demo_show_slots",
      description: "Show available demo appointment slots",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

const SUPPORT_TOOL_DEFS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "create_support_ticket",
      description: "Create a support ticket for complex issues that need human review",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "Description of the issue" },
        },
        required: ["description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_account_context",
      description: "Get account context including calculator status and settings",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

const CLIENT_TOOL_DEFS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "generate_estimate",
      description: "Generate a price estimate based on customer inputs",
      parameters: {
        type: "object",
        properties: {
          quantity: { type: "number", description: "Quantity (hours, sq ft, units, etc)" },
          selected_tier_index: { type: "number", description: "Selected package tier index (0-based)" },
          selected_addon_ids: { type: "array", items: { type: "string" }, description: "IDs of selected add-ons" },
          is_after_hours: { type: "boolean", description: "Whether this is an after-hours request" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "show_available_slots",
      description: "Show available appointment slots for a given date",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date to check (YYYY-MM-DD format or relative like 'tomorrow')" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_booking",
      description: "Create a booking appointment for a customer",
      parameters: {
        type: "object",
        properties: {
          customer_name: { type: "string", description: "Customer full name" },
          customer_email: { type: "string", description: "Customer email" },
          customer_phone: { type: "string", description: "Customer phone" },
          date: { type: "string", description: "Booking date (YYYY-MM-DD)" },
          time: { type: "string", description: "Booking time (HH:MM)" },
          notes: { type: "string", description: "Optional notes" },
        },
        required: ["customer_name", "date", "time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_lead",
      description: "Submit customer contact information as a lead",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Customer name" },
          email: { type: "string", description: "Customer email" },
          phone: { type: "string", description: "Customer phone" },
          quote_amount: { type: "number", description: "Estimated quote amount" },
        },
        required: [],
      },
    },
  },
];

export function getToolDefs(agentType: AgentType): OpenAI.ChatCompletionTool[] {
  if (agentType === "demo_ai_employee") return DEMO_TOOL_DEFS;
  if (agentType === "platform_support_ai") return SUPPORT_TOOL_DEFS;
  if (agentType === "client_ai_employee") return CLIENT_TOOL_DEFS;
  return [];
}

export function enforceToolPermissions(agentType: AgentType, toolName: string): void {
  const allowed = ALLOWED_TOOLS[agentType] as string[];
  if (!allowed.includes(toolName)) {
    throw new Error(`Tool '${toolName}' is not allowed for agent type '${agentType}'`);
  }
}

export async function executeTool(
  agentType: AgentType,
  toolName: string,
  args: Record<string, any>,
  context?: {
    calculatorId?: number;
    calculator?: Calculator;
    tradeCategory?: string;
    sessionId?: string;
  }
): Promise<Record<string, any>> {
  enforceToolPermissions(agentType, toolName);

  if (toolName === "demo_generate_estimate") {
    const category = args.trade_category || context?.tradeCategory || "default";
    const preset = TRADE_PRESETS[category] || TRADE_PRESETS.default;
    const qty = typeof args.quantity === "number" ? args.quantity : 1;
    const estimate = qty * preset.rate;
    const travelFee = 50;
    const total = estimate + travelFee;
    return {
      type: "demo_estimate",
      estimate: `$${estimate.toFixed(0)}`,
      breakdown: [
        { label: `${qty} ${preset.unit}(s) × $${preset.rate}`, amount: estimate },
        { label: "Travel/Service Fee", amount: travelFee },
      ],
      total: `$${total.toFixed(0)}`,
      note: "This is a demo estimate. Real estimates use your actual pricing configuration.",
    };
  }

  if (toolName === "demo_show_slots") {
    return {
      type: "demo_slots",
      slots: DEMO_SLOTS,
      note: "These are demo slots. Real slots come from your booking calendar.",
    };
  }

  if (toolName === "create_support_ticket") {
    const calc = context?.calculator;
    const description = args.description || "No description provided";
    const ticket = await storage.createSupportTicket({
      calculator_id: calc?.id ?? null,
      client_id: 0,
      subject: description.slice(0, 100),
      description,
      source: "ai_escalation",
      status: "open",
    });

    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      try {
        const nodemailer = await import("nodemailer");
        const smtpHost = process.env.SMTP_HOST;
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;
        if (smtpHost && smtpUser && smtpPass) {
          const port = parseInt(process.env.SMTP_PORT || "587", 10);
          const transporter = nodemailer.default.createTransport({
            host: smtpHost, port, secure: port === 465, auth: { user: smtpUser, pass: smtpPass },
          });
          await transporter.sendMail({
            from: process.env.SMTP_FROM || smtpUser,
            to: adminEmail,
            subject: `[Support Ticket #${ticket.id}] ${calc?.business_name || "Unknown"}`,
            text: `A new support ticket has been created.\n\nTicket ID: ${ticket.id}\nBusiness: ${calc?.business_name || "N/A"}\nDescription: ${description}`,
          });
          await storage.updateSupportTicket(ticket.id, { admin_notified: true });
        }
      } catch (err) {
        log.error("Failed to send support ticket email:", { error: String(err) });
      }
    }

    return { ticket_id: ticket.id, status: "created", message: "Support ticket created successfully." };
  }

  if (toolName === "get_account_context") {
    const calc = context?.calculator;
    if (!calc) return { error: "No calculator context available" };
    const settings = (calc.calculator_settings as any) || {};
    const publish = settings.publish || {};
    const deployment = await storage.getDeploymentStatus(calc.id);
    return {
      business_name: calc.business_name,
      trade_type: calc.trade_type,
      slug: calc.slug,
      publish_status: publish.status || "draft",
      deployment_status: deployment?.status || "unknown",
      custom_domain: publish.custom_domain || null,
      custom_domain_status: publish.custom_domain_status || "none",
      pricing_type: (calc.pricing_config as any)?.pricingType || "unknown",
    };
  }

  if (toolName === "generate_estimate") {
    const calc = context?.calculator;
    if (!calc) return { error: "Calculator not found" };
    const inputs: EstimateInputs = {
      quantity: args.quantity,
      selectedTierIndex: args.selected_tier_index,
      selectedAddOnIds: args.selected_addon_ids,
      isAfterHours: args.is_after_hours,
    };
    const result = calculateEstimate(calc.pricing_config, inputs);
    return {
      type: result.type,
      total: result.total,
      rangeMin: result.rangeMin,
      rangeMax: result.rangeMax,
      message: result.message,
      breakdown: result.breakdown,
      callUs: result.callUs,
    };
  }

  if (toolName === "show_available_slots") {
    const calcId = context?.calculatorId;
    if (!calcId) return { slots: [], message: "No calculator context" };
    const dateStr = args.date || new Date().toISOString().split("T")[0];
    const bookings = await storage.getConfirmedBookingsForDate(calcId, dateStr);
    const bookedTimes = new Set(bookings.map(b => b.time));
    const calc = context?.calculator;
    const settings = (calc?.calculator_settings as any) || {};
    const bookingSettings = settings.booking_settings || {};
    const availability = bookingSettings.availability || {};
    const startTimeParts = (availability.start_time || "09:00").split(":");
    const endTimeParts = (availability.end_time || "17:00").split(":");
    const startMinutes = parseInt(startTimeParts[0]) * 60 + parseInt(startTimeParts[1] || "0");
    const endMinutes = parseInt(endTimeParts[0]) * 60 + parseInt(endTimeParts[1] || "0");
    const slotDuration = Math.max(bookingSettings.slot_duration_minutes || 60, 15);

    const slots: { time: string; available: boolean }[] = [];
    for (let m = startMinutes; m < endMinutes; m += slotDuration) {
      const hour = Math.floor(m / 60);
      const minute = m % 60;
      const timeStr = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
      slots.push({ time: timeStr, available: !bookedTimes.has(timeStr) });
    }

    return { date: dateStr, slots: slots.filter(s => s.available) };
  }

  if (toolName === "create_booking") {
    const calcId = context?.calculatorId;
    if (!calcId) return { error: "Calculator not found" };
    if (!args.customer_name || !args.date || !args.time) {
      return { error: "Missing required booking fields: customer_name, date, time" };
    }
    const booking = await storage.createBooking({
      calculator_id: calcId,
      customer_name: args.customer_name,
      customer_email: args.customer_email || null,
      customer_phone: args.customer_phone || null,
      date: args.date,
      time: args.time,
      duration_minutes: 60,
      status: "pending",
      notes: args.notes || null,
    });
    return { booking_id: booking.id, status: "created", message: `Booking confirmed for ${args.date} at ${args.time}.` };
  }

  if (toolName === "submit_lead") {
    const calcId = context?.calculatorId;
    if (!calcId) return { error: "Calculator not found" };
    const lead = await storage.createLead({
      calculator_id: calcId,
      name: args.name || null,
      email: args.email || null,
      phone: args.phone || null,
      quote_amount: args.quote_amount ? Math.round(args.quote_amount) : null,
    });
    return { lead_id: lead.id, status: "submitted", message: "Your information has been submitted. We'll be in touch soon!" };
  }

  return { error: `Unknown tool: ${toolName}` };
}

export async function runChatCompletion(
  openai: OpenAI,
  agentType: AgentType,
  messages: OpenAI.ChatCompletionMessageParam[],
  systemPrompt: string,
  context?: {
    calculatorId?: number;
    calculator?: Calculator;
    tradeCategory?: string;
    sessionId?: string;
  }
): Promise<{ reply: string; toolResults?: any[] }> {
  const toolDefs = getToolDefs(agentType);
  const allMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: allMessages,
    tools: toolDefs.length > 0 ? toolDefs : undefined,
    tool_choice: toolDefs.length > 0 ? "auto" : undefined,
  });

  const choice = response.choices[0];
  const toolResults: any[] = [];

  if (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
    const toolCallMessages: OpenAI.ChatCompletionMessageParam[] = [...allMessages, choice.message];

    for (const tc of choice.message.tool_calls) {
      const tcAny = tc as any;
      const toolName: string = tcAny.function?.name || tcAny.name || "";
      const rawArgs: string = tcAny.function?.arguments || tcAny.arguments || "{}";
      let toolArgs: Record<string, any> = {};
      try {
        toolArgs = JSON.parse(rawArgs);
      } catch {
        toolArgs = {};
      }

      let toolResult: Record<string, any>;
      try {
        enforceToolPermissions(agentType, toolName);
        toolResult = await executeTool(agentType, toolName, toolArgs, context);
      } catch (err: any) {
        toolResult = { error: err.message };
      }

      toolResults.push({ tool: toolName, result: toolResult });
      toolCallMessages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(toolResult),
      });
    }

    const followUp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: toolCallMessages,
    });

    const reply = followUp.choices[0]?.message?.content || "I'm here to help. What can I assist you with?";
    return { reply, toolResults: toolResults.length > 0 ? toolResults : undefined };
  }

  const reply = choice.message?.content || "I'm here to help. What can I assist you with?";
  return { reply, toolResults: toolResults.length > 0 ? toolResults : undefined };
}

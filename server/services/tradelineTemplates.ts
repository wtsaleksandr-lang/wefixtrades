/**
 * TradeLine Assistant Template Engine
 *
 * Deterministic system that generates assistant configurations from
 * trade-specific templates + client onboarding data.
 *
 * Flow: onboarding data → structured config → template selection → merge → final definition
 */

import { storage } from "../storage";
import { advanceSetupStage, computeSetupStage } from "@shared/schema";
import type { TradelineConfig, Client } from "@shared/schema";

/* ═══════════════════════════════════════════
   PART 1 — TRADE TEMPLATES
   ═══════════════════════════════════════════ */

export interface TradeTemplate {
  id: string;
  name: string;
  /** Keywords that match onboarding trade_type to this template */
  matchPatterns: string[];
  systemPromptBase: string;
  defaultTone: "professional" | "friendly" | "casual";
  callFlowNotes: string;
  fallbackBehavior: string;
  bookingBehavior: string;
  escalationRules: string;
  /** Common services to reference if client didn't provide any */
  fallbackServices: string[];
}

const TEMPLATES: Record<string, TradeTemplate> = {
  plumbing: {
    id: "plumbing",
    name: "Plumbing",
    matchPatterns: ["plumb", "plumber", "plumbing", "drain", "pipework", "pipe", "boiler", "heating engineer"],
    systemPromptBase: `You are a knowledgeable assistant for a plumbing business. You understand common plumbing terminology, emergency situations (burst pipes, no hot water, leaks), and standard pricing structures for the trade.`,
    defaultTone: "friendly",
    callFlowNotes: `Emergency calls (burst pipes, flooding, gas smell) should be treated with urgency — confirm the situation, reassure the caller, and escalate immediately. For routine work (dripping taps, toilet repairs, boiler servicing), collect details and offer a callback.`,
    fallbackBehavior: `If you cannot answer a specific technical question, say: "I'll make sure one of our qualified plumbers gets back to you with the exact details."`,
    bookingBehavior: `For emergency work, try to arrange same-day or next-day availability. For routine work, offer the next available slot. Always confirm the address and access arrangements.`,
    escalationRules: `Escalate immediately for: gas leaks (advise caller to call National Gas Emergency first), flooding that risks property damage, or any situation where the caller sounds distressed. Transfer to the escalation number if available.`,
    fallbackServices: ["Emergency plumbing", "Boiler repair & servicing", "Bathroom installation", "Leak detection", "Drain unblocking", "Central heating"],
  },

  electrical: {
    id: "electrical",
    name: "Electrical",
    matchPatterns: ["electri", "electrician", "electrical", "sparky", "wiring", "rewire"],
    systemPromptBase: `You are a knowledgeable assistant for an electrical business. You understand domestic and commercial electrical work, safety regulations, and common issues like tripped circuits, power outages, and rewiring needs.`,
    defaultTone: "professional",
    callFlowNotes: `Safety-critical calls (burning smell, sparking, exposed wires) must be treated as emergencies — advise the caller to turn off the main breaker if safe to do so, then escalate. For quotes and general work, collect job details and property type.`,
    fallbackBehavior: `If asked about specific regulations or Part P compliance details, say: "Our qualified electricians can advise on the exact requirements when they assess your property."`,
    bookingBehavior: `Always ask about the property type (house, flat, commercial) and age of the wiring. For emergency work, prioritize same-day. For planned work, offer available slots.`,
    escalationRules: `Escalate immediately for: burning smells near sockets/fuse boards, sparking or arcing, complete power loss, or any situation involving water near electrics. Advise calling 999 if there's immediate danger.`,
    fallbackServices: ["Rewiring", "Fuse board upgrades", "Socket & switch installation", "Lighting design & install", "Electrical inspections (EICR)", "EV charger installation"],
  },

  hvac: {
    id: "hvac",
    name: "HVAC / Heating & Cooling",
    matchPatterns: ["hvac", "heating", "cooling", "air con", "air conditioning", "ventilation", "heat pump", "furnace"],
    systemPromptBase: `You are a knowledgeable assistant for an HVAC business. You understand heating systems, air conditioning, ventilation, and heat pump technology. You're familiar with seasonal demand patterns and maintenance schedules.`,
    defaultTone: "professional",
    callFlowNotes: `No-heating-in-winter and no-cooling-in-summer calls are time-sensitive — collect system details (gas/electric, make/model if known, age) and property info quickly. For maintenance and installations, take more detailed requirements.`,
    fallbackBehavior: `If asked about specific system compatibility or refrigerant types, say: "Our engineers will confirm the best solution when they assess your system."`,
    bookingBehavior: `For heating emergencies in cold weather, aim for same-day or next-day. For AC installations and maintenance, collect preferred dates and property access info.`,
    escalationRules: `Escalate for: gas smell near boiler (advise calling National Gas Emergency), carbon monoxide alarm sounding (advise leaving the property), or complete heating failure in properties with vulnerable occupants (elderly, children).`,
    fallbackServices: ["Boiler installation & repair", "Air conditioning installation", "Heat pump systems", "Ventilation solutions", "Annual servicing & maintenance", "Thermostat installation"],
  },

  generic: {
    id: "generic",
    name: "General Trades",
    matchPatterns: [],
    systemPromptBase: `You are a helpful assistant for a trades business. You understand the needs of trade customers — they want quick answers, reliable service, and fair pricing.`,
    defaultTone: "friendly",
    callFlowNotes: `Collect the basics: what they need done, where (address), when they'd like it done, and a callback number. Be efficient — tradespeople's customers value their time.`,
    fallbackBehavior: `If you don't know something specific about their trade, say: "I'll make sure the right person gets back to you with the details."`,
    bookingBehavior: `Offer the next available slot. Always confirm the address and any special access requirements (gates, keys, parking).`,
    escalationRules: `Escalate for any situation that sounds like an emergency or where the caller is distressed. Use the escalation number if available, otherwise take details and mark as urgent.`,
    fallbackServices: ["General repairs & maintenance", "Installation work", "Emergency callouts", "Free estimates"],
  },
};

/**
 * Select the best template based on the client's trade type.
 * Falls back to "generic" if no match found.
 */
export function selectTemplate(tradeType?: string | null): TradeTemplate {
  if (!tradeType) return TEMPLATES.generic;

  const lower = tradeType.toLowerCase();
  for (const tmpl of Object.values(TEMPLATES)) {
    if (tmpl.matchPatterns.some(p => lower.includes(p))) {
      return tmpl;
    }
  }
  return TEMPLATES.generic;
}

/** Return all available templates (for admin UI / debugging). */
export function listTemplates(): TradeTemplate[] {
  return Object.values(TEMPLATES);
}

/* ═══════════════════════════════════════════
   PART 2 — ONBOARDING → STRUCTURED CONFIG
   ═══════════════════════════════════════════ */

/**
 * Structured assistant input — the normalized shape that the template
 * engine uses to generate the final assistant definition.
 */
export interface AssistantInput {
  businessName: string;
  tradeType: string | null;
  serviceArea: string | null;
  topServices: string[];
  pricingRanges: string | null;
  tone: "professional" | "friendly" | "casual";
  variant: TradelineConfig["variant"];
  mode: TradelineConfig["currentMode"];
  channels: TradelineConfig["channels"];
  phoneRouting: TradelineConfig["phoneRouting"];
  booking: TradelineConfig["booking"];
  businessHours: TradelineConfig["businessHours"];
  escalationNumber: string | null;
  callbackNumber: string | null;
}

/**
 * Extract structured assistant input from TradeLine config + client data + onboarding responses.
 */
export function buildAssistantInput(
  config: TradelineConfig,
  client: Client,
  responses: Record<string, any> | null,
): AssistantInput {
  const r = responses ?? {};

  // Parse tone from onboarding or template default
  let tone: "professional" | "friendly" | "casual" = "friendly";
  if (r.tone) {
    const raw = String(r.tone).toLowerCase();
    if (raw === "professional") tone = "professional";
    else if (raw === "casual") tone = "casual";
    else tone = "friendly";
  }

  // Parse top services into array
  let topServices: string[] = [];
  if (r.top_services) {
    topServices = String(r.top_services)
      .split(/[,;\n]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  return {
    businessName: r.business_name || client.business_name,
    tradeType: r.trade_type || client.trade_type || null,
    serviceArea: r.service_area || null,
    topServices,
    pricingRanges: r.pricing_ranges || null,
    tone,
    variant: config.variant,
    mode: config.currentMode,
    channels: config.channels,
    phoneRouting: config.phoneRouting,
    booking: config.booking,
    businessHours: config.businessHours,
    escalationNumber: r.escalation_number || null,
    callbackNumber: r.callback_number || null,
  };
}

/* ═══════════════════════════════════════════
   PART 3 — ASSISTANT BUILDER
   ═══════════════════════════════════════════ */

/**
 * Final assistant definition — the output of the template engine.
 * This is what gets pushed to Vapi or used by the conversation handler.
 */
export interface AssistantDefinition {
  /** Full system prompt including template + client-specific details */
  systemPrompt: string;
  /** First message the assistant speaks on a call */
  firstMessage: string;
  /** Which channels are enabled */
  channels: TradelineConfig["channels"];
  /** Behavior rules (serialized for storage/debugging) */
  behaviorRules: {
    callFlow: string;
    fallback: string;
    booking: string;
    escalation: string;
  };
  /** Template that was used */
  templateId: string;
  /** Input hash for change detection */
  inputHash: string;
}

/**
 * Build a complete assistant definition from structured input.
 * Deterministic: same input always produces same output.
 */
export function buildAssistantDefinition(input: AssistantInput): AssistantDefinition {
  const template = selectTemplate(input.tradeType);

  const systemPrompt = buildFullSystemPrompt(input, template);
  const firstMessage = buildFirstMessage(input, template);

  return {
    systemPrompt,
    firstMessage,
    channels: input.channels,
    behaviorRules: {
      callFlow: template.callFlowNotes,
      fallback: template.fallbackBehavior,
      booking: template.bookingBehavior,
      escalation: template.escalationRules,
    },
    templateId: template.id,
    inputHash: computeInputHash(input),
  };
}

function buildFullSystemPrompt(input: AssistantInput, template: TradeTemplate): string {
  const parts: string[] = [];

  // Identity
  parts.push(`You are the AI assistant for ${input.businessName}${input.tradeType ? `, a ${input.tradeType} business` : ""}${input.serviceArea ? ` serving ${input.serviceArea}` : ""}.`);

  // Trade-specific knowledge
  parts.push(template.systemPromptBase);

  // Tone
  const toneGuide: Record<string, string> = {
    professional: "TONE: Professional and courteous. Use proper grammar, avoid slang, but stay warm and approachable.",
    friendly: "TONE: Friendly and warm. Use natural language, contractions are fine, be conversational but not too casual.",
    casual: "TONE: Casual and relaxed. Talk like a mate who happens to know a lot about the trade. Keep it real.",
  };
  parts.push(toneGuide[input.tone]);

  // Services
  const services = input.topServices.length > 0 ? input.topServices : template.fallbackServices;
  parts.push(`\nSERVICES WE OFFER:\n${services.map(s => `- ${s}`).join("\n")}`);

  // Pricing guidance
  if (input.pricingRanges) {
    parts.push(`\nPRICING GUIDANCE: ${input.pricingRanges}\nAlways clarify these are approximate — exact pricing depends on the job.`);
  } else {
    parts.push(`\nPRICING: We don't have fixed prices listed. If asked about cost, say the team will provide an accurate quote after understanding the job.`);
  }

  // Mode-specific behavior
  switch (input.mode) {
    case "available":
      parts.push(`\nCURRENT MODE: AVAILABLE\nThe business owner may answer calls themselves. You are the backup.\n- Be concise — the caller expected a human\n- Collect name, what they need, and a callback number\n- Let them know the team will be in touch shortly`);
      break;
    case "on_the_job":
      parts.push(`\nCURRENT MODE: ON THE JOB\nThe business owner is working and can't take calls right now.\n- Greet warmly and explain the team is out on a job\n- Fully handle intake: name, job details, location, timeline, contact number\n- Answer common questions about services confidently`);
      break;
    case "after_hours":
      parts.push(`\nCURRENT MODE: AFTER HOURS\nThe business is closed for the day.\n- Be helpful but honest about availability\n- Collect name, what they need, preferred callback time\n- Say "first thing tomorrow" or "next business day" — never imply tonight`);
      break;
  }

  // Call flow
  parts.push(`\nCALL FLOW:\n${template.callFlowNotes}`);

  // Booking
  if (input.booking.enabled) {
    const bookingMode = input.booking.mode === "book_if_available"
      ? "You can offer to book them directly into the calendar."
      : "You can take a booking request — the team will confirm it.";
    parts.push(`\nBOOKING: Enabled. ${bookingMode}\n${template.bookingBehavior}`);
  }

  // Escalation
  parts.push(`\nESCALATION RULES:\n${template.escalationRules}`);
  if (input.escalationNumber) {
    parts.push(`Escalation number: ${input.escalationNumber}`);
  }

  // Fallback
  parts.push(`\nWHEN UNSURE:\n${template.fallbackBehavior}`);

  // Voice rules (always present for voice channels)
  if (input.channels.voice || input.channels.websiteVoice) {
    parts.push(`\nVOICE RULES:\n- Keep every response to 1-3 short sentences — callers can't scroll back\n- Use natural spoken language: contractions, simple words\n- Ask one question at a time\n- Mirror the caller's energy`);
  }

  // Identity rules
  parts.push(`\nIMPORTANT:\n- You represent ${input.businessName} — always speak as "we"\n- Never say "I'm an AI" unless directly asked\n- If you don't know something, say "I'll make sure the team gets back to you on that"\n- Always end by confirming next steps`);

  return parts.join("\n\n");
}

function buildFirstMessage(input: AssistantInput, template: TradeTemplate): string {
  const name = input.businessName;

  switch (input.mode) {
    case "available":
      return `Hi, thanks for calling ${name}! How can I help you today?`;
    case "on_the_job":
      return `Hi, thanks for calling ${name}! The team is out on a job right now, but I can absolutely help. What do you need?`;
    case "after_hours":
      return `Hi, thanks for calling ${name}! We're closed for the day, but I can help make sure you're looked after. What do you need?`;
  }
}

/**
 * Compute a deterministic hash from input for change detection.
 * If the hash matches the previous build, no Vapi update is needed.
 */
function computeInputHash(input: AssistantInput): string {
  const crypto = require("crypto");
  const serialized = JSON.stringify(input, Object.keys(input).sort());
  return crypto.createHash("sha256").update(serialized).digest("hex").slice(0, 16);
}

/* ═══════════════════════════════════════════
   PART 3b — HIGH-LEVEL BUILDER
   ═══════════════════════════════════════════ */

export interface BuildResult {
  definition: AssistantDefinition;
  input: AssistantInput;
  skipped: boolean;
  skipReason?: string;
  configUpdated: boolean;
}

/**
 * Build a TradeLine assistant definition for a client service.
 *
 * Lifecycle:
 * 1. Load config + client + onboarding
 * 2. Check safety (manual override, idempotency)
 * 3. Set assistant.status = "building"
 * 4. Build definition
 * 5. On success: status = "built", clear error, store hash/template
 * 6. On failure: status = "failed", store error message
 * 7. Auto-advance setupStage if appropriate
 *
 * Does NOT push to Vapi — call provisionTradeLineAssistant() for that.
 */
export async function buildTradeLineAssistant(
  clientServiceId: number,
): Promise<BuildResult> {
  // 1. Load config
  const cs = await storage.getClientServiceById(clientServiceId);
  if (!cs) throw new Error(`Client service ${clientServiceId} not found`);
  if (!cs.service_id.startsWith("tradeline")) {
    throw new Error(`Service ${cs.service_id} is not a TradeLine service`);
  }

  const config = await storage.getTradeLineConfig(clientServiceId);
  if (!config) throw new Error(`TradeLine config not found for service ${clientServiceId}`);

  // 2. Load client
  const client = await storage.getClientById(cs.client_id);
  if (!client) throw new Error(`Client ${cs.client_id} not found`);

  // 3. Load onboarding answers
  const submissions = await storage.listOnboardingSubmissions(cs.client_id);
  const submission = submissions.find(s => s.client_service_id === clientServiceId);
  const responses = (submission?.responses as Record<string, any>) ?? null;

  // Safety: manual override flag
  if (config.assistant.manualOverride) {
    const input = buildAssistantInput(config, client, responses);
    const definition = buildAssistantDefinition(input);
    return {
      definition,
      input,
      skipped: true,
      skipReason: "Manual override flag is set — will not auto-update",
      configUpdated: false,
    };
  }

  // 4. Build structured input → select template → generate definition
  const input = buildAssistantInput(config, client, responses);
  const definition = buildAssistantDefinition(input);

  // Idempotency: skip if input hash unchanged
  if (config.assistant.inputHash && config.assistant.inputHash === definition.inputHash) {
    return {
      definition,
      input,
      skipped: true,
      skipReason: "Input unchanged (same hash) — no update needed",
      configUpdated: false,
    };
  }

  // 5. Set status to "building"
  await storage.updateTradeLineConfig(clientServiceId, {
    assistant: { status: "building" },
  });

  try {
    // 6. Store successful build
    const newStage = computeSetupStage({ ...config, assistant: { ...config.assistant, status: "built" } });

    await storage.updateTradeLineConfig(clientServiceId, {
      assistant: {
        status: "built",
        templateId: definition.templateId,
        inputHash: definition.inputHash,
        lastBuiltAt: new Date().toISOString(),
        lastBuildError: "",
      },
      setupStage: newStage,
    });

    return {
      definition,
      input,
      skipped: false,
      configUpdated: true,
    };
  } catch (err: any) {
    // 7. Store failure
    await storage.updateTradeLineConfig(clientServiceId, {
      assistant: {
        status: "failed",
        lastBuildError: err.message || "Unknown build error",
      },
    }).catch(() => {}); // Don't let error-logging fail the whole operation

    throw err; // Re-throw so caller knows it failed
  }
}

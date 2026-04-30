/**
 * TradeLine Assistant Template Engine
 *
 * Deterministic system that generates assistant configurations from
 * trade-specific templates + client onboarding data.
 *
 * Flow: onboarding data → structured config → template selection → merge → final definition
 */

import crypto from "crypto";
import { storage } from "../storage";
import { advanceSetupStage, computeSetupStage } from "@shared/schema";
import type { TradelineConfig, Client } from "@shared/schema";
import { getVoicePreset } from "@shared/tradelineVoices";

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

  roofing: {
    id: "roofing",
    name: "Roofing",
    matchPatterns: ["roof", "roofing", "roofer", "shingle", "shingles", "tile roof", "metal roof", "gutter", "downspout", "fascia", "soffit", "skylight"],
    systemPromptBase: `You are a knowledgeable assistant for a roofing business. You understand storm damage, leak diagnosis, shingle and tile types, insurance claim workflows, and the urgency of active leaks.`,
    defaultTone: "professional",
    callFlowNotes: `Active leaks during or after storms are emergencies — confirm the situation, get the address, advise on temporary measures (tarp/bucket placement) if safe, and dispatch as soon as possible. For inspections, replacements, and gutter work, collect detailed property info: approximate roof age, square footage if known, story count, and access notes.`,
    fallbackBehavior: `For specific material recommendations or warranty questions, say: "Our roofers will assess the roof in person and walk you through the best options for your situation."`,
    bookingBehavior: `Active leaks: same-day if possible, otherwise next-day with tarp guidance over the phone. Inspections: within 2-3 days. Estimates and replacements: schedule a property visit first. Always ask if there's an active insurance claim — that changes documentation needs.`,
    escalationRules: `Escalate immediately for: active leaks during ongoing storms, structural sagging visible from inside, electrical wires touching damaged roof areas, or any situation involving water near the electrical panel. For storm-damage callbacks, flag for priority follow-up the next business day.`,
    fallbackServices: ["Roof inspection", "Leak repair", "Shingle replacement", "Full roof replacement", "Gutter installation & cleaning", "Storm damage assessment", "Insurance claim assistance"],
  },

  landscaping: {
    id: "landscaping",
    name: "Landscaping & Lawn Care",
    matchPatterns: ["landscap", "lawn", "garden", "yard", "mowing", "hedge", "tree", "irrigation", "sprinkler", "mulch", "sod", "patio", "hardscap"],
    systemPromptBase: `You are a knowledgeable assistant for a landscaping business. You understand the difference between recurring maintenance (mowing, hedging) and one-time projects (design, installation, hardscaping). You know seasonal demand patterns and common regional considerations.`,
    defaultTone: "friendly",
    callFlowNotes: `First, distinguish maintenance from project work — they have very different timelines and pricing. For maintenance, ask about lot size, frequency preference (weekly/biweekly/monthly), and whether they want full-service or just mowing. For projects, collect scope, rough budget range, and timeline; arrange an in-person consultation.`,
    fallbackBehavior: `For specific plant recommendations or design ideas, say: "Our designers will look at your space and propose options that fit your climate and how you want to use the yard."`,
    bookingBehavior: `Maintenance: try to slot the address into an existing route day for that neighborhood — more efficient routing means better pricing for the customer. Projects: schedule on-site consultation within 5-7 days. Spring and early summer slots fill fast; gently emphasize that to lock in time.`,
    escalationRules: `Escalate for: tree limbs threatening the house or power lines (storm aftermath), irrigation leaks actively flooding the property, or any caller asking for emergency tree removal. For tree work near power lines, advise calling the utility company before any cutting begins.`,
    fallbackServices: ["Weekly lawn maintenance", "Landscape design & installation", "Tree & shrub care", "Irrigation install & repair", "Mulching & seasonal cleanups", "Hardscape installation (patios, walkways)"],
  },

  house_cleaning: {
    id: "house_cleaning",
    name: "House Cleaning",
    matchPatterns: ["clean", "cleaning", "maid", "housekeep", "deep clean", "move-in clean", "move-out clean", "house cleaner"],
    systemPromptBase: `You are a knowledgeable assistant for a house cleaning business. You understand the differences between recurring cleans (weekly, biweekly, monthly), deep cleans, move-in/move-out cleans, and post-construction cleans. You can estimate based on home size and condition.`,
    defaultTone: "friendly",
    callFlowNotes: `Quickly determine the type: recurring service vs one-time. For recurring, ask about home size (bedrooms/bathrooms), frequency, pets, and any specific areas to focus on or skip. For move-in/move-out cleans, confirm timeline (often tied to a lease end or close date) and whether they need deep cleaning for a deposit return.`,
    fallbackBehavior: `For pricing on unusual requests (post-construction, hoarding situations, biohazard), say: "Our team will need to see the space to give you an accurate quote — we can do a quick walkthrough or you can send photos."`,
    bookingBehavior: `Recurring service: offer the next available slot, then lock in the recurring day/time on that route. Move-in/move-out: prioritize date proximity to lease end or closing. Always confirm key/access arrangements and pet info — some teams adjust products for pet-friendly cleaning.`,
    escalationRules: `Escalate for: post-flood, post-fire, or biohazard cleanup requests (refer to specialty restoration if not offered). Also escalate for very large homes (5+ bedrooms) or any commercial space — those need custom quotes from a manager.`,
    fallbackServices: ["Weekly / biweekly recurring cleans", "Deep cleaning", "Move-in / move-out cleaning", "Post-construction cleanup", "One-time spring cleaning", "Eco-friendly cleaning options"],
  },

  pest_control: {
    id: "pest_control",
    name: "Pest Control",
    matchPatterns: ["pest", "exterminat", "bug", "rodent", "rat", "mice", "mouse", "termite", "wasp", "hornet", "bee", "ant", "roach", "cockroach", "bed bug", "spider"],
    systemPromptBase: `You are a knowledgeable assistant for a pest control business. You understand common household pests, treatment timelines, recurring vs one-time treatments, and pet/child safety concerns around chemicals.`,
    defaultTone: "professional",
    callFlowNotes: `Identify the pest first — that drives urgency and treatment type. Wasps and hornets near entry points, rodents inside the home, and bed bugs are higher priority than seasonal ants. Always ask about pets and children (affects product selection). For recurring plans, briefly explain that most pests return without ongoing prevention.`,
    fallbackBehavior: `For identification of unfamiliar pests or specific chemical questions, say: "Send us a photo if you can — our techs can identify it and recommend the safest treatment for your home."`,
    bookingBehavior: `Active stinging insects near doorways, rodents inside, or bed bugs: same-day or next-day. Standard treatments: within 3-5 days. Always ask if anyone in the household has chemical sensitivities, pregnancy considerations, or pets that can't be safely relocated during treatment.`,
    escalationRules: `Escalate immediately for: large wasp/hornet nests near building entrances (allergic reaction risk), confirmed bed bug infestations (need specialized treatment protocols), or any caller mentioning chemical exposure symptoms. For visible termite damage that's already structural, mention that a structural inspection may also be needed.`,
    fallbackServices: ["Recurring pest prevention plans", "One-time treatments", "Termite inspection & treatment", "Bed bug treatment", "Rodent exclusion", "Bee & wasp removal", "Eco-friendly / pet-safe options"],
  },

  painting: {
    id: "painting",
    name: "Painting",
    matchPatterns: ["paint", "painter", "painting", "interior paint", "exterior paint", "stain", "primer", "wallpaper"],
    systemPromptBase: `You are a knowledgeable assistant for a painting business. You understand interior vs exterior work, the importance of surface prep, weather considerations for exterior jobs, and color consultation as a value-add.`,
    defaultTone: "friendly",
    callFlowNotes: `First distinguish interior vs exterior — they're very different scopes. For interior, ask about rooms, ceiling height, and condition (existing paint, repairs needed). For exterior, ask about square footage, stories, surface material (wood, stucco, vinyl, brick), and approximately when it was last painted. Always ask whether they want color consultation or have colors already chosen.`,
    fallbackBehavior: `For specific paint product recommendations, say: "Our crew will recommend products based on the surface and your goals — durability, sheen, low-VOC, that kind of thing."`,
    bookingBehavior: `Interior: schedule a quote visit within a week. Exterior: same, but flag weather windows — temperature and humidity matter for application. For commercial or multi-day projects, set expectations on timeline upfront. Always confirm whether furniture or items need to be moved.`,
    escalationRules: `Escalate for: lead paint concerns in homes built before 1978 (requires certified handling), mold or mildew visible on surfaces (needs remediation before painting), or active water damage that hasn't been fixed. Don't quote without seeing the space when any of these come up.`,
    fallbackServices: ["Interior painting", "Exterior painting", "Cabinet refinishing", "Deck & fence staining", "Color consultation", "Wallpaper removal", "Drywall repair & priming"],
  },

  garage_door: {
    id: "garage_door",
    name: "Garage Door",
    matchPatterns: ["garage door", "garage", "opener", "spring", "torsion", "garage repair", "overhead door"],
    systemPromptBase: `You are a knowledgeable assistant for a garage door business. You understand that broken springs and stuck doors are emergencies (security plus vehicle access), the difference between opener problems and door problems, and common brands (LiftMaster, Genie, Chamberlain).`,
    defaultTone: "professional",
    callFlowNotes: `Triage urgency immediately: a door stuck open is a security risk, and a door stuck closed means no vehicle access — both are emergencies. Broken torsion springs are the most common cause. For opener problems, ask about brand and symptoms (won't open, makes noise, remote not working). Important: never advise the caller to attempt a spring repair themselves — torsion springs are under extreme tension and dangerous.`,
    fallbackBehavior: `For specific part identification, say: "Our tech will identify the exact part on-site — most repairs are completed in one visit if we have the parts on the truck."`,
    bookingBehavior: `Broken springs or stuck doors: same-day if possible. Opener replacements: within 2-3 days. New door installation: schedule a measurement visit first. Always confirm the door size (single or double) and material (wood, steel, aluminum).`,
    escalationRules: `Escalate immediately for: door fully off the tracks (safety risk), spring that snapped while someone was nearby (check for injury), or a door that slammed shut on a vehicle or person. Never, ever advise DIY spring repair — caller could be seriously injured.`,
    fallbackServices: ["Broken spring replacement", "Opener repair & installation", "Panel replacement", "Track repair & alignment", "Cable & roller replacement", "New garage door installation", "Smart opener upgrades"],
  },

  appliance_repair: {
    id: "appliance_repair",
    name: "Appliance Repair",
    matchPatterns: ["appliance", "fridge", "refrigerator", "freezer", "dishwasher", "washer", "dryer", "oven", "stove", "range", "microwave", "garbage disposal"],
    systemPromptBase: `You are a knowledgeable assistant for an appliance repair business. You understand common appliance brands (Whirlpool, GE, Samsung, LG, KitchenAid, Bosch, Maytag), typical failure modes, and how to weigh repair vs replace based on age and cost.`,
    defaultTone: "professional",
    callFlowNotes: `Get the appliance type, brand, model number if available (often on a sticker inside the door or behind the unit), and the symptom in plain language ("not cooling", "leaking from bottom", "won't drain"). Brand and model help us pre-stock likely parts. For appliances over 10 years old, tactfully mention that repair-vs-replace is worth a quick conversation.`,
    fallbackBehavior: `For diagnostic questions or part availability, say: "Our tech will diagnose on-site and tell you exactly what's needed — we keep common parts on the truck and can quote any special-order parts on the spot."`,
    bookingBehavior: `Refrigerator or freezer not cooling: same-day or next-day (food spoilage risk). Washer that's actively flooding: same-day. Most other repairs: within 2-3 days. Always confirm the brand — Samsung and LG sometimes need specific tools or have longer parts lead times.`,
    escalationRules: `Escalate for: gas appliances with a gas smell (advise calling the gas company first), electrical sparking from any appliance (advise unplugging it immediately), or water damage from a leaking appliance affecting flooring or rooms below. For built-in appliances, flag that removal and reinstall may need a second visit.`,
    fallbackServices: ["Refrigerator & freezer repair", "Dishwasher repair", "Washer & dryer repair", "Oven & stove repair", "Microwave repair (countertop & built-in)", "Garbage disposal repair & install", "Repair vs replace consultation"],
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
  // Voice & personality settings (affect prompt + Vapi voice config)
  voicePresetId: string;
  personalityTone: "friendly" | "professional" | "direct";
  humor: "off" | "light";
  profanity: boolean;
  language: string;
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

  // Map personality.tone → legacy tone field for backward compat
  const personalityTone = config.personality?.tone || "friendly";
  const mappedTone = personalityTone === "direct" ? "professional" : personalityTone;

  return {
    businessName: r.business_name || client.business_name,
    tradeType: r.trade_type || client.trade_type || null,
    serviceArea: r.service_area || null,
    topServices,
    pricingRanges: r.pricing_ranges || null,
    tone: mappedTone as "professional" | "friendly" | "casual",
    variant: config.variant,
    mode: config.currentMode,
    channels: config.channels,
    phoneRouting: config.phoneRouting,
    booking: config.booking,
    businessHours: config.businessHours,
    escalationNumber: r.escalation_number || null,
    callbackNumber: r.callback_number || null,
    voicePresetId: config.voice?.presetId || "professional-female",
    personalityTone: personalityTone,
    humor: config.personality?.humor || "off",
    profanity: config.personality?.profanity ?? false,
    language: config.personality?.language || "en",
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
  /** Voice config for Vapi push */
  voiceConfig: {
    provider: string;
    voiceId: string;
  };
  /** Transcriber language for Vapi */
  transcriberLanguage: string;
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

  // Resolve voice preset to provider + voiceId
  const voicePreset = getVoicePreset(input.voicePresetId);

  // Map language code to Deepgram-compatible transcriber language
  const transcriberLangMap: Record<string, string> = { en: "en", es: "es", fr: "fr" };

  return {
    systemPrompt,
    firstMessage,
    channels: input.channels,
    voiceConfig: {
      provider: voicePreset.provider,
      voiceId: voicePreset.voiceId,
    },
    transcriberLanguage: transcriberLangMap[input.language] || "en",
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

  // Tone (from personality.tone, mapped through input.personalityTone)
  const toneGuide: Record<string, string> = {
    professional: "TONE: Professional and courteous. Use proper grammar, avoid slang, but stay warm and approachable.",
    friendly: "TONE: Friendly and warm. Use natural language, contractions are fine, be conversational but not too casual.",
    direct: "TONE: Direct and efficient. Keep answers short, get to the point quickly, be respectful but don't over-explain.",
    casual: "TONE: Casual and relaxed. Talk like a mate who happens to know a lot about the trade. Keep it real.",
  };
  parts.push(toneGuide[input.personalityTone] || toneGuide[input.tone]);

  // Humor
  if (input.humor === "light") {
    parts.push("HUMOR: You can be subtly warm and add light humor when appropriate — brief, friendly asides only. Never be goofy or make jokes.");
  }

  // Profanity
  if (!input.profanity) {
    parts.push("LANGUAGE: Do not use any profanity, swearing, or crude language.");
  }

  // Language preference
  if (input.language && input.language !== "en") {
    const langNames: Record<string, string> = { es: "Spanish", fr: "French" };
    const langName = langNames[input.language] || input.language;
    parts.push(`LANGUAGE PREFERENCE: Respond in ${langName} when possible. If the caller speaks English, match their language.`);
  }

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

  // Spanish greetings
  if (input.language === "es") {
    switch (input.mode) {
      case "available":
        return `Hola, gracias por llamar a ${name}! En que puedo ayudarle hoy?`;
      case "on_the_job":
        return `Hola, gracias por llamar a ${name}! El equipo esta en un trabajo ahora mismo, pero puedo ayudarle. Que necesita?`;
      case "after_hours":
        return `Hola, gracias por llamar a ${name}! Estamos cerrados por hoy, pero puedo ayudarle. Que necesita?`;
    }
  }

  // French greetings
  if (input.language === "fr") {
    switch (input.mode) {
      case "available":
        return `Bonjour, merci d'avoir appele ${name}! Comment puis-je vous aider aujourd'hui?`;
      case "on_the_job":
        return `Bonjour, merci d'avoir appele ${name}! L'equipe est en intervention, mais je peux vous aider. De quoi avez-vous besoin?`;
      case "after_hours":
        return `Bonjour, merci d'avoir appele ${name}! Nous sommes fermes pour la journee, mais je peux vous aider. De quoi avez-vous besoin?`;
    }
  }

  // English greetings (default) — adapt to tone
  if (input.personalityTone === "direct") {
    switch (input.mode) {
      case "available":
        return `${name}, how can I help?`;
      case "on_the_job":
        return `${name}, the team's on a job. How can I help?`;
      case "after_hours":
        return `${name}, we're closed for the day. What do you need?`;
    }
  }

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
    assistant: {
      ...config.assistant,
      status: "building",
    },
  });

  try {
    // 6. Store successful build
    const newStage = computeSetupStage({ ...config, assistant: { ...config.assistant, status: "built" } });

    await storage.updateTradeLineConfig(clientServiceId, {
      assistant: {
        ...config.assistant,
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
        ...config.assistant,
        status: "failed",
        lastBuildError: err.message || "Unknown build error",
      },
    }).catch(() => {}); // Don't let error-logging fail the whole operation

    throw err; // Re-throw so caller knows it failed
  }
}

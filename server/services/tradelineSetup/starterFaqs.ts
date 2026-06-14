/**
 * Day-one TradeLine starter FAQ knowledge.
 *
 * Both launch audits flagged the same #1 gap: the moment a TradeLine assistant
 * goes live it knows almost nothing about the business — onboarding only ever
 * captured business_name / trade_type / service_area and created ZERO knowledge
 * rows. A caller who asks "do you offer free estimates?" or "are you licensed?"
 * got a blank. This module seeds a small, honest starter FAQ set so the
 * receptionist can answer the universal first-call questions from minute one.
 *
 * HONESTY DISCIPLINE (non-negotiable — see the brief + clientKnowledge audience
 * notes):
 *   - Answers are GENERIC-SAFE DEFAULTS templated from the owner's ACTUAL
 *     onboarding answers (service area, hours, trade) — never fabricated
 *     specifics. Where a specific isn't known (exact pricing, a guarantee, a
 *     license number), the answer DEFERS ("we'll confirm exact pricing on a
 *     quick call") instead of inventing a number or a promise.
 *   - Every row is CUSTOMER audience tier (the assistant speaks these to the
 *     owner's customers). None are internal.
 *   - Every row is marked `source: 'starter_default'` so the owner can see,
 *     edit, or override them in the portal KB, and so they're clearly distinct
 *     from owner-entered knowledge. The marker is carried in the row id prefix
 *     (see kbSeeding.ts) since the tradeline_knowledge_base schema has no
 *     dedicated source column — the deterministic id (`kbd:<client>:<key>`)
 *     IS the provenance + the idempotency key.
 *
 * These rows flow to the live assistant through the EXISTING knowledge path:
 * they're written into `tradeline_knowledge_base` (kind='faq', status='active'),
 * which `clientKnowledge.assembleClientKnowledge({audience:'customer'})` already
 * loads (loadKbEntries) and renders into the customer business-knowledge block
 * that both the voice (vapiService → ctx.assembledKnowledgeBlock) and chat
 * (tradelineWidgetRoutes) prompts inject. No voice/prompt file is edited.
 */

import { selectTemplate } from "../tradelineTemplates";

/* ─── Canonical question keys (stable — also the row-id suffix + override key) ─ */

/**
 * The universal first-call questions a receptionist must be able to answer.
 * Each key is STABLE: it's both the idempotency suffix of the starter row id
 * (`kbd:<clientId>:<key>`) AND the join key an owner onboarding answer overrides
 * on (an owner-provided "hours" answer supersedes the starter "hours" default).
 */
export const STARTER_FAQ_KEYS = [
  "services_offered",
  "service_area",
  "hours",
  "free_estimates",
  "licensed_insured",
  "emergencies",
  "how_to_book",
  "payment_methods",
  "response_time",
] as const;

export type StarterFaqKey = (typeof STARTER_FAQ_KEYS)[number];

/* ─── The honest facts a starter answer may template from ─────────────────── */

/**
 * Owner-known facts pulled from onboarding. Every field is OPTIONAL — when a
 * fact is absent the answer DEFERS rather than inventing one. `tradeType` picks
 * the per-trade emergency posture + service phrasing via selectTemplate.
 */
export interface StarterFaqFacts {
  businessName?: string | null;
  tradeType?: string | null;
  /** e.g. "the greater Springfield area" — owner's service_area answer. */
  serviceArea?: string | null;
  /** Human-readable hours the owner typed, e.g. "Mon–Fri 8am–5pm". */
  hoursText?: string | null;
  /** Whether online/calendar booking is enabled (from booking_enabled). */
  bookingEnabled?: boolean | null;
  /** Owner-listed services, when provided as free text / list. */
  servicesText?: string | null;
}

export interface StarterFaqRow {
  key: StarterFaqKey;
  title: string;
  /** Markdown body — the answer the assistant speaks. */
  content: string;
}

/* ─── Per-trade emergency posture ────────────────────────────────────────── */

/**
 * Trades where after-hours / same-day emergency response is a genuine, common
 * expectation (gas, water, power, lockouts, etc.). Keyed by the canonical
 * template id from selectTemplate. Everything not listed defaults to the
 * conservative "we prioritize urgent issues — call and we'll do our best to fit
 * you in" phrasing (never promises 24/7 a non-emergency trade can't honor).
 */
const EMERGENCY_TRADES: Record<string, string> = {
  plumbing: "Yes — burst pipes, major leaks, no-water, and sewage backups are emergencies we prioritize. Call us right away and we'll get you the soonest available technician.",
  hvac: "Yes — no-heat in winter and no-cooling in extreme heat are treated as urgent. Call us and we'll prioritize getting someone out as soon as possible.",
  electrical: "Yes — sparking outlets, a burning smell, or a buzzing panel are urgent and we prioritize them. If you smell burning or see smoke or flames, hang up and call 911 first.",
  garage_door: "Yes — a door stuck open (a security risk) or a car trapped inside are urgent and we'll prioritize them.",
  locksmith: "Yes — lockouts and break-in security issues are exactly what we handle urgently. Call and we'll get someone to you as soon as possible.",
  water_damage_restoration: "Yes — active water damage is time-sensitive and we respond urgently, day or night, to limit the damage.",
  septic_services: "Yes — a backing-up or overflowing septic system is an emergency we prioritize.",
  sewer_drain: "Yes — a sewage backup is an emergency we prioritize. Call us right away.",
  well_water: "Yes — a sudden loss of water is urgent and we prioritize it.",
  roofing: "Yes — an active roof leak during a storm is urgent and we'll prioritize a tarp-and-protect visit.",
  appliance_repair: "Yes — food-loss (fridge/freezer) and safety issues are prioritized. If you smell gas or burning, unplug the unit and call us right away.",
};

const DEFAULT_EMERGENCY_ANSWER =
  "We do our best to prioritize urgent issues. Give us a call, describe what's going on, and we'll fit you in as soon as we can.";

/* ─── Small templating helpers (defer-on-unknown is the whole point) ─────── */

function trimOrNull(s: string | null | undefined): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t.length > 0 ? t : null;
}

function businessLabel(facts: StarterFaqFacts): string {
  return trimOrNull(facts.businessName) ?? "our team";
}

/* ─── Per-key answer builders ────────────────────────────────────────────── */

function answerServicesOffered(facts: StarterFaqFacts): string {
  const services = trimOrNull(facts.servicesText);
  if (services) {
    return `We offer: ${services}. If you're not sure whether we cover what you need, just ask and we'll let you know.`;
  }
  const template = selectTemplate(trimOrNull(facts.tradeType));
  const trade = trimOrNull(facts.tradeType);
  const examples = template.fallbackServices.slice(0, 5).join(", ");
  if (template.id !== "generic" && examples) {
    return `We're a ${trade ?? template.name.toLowerCase()} company. Common jobs we handle include ${examples}, and more. Tell me what you need and I'll confirm we cover it — or take your details so the team can follow up.`;
  }
  return `Tell me a bit about what you need and I'll confirm whether we handle it, or take your details so the team can follow up with exactly what we offer.`;
}

function answerServiceArea(facts: StarterFaqFacts): string {
  const area = trimOrNull(facts.serviceArea);
  if (area) {
    return `We serve ${area}. If you're near the edge of that, give me your address or ZIP and I'll check whether we can come to you.`;
  }
  return `Let me know your address or ZIP code and I'll confirm whether you're within our service area — or take your details so the team can confirm.`;
}

function answerHours(facts: StarterFaqFacts): string {
  const hours = trimOrNull(facts.hoursText);
  if (hours) {
    return `Our hours are ${hours}. You can leave a message or request a callback any time and we'll get back to you.`;
  }
  return `I can take your request any time. For our exact business hours I'll have the team confirm — meanwhile I can capture your details and what you need.`;
}

function answerFreeEstimates(facts: StarterFaqFacts): string {
  // NEVER assert "free" — many trades charge a diagnostic/trip fee. Defer.
  return `Estimate and pricing details depend on the job. The best way to get an accurate answer is a quick call — share what you need and I'll arrange for ${businessLabel(facts)} to confirm whether there's any estimate or service fee before any work begins.`;
}

function answerLicensedInsured(facts: StarterFaqFacts): string {
  // NEVER fabricate a license number or insurance amount. Reassure + defer.
  return `That's an important question. I'll have ${businessLabel(facts)} confirm our licensing and insurance details for your peace of mind — I can pass along any specifics you'd like to see.`;
}

function answerEmergencies(facts: StarterFaqFacts): string {
  const template = selectTemplate(trimOrNull(facts.tradeType));
  return EMERGENCY_TRADES[template.id] ?? DEFAULT_EMERGENCY_ANSWER;
}

function answerHowToBook(facts: StarterFaqFacts): string {
  if (facts.bookingEnabled === true) {
    return `I can book you right now — just tell me what you need and your preferred day or time, and I'll find an available slot. I'll confirm the details before we lock it in.`;
  }
  return `I can take down what you need along with your name, number, and preferred time, and make sure ${businessLabel(facts)} reaches out to get you scheduled.`;
}

function answerPaymentMethods(facts: StarterFaqFacts): string {
  // No fabricated specifics — common defaults framed as "typically" + defer.
  return `Most jobs can be paid by card, check, or cash. I'll have ${businessLabel(facts)} confirm the exact accepted payment methods and any deposit before work begins.`;
}

function answerResponseTime(facts: StarterFaqFacts): string {
  return `We aim to follow up quickly — usually the same or next business day, and sooner for urgent issues. Leave your details and the best way to reach you, and we'll be in touch as soon as we can.`;
}

const ANSWER_BUILDERS: Record<StarterFaqKey, (f: StarterFaqFacts) => string> = {
  services_offered: answerServicesOffered,
  service_area: answerServiceArea,
  hours: answerHours,
  free_estimates: answerFreeEstimates,
  licensed_insured: answerLicensedInsured,
  emergencies: answerEmergencies,
  how_to_book: answerHowToBook,
  payment_methods: answerPaymentMethods,
  response_time: answerResponseTime,
};

const TITLES: Record<StarterFaqKey, string> = {
  services_offered: "What services do you offer?",
  service_area: "What areas do you serve?",
  hours: "What are your hours?",
  free_estimates: "Do you offer free estimates?",
  licensed_insured: "Are you licensed and insured?",
  emergencies: "Do you handle emergencies?",
  how_to_book: "How do I book an appointment?",
  payment_methods: "What forms of payment do you accept?",
  response_time: "How quickly will I hear back?",
};

/* ─── Public builder ─────────────────────────────────────────────────────── */

/**
 * Build the full per-trade starter FAQ set from the owner's known facts. Every
 * answer is either templated from a real onboarding answer or a generic-safe
 * deferral — there are NO fabricated prices, guarantees, or license numbers.
 * Deterministic in (facts) → same rows, so re-seeding is a stable upsert.
 */
export function buildStarterFaqs(facts: StarterFaqFacts): StarterFaqRow[] {
  return STARTER_FAQ_KEYS.map((key) => ({
    key,
    title: TITLES[key],
    content: ANSWER_BUILDERS[key](facts),
  }));
}

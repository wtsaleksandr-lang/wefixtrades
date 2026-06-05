/**
 * Inbound message classifier.
 *
 * Used by Twilio SMS handlers and the brand's TradeLine assistant to decide
 * what to do with each inbound message:
 *
 *   - "legitimate"     → reply normally
 *   - "spam"           → silently drop (no reply, no ticket)
 *   - "out_of_scope"   → polite "we don't do that" reply, no ticket
 *   - "needs_human"    → create a support ticket and tell the caller
 *
 * The classifier uses the Claude haiku model for speed + low cost. Falls back
 * to heuristic rules when the API is unreachable so we never block on it.
 */

import { chat } from "./aiService";
import { storage } from "../storage";
import { db } from "../db";
import { clients } from "@shared/schemas/adminCrm";
import { eq } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("InboundClassifier");

const INTERNAL_CLIENT_NAME = "WeFixTrades · Internal";
let _internalClientIdCache: number | null = null;

export async function getOrCreateInternalClientId(): Promise<number> {
  if (_internalClientIdCache) return _internalClientIdCache;
  const [existing] = await db.select().from(clients).where(eq(clients.business_name, INTERNAL_CLIENT_NAME)).limit(1);
  if (existing) {
    _internalClientIdCache = existing.id;
    return existing.id;
  }
  const [created] = await db.insert(clients).values({
    business_name: INTERNAL_CLIENT_NAME,
    contact_email: "support@wefixtrades.com",
    status: "active",
    actor_type: "system",
  } as any).returning();
  _internalClientIdCache = created.id;
  log.info("[classifier] created internal pseudo-client", { id: created.id });
  return created.id;
}

export type InboundCategory = "legitimate" | "spam" | "out_of_scope" | "needs_human";

interface ClassifyResult {
  category: InboundCategory;
  confidence: number;
  reason: string;
}

const SPAM_HEURISTICS = [
  /\b(crypto|bitcoin|forex|investment opportunity)\b/i,
  /\b(SEO services|link building|backlinks)\b/i,
  /\b(loan|debt consolidation|payday)\b/i,
  /https?:\/\/[^\s]+\.(top|xyz|click|buzz|tk|ml|cn)\b/i,
  /\b(viagra|cialis|pharmacy|pharma)\b/i,
  /\bclick\s+(here|now)\b/i,
];

/** Life-safety keywords — must be checked BEFORE the AI model call so an API
 *  timeout can never cause an emergency to be routed as a normal sales lead. */
const EMERGENCY_PATTERNS = [
  /\b(gas\s*leak|smell(ing|s)?\s*gas|carbon\s*monoxide|co\s*alarm)\b/i,
  /\b(house\s*(is\s*)?on\s*fire|flames?|active\s*fire|smoke\s*(everywhere|coming))\b/i,
  /\b(electric(al)?\s*(shock|fire|danger)|downed?\s*(power\s*)?line|live\s*wire)\b/i,
  /\b(structural\s*collapse|flood(ing)?\s*(near|around)\s*electric)\b/i,
  /\b(call\s*911|need\s*(an?\s*)?ambulance|someone('s)?\s*(hurt|injured|unconscious))\b/i,
];

function heuristicCheck(text: string): ClassifyResult | null {
  // Emergency detection — highest priority, before spam checks.
  for (const re of EMERGENCY_PATTERNS) {
    if (re.test(text)) {
      return { category: "needs_human", confidence: 1.0, reason: `emergency keyword detected: ${re}` };
    }
  }
  for (const re of SPAM_HEURISTICS) {
    if (re.test(text)) {
      return { category: "spam", confidence: 0.95, reason: `matched spam pattern ${re}` };
    }
  }
  return null;
}

/**
 * Classify an inbound message. Cheap, fast, and never throws — always returns
 * something even if AI + DB are down.
 */
export async function classifyInbound(text: string, opts?: { from?: string }): Promise<ClassifyResult> {
  const trimmed = (text || "").trim();
  if (!trimmed) return { category: "spam", confidence: 1.0, reason: "empty" };

  // 1. Cheap rule-based pre-check — kills obvious spam without an LLM call.
  const heuristic = heuristicCheck(trimmed);
  if (heuristic) return heuristic;

  // 2. Claude haiku classification.
  try {
    const respText = await chat({
      modelOverride: "claude-haiku-4-5-20251001",
      maxTokens: 80,
      system: `You classify inbound messages to a trades-business platform (WeFixTrades — sells digital tools to plumbers, electricians, roofers, etc.).

Reply with ONE LINE of JSON:
{"category":"legitimate"|"spam"|"out_of_scope"|"needs_human","confidence":0.0-1.0,"reason":"..."}

Categories:
- legitimate: a real prospect or customer about our products / pricing / a tradesperson's question
- spam: cold outreach, crypto/loan/pharma, link-bait, scrapers, anything not a genuine inquiry
- out_of_scope: a legitimate human asking for something we don't do (e.g. "fix my plumbing" — we sell tools, not the trade itself)
- needs_human: legitimate but complex, sensitive, complaint-flavored, or asking for something the AI shouldn't auto-handle`,
      messages: [
        {
          role: "user",
          content: `Inbound message:\n"""\n${trimmed.slice(0, 1200)}\n"""`,
        },
      ],
      surface: "inbound_classifier",
    });

    const json = respText.trim().match(/\{[\s\S]*\}/)?.[0];
    if (!json) throw new Error("no JSON in response");
    const parsed = JSON.parse(json);
    if (!parsed.category) throw new Error("no category");

    return {
      category: parsed.category as InboundCategory,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
      reason: parsed.reason || "model classification",
    };
  } catch (err: any) {
    log.warn("[classifier] fell back to legitimate after AI error", { error: err.message, from: opts?.from });
    // Conservative default: assume legitimate so we don't drop real customers
    return { category: "legitimate", confidence: 0.4, reason: `fallback (${err.message})` };
  }
}

/**
 * Escalate an inbound contact to a human via the support-ticket system.
 *
 * Uses the existing supportTickets table — same path as portal-submitted
 * tickets. The ticket appears in /admin/crm/support and triggers the same
 * notifications as a normal escalation.
 */
export async function escalateToHuman(input: {
  channel: "voice" | "sms" | "chat";
  fromIdentity: string;        // phone number or email
  message: string;
  reason: "needs_human" | "availability_off" | "emergency";
  category?: string;
  metadata?: Record<string, any>;
}): Promise<{ ticketId: number | null }> {
  try {
    const subject =
      input.reason === "emergency"
        ? `[EMERGENCY] Inbound ${input.channel} — life-safety keywords detected`
        : input.reason === "availability_off"
        ? `[Auto] Inbound ${input.channel} — team unavailable`
        : `[Auto] Inbound ${input.channel} needs human review`;

    const body = [
      `Channel:  ${input.channel}`,
      `From:     ${input.fromIdentity}`,
      `Reason:   ${input.reason}`,
      input.category ? `Category: ${input.category}` : null,
      "",
      "Message:",
      input.message.slice(0, 4000),
    ].filter(Boolean).join("\n");

    // Brand-side ticket needs a client_id (schema is NOT NULL). Look up or
    // create a single internal pseudo-client so escalations from the brand's
    // own line have somewhere to land.
    const internalClientId = await getOrCreateInternalClientId();

    const ticket = await storage.createSupportTicket({
      client_id: internalClientId,
      subject,
      description: body,
      category: input.reason === "emergency" ? "urgent" : input.reason === "availability_off" ? "general" : "service",
      priority: input.reason === "emergency" ? "urgent" : "high",
      status: "open",
      source: "ai_escalation",
    } as any);

    log.info("[classifier] escalated to ticket", { ticketId: ticket?.id, channel: input.channel, reason: input.reason });
    return { ticketId: ticket?.id ?? null };
  } catch (err: any) {
    log.error("[classifier] escalation failed", { error: err.message, channel: input.channel });
    return { ticketId: null };
  }
}

/**
 * Pure decision logic (no I/O — unit-testable). Maps a classification +
 * availability to an action.
 *
 * `keepComplexInline` is the Riley-closer knob: when true, a `needs_human`
 * (hot but complex) caller while the brand is AVAILABLE stays inline ("reply")
 * to be closed by the agent, instead of dead-ending into a ticket nobody
 * actions. Availability-off always tickets (take a message); spam/out_of_scope
 * are unaffected. Default false preserves the original SMS/chat behaviour.
 *
 * Life-safety override: when confidence === 1.0 (emergency keyword heuristic),
 * the action is always "emergency" — a hardcoded 911 message that bypasses the
 * LLM entirely. This takes priority over keepComplexInline AND availability.
 */
export function resolveInboundAction(opts: {
  category: InboundCategory;
  isAvailable: boolean;
  keepComplexInline?: boolean;
  confidence?: number;
}): "reply" | "drop" | "polite_decline" | "ticket" | "emergency" {
  if (opts.category === "spam") return "drop";
  if (opts.category === "out_of_scope") return "polite_decline";
  // Life-safety: emergency keyword heuristic (confidence 1.0) always escalates,
  // regardless of keepComplexInline or availability — the caller needs 911, not
  // a sales pitch or a "we'll call you back".
  if (opts.category === "needs_human" && opts.confidence === 1.0) return "emergency";
  if (!opts.isAvailable) return "ticket"; // brand toggled off → take a message
  if (opts.category === "needs_human") {
    return opts.keepComplexInline ? "reply" : "ticket";
  }
  return "reply";
}

/**
 * One-shot decision helper for an inbound contact. Combines availability check
 * + classification + escalation. Returns a structured action so the caller
 * (Twilio SMS handler, Vapi conversation, etc.) can act on it.
 *
 * Pass `keepComplexInline: true` for the voice brand line (Riley) so a hot,
 * complex buyer is closed inline rather than punted to a no-op ticket.
 */
export async function decideInboundAction(input: {
  channel: "voice" | "sms" | "chat";
  fromIdentity: string;
  message: string;
  keepComplexInline?: boolean;
}): Promise<{
  action: "reply" | "drop" | "polite_decline" | "ticket" | "emergency";
  category: InboundCategory;
  confidence: number;
  awayMessage?: string;
  ticketId?: number | null;
}> {
  // 1. Availability check
  let availability;
  try {
    availability = await storage.getBrandAvailability();
  } catch {
    availability = { is_available: true, away_message: "" } as any;
  }

  // 2. Classification (always run — even when unavailable, we want to skip spam)
  const cls = await classifyInbound(input.message, { from: input.fromIdentity });

  // 3. Decide (pure) → act (I/O only on the ticket/emergency path)
  const action = resolveInboundAction({
    category: cls.category,
    isAvailable: availability.is_available,
    keepComplexInline: input.keepComplexInline,
    confidence: cls.confidence,
  });

  if (action === "drop") {
    return { action, category: cls.category, confidence: cls.confidence };
  }
  if (action === "polite_decline") {
    return { action, category: cls.category, confidence: cls.confidence };
  }
  if (action === "emergency") {
    // Life-safety: create an urgent ticket for follow-up, but the caller gets
    // a hardcoded 911 message (handled by the voice/SMS handler, not here).
    const t = await escalateToHuman({
      channel: input.channel,
      fromIdentity: input.fromIdentity,
      message: input.message,
      reason: "emergency",
      category: cls.category,
    });
    log.warn("[classifier] EMERGENCY detected", { channel: input.channel, from: input.fromIdentity, ticketId: t.ticketId });
    return { action: "emergency", category: cls.category, confidence: cls.confidence, ticketId: t.ticketId };
  }
  if (action === "ticket") {
    const t = await escalateToHuman({
      channel: input.channel,
      fromIdentity: input.fromIdentity,
      message: input.message,
      reason: !availability.is_available ? "availability_off" : "needs_human",
      category: cls.category,
    });
    return {
      action: "ticket",
      category: cls.category,
      confidence: cls.confidence,
      awayMessage: !availability.is_available ? availability.away_message : undefined,
      ticketId: t.ticketId,
    };
  }

  return { action: "reply", category: cls.category, confidence: cls.confidence };
}

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

function heuristicCheck(text: string): ClassifyResult | null {
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
  reason: "needs_human" | "availability_off";
  category?: string;
  metadata?: Record<string, any>;
}): Promise<{ ticketId: number | null }> {
  try {
    const subject =
      input.reason === "availability_off"
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
      category: input.reason === "availability_off" ? "general" : "service",
      priority: "high",
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
 * One-shot decision helper for an inbound contact. Combines availability check
 * + classification + escalation. Returns a structured action so the caller
 * (Twilio SMS handler, Vapi conversation, etc.) can act on it.
 */
export async function decideInboundAction(input: {
  channel: "voice" | "sms" | "chat";
  fromIdentity: string;
  message: string;
}): Promise<{
  action: "reply" | "drop" | "polite_decline" | "ticket";
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

  // 3. Decide
  if (cls.category === "spam") {
    return { action: "drop", category: cls.category, confidence: cls.confidence };
  }
  if (cls.category === "out_of_scope") {
    return { action: "polite_decline", category: cls.category, confidence: cls.confidence };
  }

  // Ticketing path: either the AI says "needs_human" OR we're toggled off
  if (cls.category === "needs_human" || !availability.is_available) {
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

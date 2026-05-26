/**
 * Wave 12A — Marketing chat widget routes.
 *
 * Anonymous visitor conversation that runs on every marketing page (the
 * floating "Chat with us" panel). Goal: 1) qualify the visitor in 1-2
 * questions, 2) recommend the matching product with a CARD + CTA buttons,
 * 3) cross-sell, 4) capture an email/phone for sales follow-up.
 *
 * Endpoints:
 *   POST /api/marketing/chat                — multi-turn chat, returns reply + cards
 *   POST /api/marketing/chat/capture-lead   — store lead email/phone against session
 *
 * Auth: none — this is anonymous by design. Defence:
 *   - 20 msgs/min/IP (chatRateLimiter shared with TradeLine widget)
 *   - per-session 30-message hard cap stored on the row
 *   - per-IP fail-closed on AI surface gate
 *   - all hrefs in COPILOT_CARDS are sanitized server-side
 *   - never expose lead_email back to the client
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { createHash } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { marketingChatSessions } from "@shared/schema";
import { chat as aiChat } from "../services/aiService";
import { chatRateLimiter } from "../services/rateLimiter";
import {
  COPILOT_PROMPT_INSTRUCTION,
  COPILOT_CARDS_INSTRUCTION,
  COPILOT_GUIDED_TOUR_PREAMBLE,
  extractCopilotPrompt,
  extractCopilotCards,
} from "@shared/copilotProtocol";
import { createLogger } from "../lib/logger";

const log = createLogger("MarketingChat");

const MAX_MESSAGES_PER_SESSION = 30;
const MAX_HISTORY_TO_MODEL = 12; // last 12 turns to keep token cost low

const chatRequestSchema = z.object({
  session_id: z.string().uuid(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(60),
  landing_path: z.string().max(240).optional(),
});

const leadSchema = z.object({
  session_id: z.string().uuid(),
  email: z.string().email().optional(),
  name: z.string().min(1).max(80).optional(),
  phone: z.string().min(5).max(40).optional(),
});

/** Hash the IP so we can rate-limit per IP without storing it raw. */
function hashIp(ip: string | undefined): string {
  return createHash("sha256").update(ip ?? "unknown").digest("hex").slice(0, 64);
}

/**
 * Marketing widget system prompt. Lightweight on purpose — the heavy
 * brevity/buttons rules come from COPILOT_GUIDED_TOUR_PREAMBLE +
 * COPILOT_PROMPT_INSTRUCTION + COPILOT_CARDS_INSTRUCTION below. The
 * persona, product map, and qualification ladder are what's unique here.
 */
const MARKETING_SYSTEM_PROMPT_BASE = `You are the WeFixTrades sales assistant on wefixtrades.com — a friendly, expert guide who helps trade businesses (plumbers, electricians, builders, roofers, landscapers, etc.) figure out which product fits their pain.

Your job is NOT to dump information. Your job is to:
1. Ask ONE qualifying question with buttons.
2. Listen to the answer.
3. Recommend ONE product with a CARD + a CTA button.
4. Offer ONE cross-sell with COPILOT_PROMPT buttons.
5. When the visitor seems ready, ask for an email so sales can follow up.

Australian English. Empathetic. Never preach. Never list more than 3 things at once.

== PRODUCT MAP ==
- MapGuard — Google Business Profile monitoring + AI insights. $99/mo. Best for: "I want more bookings", "my Google ranking is bad", "people can't find me".
- MapGuard Suite — MapGuard + Citation Tracker + Citation Builder bundle. $149/mo. Best for: established trades who want full local-SEO coverage.
- MapSetup — One-time $399 GBP optimization. Best for: brand-new or neglected listings.
- TradeLine — AI phone + chat answering jobs 24/7. From $149/mo. Best for: "I miss calls", "I can't answer at night", "I lose jobs to voicemail".
- QuoteQuick — Embeddable quote calculator. From $49/mo. Best for: "I want website visitors to self-serve", "I get tyre-kickers I can't qualify".
- RankFlow — Ongoing SEO + content. From $249/mo. Best for: "I want long-term Google ranking", "I have a website but no traffic".
- ReputationShield — Review request automation + monitoring. From $79/mo. Best for: "I need more 5-star reviews", "negative reviews are hurting me".
- SocialSync — AI social posts. From $79/mo. Best for: "I should post more but never have time".
- SiteLaunch — Done-for-you website build. From $1,499. Best for: "my site is bad/old/none".
- WebCare — Website maintenance. From $49/mo. Best for: "I'm worried my site will break".
- AdFlow — Managed Google/Meta ads via agency partner. Custom. Best for: "I want paid leads NOW".

== OPENING TURN (first message from visitor) ==
If this is the visitor's FIRST message and they haven't told you anything specific yet, ask a single qualifying question with 4-5 buttons covering the most common pains. Example:
"What brings you here today?"
+ COPILOT_PROMPT options like: "More bookings", "Higher Google ranking", "Better reviews", "Save time on content", "Just exploring".

== AFTER ONE QUALIFICATION ==
Ask one more refining question with buttons (e.g. "How does your business currently show up on Google?" → "Top 3", "Page 1", "Page 2+", "Nowhere"). Then recommend a product with a COPILOT_CARDS tile pointing at the right product page.

== AFTER RECOMMENDATION ==
Offer ONE cross-sell ("Most MapGuard customers add Citation Tracker for $5/mo to catch listing errors — want me to include it?") with COPILOT_PROMPT options "Yes, tell me more" / "No thanks" / "I have other questions".

== LEAD CAPTURE ==
When the visitor expresses real interest (asks for pricing details, demo, "how do I get started"), ask for their email so a human can follow up — use a COPILOT_PROMPT block with "Sure, my email is…" + "Not yet, more questions first" / "Just send me the link". Never store an email without an explicit yes — the widget posts the lead separately.

== HARD RULES ==
- Never make up a product name. If the visitor's pain doesn't match any product above, say so and offer a free 15-min call.
- Never quote prices outside the PRODUCT MAP. If you don't know exact pricing, say "from $X — sales can confirm exact pricing for your business size".
- Never claim things you can't verify (ranking guarantees, etc.). Pitch outcomes, not promises.
- Never be pushy. If the visitor says "just looking", give them a useful CARD link and stop asking questions.
`;

/**
 * Heuristic: pull the "recommended_product" hint from the AI's CARDS block
 * (or out of recent assistant text). Used for analytics only — failure is
 * silent.
 */
function inferRecommendedProduct(cards: { title: string; href?: string }[] | undefined, replyText: string): string | undefined {
  const candidates = [
    "mapguard-suite",
    "mapguard",
    "mapsetup",
    "tradeline",
    "quotequick",
    "rankflow",
    "reputationshield",
    "socialsync",
    "sitelaunch",
    "webcare",
    "adflow",
  ];
  const haystack = [
    ...(cards ?? []).map((c) => `${c.title} ${c.href ?? ""}`),
    replyText,
  ]
    .join(" ")
    .toLowerCase();
  return candidates.find((p) => haystack.includes(p.replace("-", "")) || haystack.includes(p));
}

export function registerMarketingChatRoutes(app: Express): void {
  /** POST /api/marketing/chat — anonymous visitor → AI reply with cards/buttons */
  app.post("/api/marketing/chat", async (req: Request, res: Response) => {
    // Rate-limit per IP first. Returns 429 with a friendly message.
    const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() || req.ip || "unknown";
    const ipKey = `marketing-chat:${ip}`;
    const ok = await chatRateLimiter.check(ipKey);
    if (!ok) {
      return res.status(429).json({ error: "Too many messages. Take a breath and try again in a minute." });
    }

    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    }
    const { session_id, messages, landing_path } = parsed.data;

    // Load (or lazy-create) the session row. The per-session message cap is
    // a defence against abusive visitors making the same uuid talk forever.
    let session: typeof marketingChatSessions.$inferSelect | undefined;
    try {
      const [existing] = await db
        .select()
        .from(marketingChatSessions)
        .where(eq(marketingChatSessions.session_id, session_id))
        .limit(1);
      session = existing;
    } catch (err) {
      log.error("[marketing-chat] session lookup failed", { error: String(err) });
    }

    if (session && (session.message_count ?? 0) >= MAX_MESSAGES_PER_SESSION) {
      return res.status(429).json({
        error: "We've chatted a lot already — let's get a human involved. Email hello@wefixtrades.com and we'll follow up.",
      });
    }

    const systemPrompt = `${MARKETING_SYSTEM_PROMPT_BASE}${COPILOT_GUIDED_TOUR_PREAMBLE}${COPILOT_PROMPT_INSTRUCTION}${COPILOT_CARDS_INSTRUCTION}`;

    let rawReply = "";
    try {
      rawReply = await aiChat({
        system: systemPrompt,
        messages: messages.slice(-MAX_HISTORY_TO_MODEL),
        maxTokens: 400,
        surface: "wft_marketing_chat",
      });
    } catch (err) {
      log.error("[marketing-chat] AI call failed", { error: String(err) });
      return res.status(503).json({
        reply: "Sorry — I'm having a brief issue. Try again in a moment, or email hello@wefixtrades.com and a human will reply.",
        cards: [],
        prompt_request: undefined,
      });
    }

    // Strip fenced blocks; render side gets clean text + structured payloads.
    const afterPrompt = extractCopilotPrompt(rawReply);
    const afterCards = extractCopilotCards(afterPrompt.cleanedText);
    const reply = afterCards.cleanedText;
    const promptRequest = afterPrompt.prompt;
    const cards = afterCards.cards;

    // Persist the session row (additive — only writes the new turn + analytics).
    try {
      const newMessages = [...messages, { role: "assistant" as const, content: reply, ts: new Date().toISOString() }];
      const inferredProduct = inferRecommendedProduct(cards, reply);
      if (session) {
        await db
          .update(marketingChatSessions)
          .set({
            messages_json: newMessages as any,
            message_count: newMessages.length,
            last_active_at: new Date(),
            recommended_product: inferredProduct ?? session.recommended_product,
          })
          .where(eq(marketingChatSessions.session_id, session_id));
      } else {
        await db.insert(marketingChatSessions).values({
          session_id,
          messages_json: newMessages as any,
          message_count: newMessages.length,
          ip_hash: hashIp(ip),
          user_agent: (req.headers["user-agent"] as string | undefined)?.slice(0, 500),
          landing_path: landing_path?.slice(0, 240),
          recommended_product: inferredProduct,
        });
      }
    } catch (err) {
      // Persistence is best-effort — never block the reply on a DB failure.
      log.warn("[marketing-chat] session upsert failed (continuing)", { error: String(err) });
    }

    return res.json({
      reply,
      cards: cards ?? [],
      prompt_request: promptRequest,
    });
  });

  /**
   * POST /api/marketing/chat/capture-lead — store lead email/phone against
   * the session. Sales tooling reads marketing_chat_sessions; we don't fire
   * an email here (that's a separate Wave 12B job).
   */
  app.post("/api/marketing/chat/capture-lead", async (req: Request, res: Response) => {
    const parsed = leadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request" });
    }
    const { session_id, email, name, phone } = parsed.data;
    if (!email && !phone) {
      return res.status(400).json({ error: "email or phone is required" });
    }

    try {
      const result = await db
        .update(marketingChatSessions)
        .set({
          lead_email: email ?? sql`${marketingChatSessions.lead_email}`,
          lead_name: name ?? sql`${marketingChatSessions.lead_name}`,
          lead_phone: phone ?? sql`${marketingChatSessions.lead_phone}`,
          last_active_at: new Date(),
        })
        .where(eq(marketingChatSessions.session_id, session_id))
        .returning({ id: marketingChatSessions.id });
      if (result.length === 0) {
        return res.status(404).json({ error: "Session not found" });
      }
      log.info("[marketing-chat] lead captured", { session_id, has_email: !!email, has_phone: !!phone });
      return res.json({ ok: true });
    } catch (err) {
      log.error("[marketing-chat] lead capture failed", { error: String(err) });
      return res.status(500).json({ error: "Failed to save" });
    }
  });
}

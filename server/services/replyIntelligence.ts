/**
 * Reply Intelligence Service — V2
 *
 * Upgrades the basic positive/neutral/negative classification from V1
 * into a richer intent model that can drive automated sales actions.
 *
 * classifyReplyFull() first runs a fast deterministic heuristic pass.
 * If an Anthropic API key is provided it then asks Claude for a one-sentence
 * recommended next action — this is optional and gracefully falls back.
 *
 * Reply intent values:
 *   interested    — wants to learn more / buy
 *   not_now       — timing issue, come back later
 *   objection     — price / trust / wrong fit objection
 *   referral      — forwarding to someone else
 *   unsubscribe   — remove-me request
 *   unclear       — can't determine
 */

import { chat } from "./aiService";

/* ─── Types ─── */

export type ReplyType   = "positive" | "neutral" | "negative";
export type ReplyIntent =
  | "interested"
  | "not_now"
  | "objection"
  | "referral"
  | "unsubscribe"
  | "unclear";

export interface ReplyClassification {
  type:           ReplyType;
  intent:         ReplyIntent;
  /** One-sentence recommendation for the sales rep. Never null. */
  ai_next_action: string;
}

/* ─── Keyword maps ─── */

const UNSUBSCRIBE_KW = [
  "unsubscribe", "remove me", "take me off", "stop emailing",
  "stop contacting", "do not contact", "do not email", "leave me alone",
  "please remove", "opt out", "opted out",
];

const NEGATIVE_KW = [
  "not interested", "no thanks", "no thank you", "not for us",
  "wrong person", "wrong email", "wrong number", "spam",
  "cease and desist", "never contact",
];

const NOT_NOW_KW = [
  "not right now", "maybe later", "bad timing", "too busy",
  "reach out later", "check back", "try again", "next quarter",
  "not at this time", "currently not",
];

const OBJECTION_KW = [
  "too expensive", "can't afford", "not in budget", "budget",
  "already have", "using another", "have a provider",
  "not what i need", "doesn't apply", "doesn't fit",
  "prove it", "show me proof", "skeptical",
];

const REFERRAL_KW = [
  "forwarding", "forward this", "cc ", "copying",
  "you should speak with", "talk to my", "contact my",
  "better person to talk to", "pass this along",
];

const POSITIVE_KW = [
  "interested", "tell me more", "sounds good", "sounds interesting",
  "pricing", "how much", "what does it cost", "cost me",
  "demo", "demonstration", "call me", "give me a call",
  "let's talk", "lets talk", "schedule", "sign up",
  "get started", "want to try", "would like to try",
  "when can we", "can we chat", "set up a meeting",
  "how does it work",
];

/* ─── Heuristic classifier ─── */

function heuristicClassify(text: string): { type: ReplyType; intent: ReplyIntent } {
  const lower = text.toLowerCase();

  if (UNSUBSCRIBE_KW.some((kw) => lower.includes(kw))) {
    return { type: "negative", intent: "unsubscribe" };
  }
  if (NEGATIVE_KW.some((kw) => lower.includes(kw))) {
    return { type: "negative", intent: "unclear" };
  }
  if (NOT_NOW_KW.some((kw) => lower.includes(kw))) {
    return { type: "neutral", intent: "not_now" };
  }
  if (OBJECTION_KW.some((kw) => lower.includes(kw))) {
    return { type: "neutral", intent: "objection" };
  }
  if (REFERRAL_KW.some((kw) => lower.includes(kw))) {
    return { type: "positive", intent: "referral" };
  }
  if (POSITIVE_KW.some((kw) => lower.includes(kw))) {
    return { type: "positive", intent: "interested" };
  }

  return { type: "neutral", intent: "unclear" };
}

/* ─── Static fallback next actions ─── */

const FALLBACK_NEXT_ACTIONS: Record<ReplyType, Record<ReplyIntent, string>> = {
  positive: {
    interested: "Reply within 2 hours — offer a specific 15-minute slot to walk them through the platform.",
    referral:   "Thank the contact and immediately reach out to the referred person with a personalised intro.",
    not_now:    "Send a short acknowledgement and schedule a follow-up reminder in 3–4 weeks.",
    objection:  "Address the concern directly and offer a no-commitment demo or case study.",
    unsubscribe:"Remove from outreach immediately and mark DNC.",
    unclear:    "Reply with a quick open-ended question to clarify their interest level.",
  },
  neutral: {
    not_now:    "Add to a 4-week nurture sequence and note their timing preference.",
    objection:  "Send a relevant case study or ROI one-pager that addresses the objection.",
    interested: "Follow up with a short confirmation and send the booking link.",
    referral:   "Reach out to the referred contact within 24 hours.",
    unsubscribe:"Remove from outreach immediately and mark DNC.",
    unclear:    "Send one more touch with a clear value-add before deciding to close.",
  },
  negative: {
    unsubscribe:"Remove from all sequences immediately and flag as DNC.",
    unclear:    "Respect the opt-out signal — mark DNC and close the lead.",
    not_now:    "Close the lead — any future contact risks reputation damage.",
    objection:  "Close respectfully — do not push back on a firm no.",
    interested: "Close the lead — the negative signal outweighs any positive keyword.",
    referral:   "Close the lead — do not engage the referral when primary contact opted out.",
  },
};

function staticNextAction(type: ReplyType, intent: ReplyIntent): string {
  return FALLBACK_NEXT_ACTIONS[type][intent] ?? "Review this reply manually and decide on next steps.";
}

/* ─── AI next action (optional) ─── */

async function aiNextAction(
  replyText: string,
  type: ReplyType,
  intent: ReplyIntent,
): Promise<string> {
  const prompt = `You are a sales coach for a SaaS company that sells website and AI tools to small tradespeople (plumbers, electricians, HVAC).

A prospect replied to a cold outreach email. The reply has been classified as:
- Type: ${type}
- Intent: ${intent}

Reply text:
"""
${replyText.slice(0, 800)}
"""

Write ONE specific, actionable sentence telling the sales rep exactly what to do next. Be direct and practical. No preamble.`;

  const result = await chat({
    system: "",
    messages: [{ role: "user", content: prompt }],
    maxTokens: 120,
    surface: "reply_intelligence",
  });

  if (result.trim()) {
    return result.trim();
  }
  return staticNextAction(type, intent);
}

/* ─── Main export ─── */

/**
 * Classify a reply and produce a recommended next action.
 *
 * @param replyText  - The raw reply body (may be empty/null for webhook events without body)
 * @param apiKey     - Anthropic API key. When provided, Claude generates the next action.
 *                     When omitted, a deterministic fallback is used.
 */
export async function classifyReplyFull(
  replyText: string | null | undefined,
  apiKey?: string
): Promise<ReplyClassification> {
  // Empty reply body — can't classify, treat as neutral/unclear
  if (!replyText || replyText.trim().length === 0) {
    return {
      type: "neutral",
      intent: "unclear",
      ai_next_action: staticNextAction("neutral", "unclear"),
    };
  }

  const { type, intent } = heuristicClassify(replyText);

  let nextAction: string;
  if (apiKey) {
    try {
      nextAction = await aiNextAction(replyText, type, intent);
    } catch {
      nextAction = staticNextAction(type, intent);
    }
  } else {
    nextAction = staticNextAction(type, intent);
  }

  return { type, intent, ai_next_action: nextAction };
}

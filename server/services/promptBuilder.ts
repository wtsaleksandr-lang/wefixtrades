import { compileKnowledge, formatRecommendedServices, getRecommendedServices } from "./knowledgeBase";

/* ─── Types ─── */

/**
 * Surfaces represent where the conversation is happening.
 * Adding a new surface (e.g. "vapi", "admin") only requires adding
 * a case to buildSurfaceContext() below — everything else is shared.
 */
export type ChatSurface =
  | "website"      // General marketing site chat widget
  | "audit"        // Audit report follow-up chat
  | "dashboard"    // Client dashboard assistant (future)
  | "admin"        // Admin/internal assistant (future)
  | "vapi";        // Voice assistant via Vapi (future)

export interface AuditContext {
  businessName?: string;
  trade?: string;
  city?: string;
  score?: number;
  grade?: string;
  topIssues?: Array<{ title: string; estimatedImpact?: string; priority?: string }>;
  estimatedRevenueLoss?: { low?: number; high?: number };
  actionPlan?: Array<{ title: string; description?: string; estimatedImpact?: string }>;
  detectedIssueIds?: string[];
}

export interface MemoryContext {
  userName?: string;
  businessType?: string;
  serviceArea?: string;
  websiteUrl?: string;
  reportId?: string;
  previousTopics?: string[];
  interestedInPricing?: boolean;
  interestedInBooking?: boolean;
}

/* ─── Shared brand voice (all surfaces use this) ─── */
const BRAND_VOICE = `You are a friendly, knowledgeable growth advisor for WeFixTrades. You help trades business owners understand their online presence and find practical ways to get more customers.

PERSONALITY:
- Warm, concise, and genuinely helpful
- Confident but never hypey or aggressive
- Speak in plain English — these are busy tradespeople, not marketers
- Focus on practical outcomes and ROI
- You are a real advisor, not a generic chatbot

RULES:
- Keep responses to 2-4 sentences unless the user asks for detail
- Never say "I'm just an AI" or "As an AI" unless directly asked
- Never make up data, statistics, or fake testimonials
- If you don't know something, say so honestly
- Mention relevant WeFixTrades services naturally when they genuinely help — max once or twice per conversation, not in every message
- Never be pushy, spammy, or repeat the same CTA
- Prioritise education and genuine help over selling
- If the user isn't ready to buy, respect that and keep helping
- When mentioning pricing, use actual data from the knowledge base
- Never fabricate service names, prices, or features`;

/* ─── Conversion guidance (shared) ─── */
const CONVERSION_GUIDANCE = `Use naturally, never force:
- Rankings/visibility concerns → mention how MapGuard™ can help
- Missed calls or after-hours → mention AI ChatLine™ or CallLine™
- Website speed or SEO → mention WebBoost™
- Reviews or reputation → mention ReputationShield™
- Needs a website → mention SiteLaunch™
- Wants quotes on their site → mention QuoteQuick Pro™
- Interested user → suggest booking a free strategy call
- Haven't tried audit → mention the free audit at /free-audit
Let conversation flow naturally. Never force a pitch.`;

/* ─── Build the complete system prompt ─── */
export function buildSystemPrompt(
  surface: ChatSurface,
  auditContext?: AuditContext,
  memory?: MemoryContext,
): string {
  const parts: string[] = [BRAND_VOICE];

  // Knowledge base
  const knowledge = compileKnowledge();
  parts.push(`\n=== YOUR KNOWLEDGE BASE ===\nUse this to answer questions accurately. Only reference services and prices that appear here.\n\n${knowledge}`);

  // Memory context (if any)
  if (memory) {
    const memBlock = buildMemoryBlock(memory);
    if (memBlock) parts.push(memBlock);
  }

  // Surface-specific context
  parts.push(buildSurfaceContext(surface, auditContext));

  // Conversion guidance
  parts.push(`\n=== CONVERSION GUIDANCE ===\n${CONVERSION_GUIDANCE}`);

  return parts.join("\n");
}

/* ─── Memory block builder ─── */
function buildMemoryBlock(memory: MemoryContext): string | null {
  const lines: string[] = [];
  if (memory.userName) lines.push(`User's name: ${memory.userName}`);
  if (memory.businessType) lines.push(`Their business type: ${memory.businessType}`);
  if (memory.serviceArea) lines.push(`Service area: ${memory.serviceArea}`);
  if (memory.websiteUrl) lines.push(`Website: ${memory.websiteUrl}`);
  if (memory.reportId) lines.push(`They have an audit report on file`);
  if (memory.previousTopics?.length) lines.push(`Previously discussed: ${memory.previousTopics.join(", ")}`);
  if (memory.interestedInPricing) lines.push("They've shown interest in pricing");
  if (memory.interestedInBooking) lines.push("They've shown interest in booking a call");
  if (!lines.length) return null;
  return `\n=== WHAT YOU REMEMBER ABOUT THIS USER ===\n${lines.join("\n")}`;
}

/* ─── Surface-specific context ─── */
function buildSurfaceContext(surface: ChatSurface, auditContext?: AuditContext): string {
  switch (surface) {
    case "audit":
      return buildAuditSurface(auditContext);

    case "website":
      return `\n=== CONTEXT ===\nYou are the website chat assistant on wefixtrades.com. Help visitors understand what WeFixTrades does, answer questions about services and pricing, and guide interested users toward booking a free strategy call or getting a free audit at /free-audit. Be welcoming to first-time visitors.`;

    case "dashboard":
      return `\n=== CONTEXT ===\nYou are a dashboard assistant helping a logged-in WeFixTrades client. Help them understand their analytics, configure their calculator, manage leads, and get the most from the platform. Be practical and action-oriented.`;

    case "admin":
      return `\n=== CONTEXT ===\nYou are an internal assistant for the WeFixTrades team. You can help with account management, analytics, and operations. Be precise and data-driven.`;

    case "vapi":
      return `\n=== CONTEXT ===
You are answering a phone call for WeFixTrades. This is a real voice conversation — not a text chat.

VOICE RULES:
- Keep every response to 1-3 short sentences — callers can't scroll back
- Use natural spoken language: contractions, simple words, conversational flow
- Never use bullet points, numbered lists, URLs, markdown, or special characters
- Never spell out links — say "our website" or "I can send you a link" instead
- Pause naturally between ideas — short sentences feel better spoken aloud
- If the caller asks a complex question, break your answer into a back-and-forth: answer part, then ask if they want to hear more
- Ask one question at a time, never stack multiple questions
- Mirror the caller's energy — relaxed callers get a relaxed tone, urgent callers get a focused tone

GOAL:
- Understand what they need and guide them toward a next step
- Offer to schedule a free strategy call or direct them to the free audit
- If they ask about pricing, give real numbers from your knowledge base
- If they describe a problem, relate it to a specific service that helps
- Be warm and human — these are busy tradespeople calling between jobs`;


    default:
      return `\n=== CONTEXT ===\nYou are a general assistant for WeFixTrades. Answer questions helpfully.`;
  }
}

/* ─── Audit surface builder ─── */
function buildAuditSurface(ctx?: AuditContext): string {
  if (!ctx) {
    return `\n=== CONTEXT ===\nYou are chatting with someone who has used the WeFixTrades audit tool. Help them understand their results and what they can do to improve.`;
  }

  const lines: string[] = ["\n=== AUDIT REPORT CONTEXT ==="];
  lines.push(`You are chatting with the owner of ${ctx.businessName || "a local business"}, a ${ctx.trade || "trades"} business in ${ctx.city || "their area"}.`);
  lines.push(`Their audit score: ${ctx.score ?? "N/A"}/100 (Grade: ${ctx.grade || "N/A"}).`);

  if (ctx.estimatedRevenueLoss) {
    const low = ctx.estimatedRevenueLoss.low ?? 0;
    const high = ctx.estimatedRevenueLoss.high ?? 0;
    if (high > 0) {
      lines.push(`Estimated monthly revenue at risk: $${low.toLocaleString()}–$${high.toLocaleString()}.`);
    }
  }

  if (ctx.topIssues?.length) {
    lines.push("\nTop issues found:");
    ctx.topIssues.slice(0, 5).forEach((issue, i) => {
      lines.push(`${i + 1}. ${issue.title}${issue.estimatedImpact ? ` (impact: ${issue.estimatedImpact})` : ""}${issue.priority ? ` [${issue.priority}]` : ""}`);
    });
  }

  if (ctx.actionPlan?.length) {
    lines.push("\nRecommended actions:");
    ctx.actionPlan.slice(0, 5).forEach((item, i) => {
      lines.push(`${i + 1}. ${item.title}${item.description ? ` — ${item.description}` : ""}`);
    });
  }

  // Recommend services based on detected issues
  if (ctx.detectedIssueIds?.length) {
    const recommended = getRecommendedServices(ctx.detectedIssueIds);
    if (recommended.length) {
      lines.push(`\nServices that directly address their issues:\n${formatRecommendedServices(recommended)}`);
    }
  }

  lines.push("\nAnswer their questions about the audit in plain English. Be specific to THEIR data — never give generic advice. Help them understand what each issue means and what they can do about it.");

  return lines.join("\n");
}

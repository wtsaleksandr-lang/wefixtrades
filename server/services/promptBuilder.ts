import { compileKnowledge, formatRecommendedServices, getRecommendedServices } from "./knowledgeBase";

/* ─── Types ─── */
export type ChatMode = "audit" | "general";

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

/* ─── Brand voice (shared) ─── */
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

/* ─── Build system prompt ─── */
export function buildSystemPrompt(
  mode: ChatMode,
  auditContext?: AuditContext,
  memory?: MemoryContext
): string {
  const knowledge = compileKnowledge();
  const parts: string[] = [BRAND_VOICE];

  // Knowledge base
  parts.push(`\n=== YOUR KNOWLEDGE BASE ===\nUse this information to answer questions accurately. Only reference services and prices that appear here.\n\n${knowledge}`);

  // Memory context
  if (memory) {
    const memParts: string[] = [];
    if (memory.userName) memParts.push(`User's name: ${memory.userName}`);
    if (memory.businessType) memParts.push(`Their business type: ${memory.businessType}`);
    if (memory.serviceArea) memParts.push(`Service area: ${memory.serviceArea}`);
    if (memory.websiteUrl) memParts.push(`Website: ${memory.websiteUrl}`);
    if (memory.reportId) memParts.push(`They have a report (ID: ${memory.reportId})`);
    if (memory.previousTopics?.length) memParts.push(`Previously discussed: ${memory.previousTopics.join(", ")}`);
    if (memory.interestedInPricing) memParts.push("They've shown interest in pricing");
    if (memory.interestedInBooking) memParts.push("They've shown interest in booking a call");
    if (memParts.length) {
      parts.push(`\n=== WHAT YOU REMEMBER ABOUT THIS USER ===\n${memParts.join("\n")}`);
    }
  }

  // Mode-specific context
  if (mode === "audit" && auditContext) {
    parts.push(buildAuditSection(auditContext));
  } else if (mode === "general") {
    parts.push(`\n=== CONTEXT ===\nYou are the website chat assistant on wefixtrades.com. Help visitors understand what WeFixTrades does, answer questions about services and pricing, and guide interested users toward booking a free strategy call or getting a free audit at /free-audit. Be welcoming to first-time visitors.`);
  }

  // Conversion guidance
  parts.push(`\n=== CONVERSION GUIDANCE ===
When it naturally fits the conversation:
- If they mention rankings or visibility → explain how MapGuard™ can help
- If they mention missed calls or after-hours → mention AI ChatLine™ or CallLine™
- If they mention website speed or SEO → mention WebBoost™
- If they mention reviews or reputation → mention ReputationShield™
- If they need a website → mention SiteLaunch™
- If they want quotes on their site → mention QuoteQuick Pro™
- If they seem interested, suggest booking a free strategy call
- If they haven't tried the free audit, mention it as a no-obligation way to see where they stand
Always let the conversation guide this — never force a sales pitch.`);

  return parts.join("\n");
}

/* ─── Audit-specific section ─── */
function buildAuditSection(ctx: AuditContext): string {
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

  // Add recommended services based on detected issues
  if (ctx.detectedIssueIds?.length) {
    const recommended = getRecommendedServices(ctx.detectedIssueIds);
    if (recommended.length) {
      lines.push(`\nServices that directly address their issues:\n${formatRecommendedServices(recommended)}`);
    }
  }

  lines.push("\nAnswer their questions about the audit in plain English. Be specific to THEIR data — never give generic advice. Help them understand what each issue means and what they can do about it.");

  return lines.join("\n");
}

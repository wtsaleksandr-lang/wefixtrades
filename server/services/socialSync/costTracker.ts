/**
 * SocialSync cost tracking — logs per-action costs for profitability analysis.
 *
 * Cost types:
 *   ai_content   — Claude content generation (topic + post)
 *   ai_image     — OpenAI image generation
 *   ai_quality   — Claude quality gate / self-review
 *   ai_review    — Claude review reply generation
 *   sms          — Twilio SMS (review requests)
 *   email        — SMTP email (review requests, alerts)
 *   infra        — Flat per-client infrastructure allocation
 *
 * Costs stored as micro-USD (× 1,000,000) in integer column.
 */
import { storage } from "../../storage";
import { recordSmsCostForClient } from "../clientCostBilling";

/* ─── Cost Rates ─── */

// Claude Haiku: $0.25/1M input, $1.25/1M output
const CLAUDE_INPUT_PER_TOKEN = 0.25 / 1_000_000;   // USD per token
const CLAUDE_OUTPUT_PER_TOKEN = 1.25 / 1_000_000;

// OpenAI gpt-image-1: ~$0.04 per image (1024x1024)
const IMAGE_GENERATION_COST = 0.04;

// Twilio SMS: ~$0.0079 per segment
const SMS_COST = 0.0079;

// Email: ~$0.001 per email (SMTP cost negligible, but track for completeness)
const EMAIL_COST = 0.001;

// Monthly per-client infrastructure allocation (hosting, storage, compute)
const MONTHLY_INFRA_PER_CLIENT = 2.00; // $2/month flat

function toMicroUsd(usd: number): number {
  return Math.round(usd * 1_000_000);
}

/* ─── Logging Functions ─── */

export async function logAiContentCost(
  clientId: number,
  inputTokens: number,
  outputTokens: number,
  description: string = "Content generation",
): Promise<void> {
  try {
    const costUsd = inputTokens * CLAUDE_INPUT_PER_TOKEN + outputTokens * CLAUDE_OUTPUT_PER_TOKEN;
    await storage.logServiceCost({
      client_id: clientId,
      service: "socialsync",
      cost_type: "ai_content",
      amount_micro_usd: toMicroUsd(costUsd),
      description,
      metadata: { input_tokens: inputTokens, output_tokens: outputTokens },
    } as any);
  } catch { /* non-blocking */ }
}

export async function logAiImageCost(
  clientId: number,
  description: string = "Image generation",
): Promise<void> {
  try {
    await storage.logServiceCost({
      client_id: clientId,
      service: "socialsync",
      cost_type: "ai_image",
      amount_micro_usd: toMicroUsd(IMAGE_GENERATION_COST),
      description,
    } as any);
  } catch { /* non-blocking */ }
}

export async function logAiQualityCost(
  clientId: number,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  try {
    const costUsd = inputTokens * CLAUDE_INPUT_PER_TOKEN + outputTokens * CLAUDE_OUTPUT_PER_TOKEN;
    await storage.logServiceCost({
      client_id: clientId,
      service: "socialsync",
      cost_type: "ai_quality",
      amount_micro_usd: toMicroUsd(costUsd),
      description: "Quality gate review",
      metadata: { input_tokens: inputTokens, output_tokens: outputTokens },
    } as any);
  } catch { /* non-blocking */ }
}

export async function logAiReviewReplyCost(
  clientId: number,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  try {
    const costUsd = inputTokens * CLAUDE_INPUT_PER_TOKEN + outputTokens * CLAUDE_OUTPUT_PER_TOKEN;
    await storage.logServiceCost({
      client_id: clientId,
      service: "reputationshield",
      cost_type: "ai_review",
      amount_micro_usd: toMicroUsd(costUsd),
      description: "Review reply generation",
      metadata: { input_tokens: inputTokens, output_tokens: outputTokens },
    } as any);
  } catch { /* non-blocking */ }
}

export async function logSmsCost(clientId: number): Promise<void> {
  try {
    await storage.logServiceCost({
      client_id: clientId,
      service: "reputationshield",
      cost_type: "sms",
      amount_micro_usd: toMicroUsd(SMS_COST),
      description: "Review request SMS",
    } as any);
  } catch { /* non-blocking */ }
  // W-BA-2 (Phase 3b §5) — feed the per-client variable-cost cache too.
  await recordSmsCostForClient({ clientId, segments: 1 }).catch(() => {});
}

export async function logEmailCost(clientId: number, description: string = "Email"): Promise<void> {
  try {
    await storage.logServiceCost({
      client_id: clientId,
      service: "reputationshield",
      cost_type: "email",
      amount_micro_usd: toMicroUsd(EMAIL_COST),
      description,
    } as any);
  } catch { /* non-blocking */ }
}

/* ─── Aggregation ─── */

export interface ClientProfitability {
  client_id: number;
  revenue_usd: number;
  cost_usd: number;
  profit_usd: number;
  margin_pct: number | null;
  cost_breakdown: Record<string, number>; // cost_type → USD
}

/**
 * Compute profitability for a single client over the last 30 days.
 */
export async function getClientProfitability(clientId: number): Promise<ClientProfitability> {
  // Revenue: from client_services price_cents
  const services = await storage.listClientServices(clientId);
  let monthlyRevenueCents = 0;
  for (const svc of services) {
    if (svc.status === "active" && svc.price_cents) {
      monthlyRevenueCents += svc.price_cents;
    }
  }
  const revenueUsd = monthlyRevenueCents / 100;

  // Costs: from service_cost_logs
  const costs = await storage.getServiceCosts(clientId, 30);
  let totalMicroUsd = 0;
  const breakdown: Record<string, number> = {};

  for (const cost of costs) {
    totalMicroUsd += cost.amount_micro_usd;
    const type = cost.cost_type;
    breakdown[type] = (breakdown[type] || 0) + cost.amount_micro_usd / 1_000_000;
  }

  // Add flat infra cost
  const infraCost = MONTHLY_INFRA_PER_CLIENT;
  breakdown["infra"] = (breakdown["infra"] || 0) + infraCost;

  const costUsd = totalMicroUsd / 1_000_000 + infraCost;
  const profitUsd = revenueUsd - costUsd;
  const marginPct = revenueUsd > 0 ? Math.round((profitUsd / revenueUsd) * 100) : null;

  return {
    client_id: clientId,
    revenue_usd: Math.round(revenueUsd * 100) / 100,
    cost_usd: Math.round(costUsd * 100) / 100,
    profit_usd: Math.round(profitUsd * 100) / 100,
    margin_pct: marginPct,
    cost_breakdown: Object.fromEntries(
      Object.entries(breakdown).map(([k, v]) => [k, Math.round(v * 100) / 100]),
    ),
  };
}

/**
 * Wave W-BA-2 (Phase 3b) — DB-backed model pricing.
 *
 * Reads the `ai_model_pricing` table (migration 0030) with a 5-minute
 * in-process cache. The 8 seeded models live there as the single source of
 * truth for token → cost; the legacy hard-coded matchers in `aiPricing.ts`
 * remain as a fail-open fallback when the table is empty (test envs,
 * pre-migration deploy windows).
 */
import { db } from "../db";
import { eq } from "drizzle-orm";
import { aiModelPricing, type AiModelPricing } from "@shared/schema";
import { createLogger } from "../lib/logger";

const log = createLogger("AiModelPricingTable");

const CACHE_TTL_MS = 5 * 60_000;

let cache: { at: number; byModel: Map<string, AiModelPricing>; byTier: Map<string, AiModelPricing[]> } | null = null;

async function ensureCache(): Promise<typeof cache> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache;
  try {
    const rows = await db.select().from(aiModelPricing).where(eq(aiModelPricing.active, true));
    const byModel = new Map<string, AiModelPricing>();
    const byTier = new Map<string, AiModelPricing[]>();
    for (const r of rows) {
      byModel.set(r.model.toLowerCase(), r);
      const tier = (r.tier || "standard").toLowerCase();
      const arr = byTier.get(tier) || [];
      arr.push(r);
      byTier.set(tier, arr);
    }
    cache = { at: Date.now(), byModel, byTier };
  } catch (err) {
    log.warn("ai_model_pricing read failed — using empty cache", { error: String(err) });
    cache = { at: Date.now(), byModel: new Map(), byTier: new Map() };
  }
  return cache;
}

/**
 * Resolve the exact pricing row for a model id. Tries an exact match first,
 * then a substring match (e.g. "claude-haiku-4-5-20251001" → "claude-haiku-4-5").
 */
export async function getModelPricing(model: string): Promise<AiModelPricing | null> {
  if (!model) return null;
  const c = await ensureCache();
  if (!c) return null;
  const key = model.toLowerCase();
  const exact = c.byModel.get(key);
  if (exact) return exact;
  for (const [k, v] of c.byModel) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}

/**
 * Estimate cost in cents for a call. Returns 0 on any failure rather than
 * throwing — metering must never break the chat flow.
 */
export async function estimateCostCentsFromTable(
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<number> {
  const row = await getModelPricing(model);
  if (!row) return 0;
  // input_per_million_cents → cents per 1M tokens. cents = tokens / 1M * rate.
  const inputCents = (inputTokens * row.input_per_million_cents) / 1_000_000;
  const outputCents = (outputTokens * row.output_per_million_cents) / 1_000_000;
  return Math.max(0, Math.round(inputCents + outputCents));
}

/** Pick the cheapest active model in a given tier (deterministic by model name). */
export async function cheapestModelInTier(tier: "cheap" | "standard" | "premium"): Promise<string | null> {
  const c = await ensureCache();
  if (!c) return null;
  const rows = c.byTier.get(tier) || [];
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => {
    const ac = a.input_per_million_cents + a.output_per_million_cents;
    const bc = b.input_per_million_cents + b.output_per_million_cents;
    return ac - bc || a.model.localeCompare(b.model);
  });
  return sorted[0].model;
}

/** Force a re-fetch on the next read. Used by admin endpoints when pricing changes. */
export function invalidatePricingCache(): void {
  cache = null;
}

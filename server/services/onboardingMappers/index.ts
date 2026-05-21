/**
 * Onboarding → AI Config Mapper Registry (W-AZ-3)
 *
 * Generalizes the TradeLine-only onboarding mapping pattern into a per-product
 * registry. Each product owns a small mapper that converts its onboarding form
 * responses into a generic AIConfigPatch that AI prompt builders can consume.
 *
 * The patches give answers to onboarding questions a place in the AI prompt
 * context instead of sitting as raw JSON on client_service.metadata.config.
 *
 * To add a new product:
 *   1. Create server/services/onboardingMappers/<product>Mapper.ts exporting
 *      a function `mapOnboardingTo<Product>Config(submission) => Promise<AIConfigPatch | null>`.
 *   2. Register it in MAPPERS below keyed by product family slug
 *      (matches the prefix on serviceCatalog.id — e.g. "tradeline",
 *      "quotequick", "rankflow", etc).
 *   3. Optionally wire the patch into that product's AI prompt builder.
 *
 * See docs/architecture/onboarding-ai-mapper.md for full design notes.
 */

import type { OnboardingSubmission } from "@shared/schema";
import { mapOnboardingToTradeLinePatch } from "./tradelineMapper";
import { mapOnboardingToQuoteQuickConfig } from "./quotequickMapper";
import { mapOnboardingToRankFlowConfig } from "./rankflowMapper";
import { mapOnboardingToAdFlowConfig } from "./adflowMapper";
import { mapOnboardingToContentFlowConfig } from "./contentflowMapper";
import { mapOnboardingToWebFixConfig } from "./webfixMapper";
import { mapOnboardingToWebCareConfig } from "./webcareMapper";
import { mapOnboardingToSiteLaunchConfig } from "./sitelaunchMapper";
import { mapOnboardingToMapGuardConfig } from "./mapguardMapper";
import { mapOnboardingToReputationShieldConfig } from "./reputationshieldMapper";
import { mapOnboardingToSocialSyncConfig } from "./socialsyncMapper";
import { mapOnboardingToBookFlowConfig } from "./bookflowMapper";

/**
 * Generic patch shape every mapper returns.
 *
 * - `system_prompt_additions`: short paragraph(s) appended to the product's
 *   system prompt so the model knows who this customer is and how they want
 *   things done.
 * - `context_variables`: structured key/value pairs the prompt builder can
 *   surface as a "=== CUSTOMER SETUP ===" block or feed into tool calls.
 * - `knowledge_base_entries`: documents (FAQs, pricing, voice guide, etc.)
 *   that should be retrievable / appended to the prompt's knowledge section.
 */
export interface AIConfigPatch {
  system_prompt_additions?: string;
  context_variables?: Record<string, unknown>;
  knowledge_base_entries?: Array<{
    kind: string;
    title: string;
    content: string;
  }>;
}

export type OnboardingMapper = (
  submission: OnboardingSubmission,
) => Promise<AIConfigPatch | null>;

/**
 * Product family → mapper. Keys are lowercase slugs that match the prefix
 * of serviceCatalog.id (e.g. service_id "tradeline-call_backup" → "tradeline").
 */
const MAPPERS: Record<string, OnboardingMapper> = {
  tradeline: mapOnboardingToTradeLinePatch,
  quotequick: mapOnboardingToQuoteQuickConfig,
  rankflow: mapOnboardingToRankFlowConfig,
  adflow: mapOnboardingToAdFlowConfig,
  contentflow: mapOnboardingToContentFlowConfig,
  webfix: mapOnboardingToWebFixConfig,
  webcare: mapOnboardingToWebCareConfig,
  sitelaunch: mapOnboardingToSiteLaunchConfig,
  mapguard: mapOnboardingToMapGuardConfig,
  reputationshield: mapOnboardingToReputationShieldConfig,
  socialsync: mapOnboardingToSocialSyncConfig,
  bookflow: mapOnboardingToBookFlowConfig,
};

/**
 * Normalize a service_id like "tradeline-call_backup" or product family hint
 * "QuoteQuick" into the registry key.
 */
function normalizeFamily(input: string): string {
  return input.toLowerCase().split(/[-_\s]/)[0].trim();
}

export function getOnboardingMapper(productFamily: string): OnboardingMapper | null {
  if (!productFamily) return null;
  const key = normalizeFamily(productFamily);
  return MAPPERS[key] ?? null;
}

/**
 * Apply the registered mapper for `productFamily` to `submission`.
 * Returns null when no mapper is registered or the mapper itself returns null
 * (incomplete onboarding template, etc.). Never throws on a mapper exception —
 * callers can safely fall back to raw responses.
 */
export async function applyOnboardingToAIConfig(
  productFamily: string,
  submission: OnboardingSubmission,
): Promise<AIConfigPatch | null> {
  const mapper = getOnboardingMapper(productFamily);
  if (!mapper) return null;
  try {
    return await mapper(submission);
  } catch {
    // Mappers should be safe-fail. Returning null lets the caller continue
    // with the raw onboarding responses; the failure is silent on purpose.
    return null;
  }
}

/**
 * Helper used by all the mappers. Onboarding responses come in two shapes
 * depending on how the form was submitted:
 *   - raw values:   { business_name: "Joe's Plumbing" }
 *   - object form:  { business_name: { value: "Joe's Plumbing", completed_at: "..." } }
 * This pulls a string in either case and trims it; returns null for empties.
 */
export function pullString(
  responses: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!responses) return null;
  const val = responses[key];
  if (typeof val === "string") {
    const trimmed = val.trim();
    return trimmed.length ? trimmed : null;
  }
  if (val && typeof val === "object" && "value" in (val as Record<string, unknown>)) {
    const inner = (val as { value: unknown }).value;
    if (typeof inner === "string") {
      const trimmed = inner.trim();
      return trimmed.length ? trimmed : null;
    }
  }
  return null;
}

/**
 * Split comma / newline separated strings into a trimmed array of non-empty
 * tokens. Used by mappers for keyword lists, services, platforms, etc.
 */
export function pullList(
  responses: Record<string, unknown> | null | undefined,
  key: string,
): string[] {
  const raw = pullString(responses, key);
  if (!raw) return [];
  return raw
    .split(/[,\n;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

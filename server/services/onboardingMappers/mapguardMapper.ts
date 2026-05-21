/**
 * MapGuard onboarding → AI config mapper.
 *
 * Onboarding collects: GBP URL, service area, target keywords. The
 * MapGuard monitoring + recommendation AI gets a per-client targeting
 * context block.
 */

import type { OnboardingSubmission } from "@shared/schema";
import { type AIConfigPatch, pullString, pullList } from "./index";

export async function mapOnboardingToMapGuardConfig(
  submission: OnboardingSubmission,
): Promise<AIConfigPatch | null> {
  const responses = (submission.responses as Record<string, unknown>) || {};
  if (!responses || Object.keys(responses).length === 0) return null;

  const gbpUrl = pullString(responses, "gbp_url") || pullString(responses, "google_business_url");
  const serviceArea = pullString(responses, "service_area") || pullString(responses, "primary_service_area");
  const keywords = pullList(responses, "target_keywords") || [];
  const competitors = pullList(responses, "competitors");
  const trade = pullString(responses, "trade_type");

  const promptParts: string[] = [];
  if (gbpUrl) promptParts.push(`Google Business profile: ${gbpUrl}.`);
  if (serviceArea) promptParts.push(`Service area: ${serviceArea}.`);
  if (trade) promptParts.push(`Trade: ${trade}.`);
  if (keywords.length) promptParts.push(`Tracked keywords: ${keywords.slice(0, 8).join(", ")}.`);

  const context: Record<string, unknown> = {};
  if (gbpUrl) context.gbp_url = gbpUrl;
  if (serviceArea) context.service_area = serviceArea;
  if (keywords.length) context.keywords = keywords;
  if (competitors.length) context.competitors = competitors;
  if (trade) context.trade_type = trade;

  if (promptParts.length === 0 && Object.keys(context).length === 0) return null;

  return {
    system_prompt_additions: promptParts.join(" "),
    context_variables: context,
  };
}

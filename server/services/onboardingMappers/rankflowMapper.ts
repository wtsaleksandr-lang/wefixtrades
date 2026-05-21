/**
 * RankFlow onboarding → AI config mapper.
 *
 * Onboarding collects: website URL, target keywords, CMS access. The
 * RankFlow strategy AI gets a per-client SEO context block so it can
 * pull keyword recommendations and CMS-aware action items.
 */

import type { OnboardingSubmission } from "@shared/schema";
import { type AIConfigPatch, pullString, pullList } from "./index";

export async function mapOnboardingToRankFlowConfig(
  submission: OnboardingSubmission,
): Promise<AIConfigPatch | null> {
  const responses = (submission.responses as Record<string, unknown>) || {};
  if (!responses || Object.keys(responses).length === 0) return null;

  const websiteUrl = pullString(responses, "website_url") || pullString(responses, "site_url");
  const cms = pullString(responses, "cms_platform") || pullString(responses, "cms");
  const trade = pullString(responses, "trade_type") || pullString(responses, "industry");
  const targetKeywords = pullList(responses, "target_keywords");
  const serviceArea = pullString(responses, "service_area");

  const promptParts: string[] = [];
  if (websiteUrl) promptParts.push(`Website: ${websiteUrl}.`);
  if (cms) promptParts.push(`CMS: ${cms}.`);
  if (serviceArea) promptParts.push(`Service area: ${serviceArea}.`);
  if (targetKeywords.length) {
    promptParts.push(`Target keywords: ${targetKeywords.slice(0, 8).join(", ")}.`);
  }

  const context: Record<string, unknown> = {};
  if (websiteUrl) context.website_url = websiteUrl;
  if (cms) context.cms = cms;
  if (targetKeywords.length) context.target_keywords = targetKeywords;
  if (serviceArea) context.service_area = serviceArea;
  if (trade) context.trade_type = trade;

  const kb: AIConfigPatch["knowledge_base_entries"] = [];
  if (trade) {
    kb.push({
      kind: "seo_strategy",
      title: `${trade} SEO playbook notes`,
      content: `Focus on local-intent queries (e.g. "${trade} near me", "${trade} ${serviceArea ?? "in <city>"}") and review-rich GBP optimisation. Avoid generic national keywords for a local trade business.`,
    });
  }

  if (promptParts.length === 0 && Object.keys(context).length === 0) return null;

  return {
    system_prompt_additions: promptParts.join(" "),
    context_variables: context,
    knowledge_base_entries: kb.length ? kb : undefined,
  };
}

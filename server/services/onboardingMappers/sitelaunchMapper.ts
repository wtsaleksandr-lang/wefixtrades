/**
 * SiteLaunch onboarding → AI config mapper.
 *
 * SiteLaunch is mostly a human-delivered build, but the brand-profile data
 * collected during onboarding (business info, brand assets, pages needed)
 * powers the AI copywriter helper and the per-page draft generator. Stored
 * here so it's available when SiteLaunch gets a fuller AI surface.
 */

import type { OnboardingSubmission } from "@shared/schema";
import { type AIConfigPatch, pullString, pullList } from "./index";

export async function mapOnboardingToSiteLaunchConfig(
  submission: OnboardingSubmission,
): Promise<AIConfigPatch | null> {
  const responses = (submission.responses as Record<string, unknown>) || {};
  if (!responses || Object.keys(responses).length === 0) return null;

  const businessName = pullString(responses, "business_name");
  const trade = pullString(responses, "trade_type") || pullString(responses, "trade");
  const serviceArea = pullString(responses, "service_area");
  const logoUrl = pullString(responses, "logo_url");
  const primaryColor = pullString(responses, "primary_color") || pullString(responses, "brand_colors");
  const tagline = pullString(responses, "tagline") || pullString(responses, "headline");
  const pagesNeeded = pullList(responses, "pages_needed");
  const tone = pullString(responses, "brand_tone");

  const promptParts: string[] = [];
  if (businessName) {
    promptParts.push(`Business: ${businessName}${trade ? ` (${trade})` : ""}${serviceArea ? `, serving ${serviceArea}` : ""}.`);
  }
  if (tone) promptParts.push(`Voice/tone: ${tone}.`);
  if (tagline) promptParts.push(`Tagline / headline: ${tagline}.`);

  const context: Record<string, unknown> = {};
  if (businessName) context.business_name = businessName;
  if (trade) context.trade_type = trade;
  if (serviceArea) context.service_area = serviceArea;
  if (logoUrl) context.logo_url = logoUrl;
  if (primaryColor) context.primary_color = primaryColor;
  if (pagesNeeded.length) context.pages_needed = pagesNeeded;
  if (tagline) context.tagline = tagline;

  const kb: AIConfigPatch["knowledge_base_entries"] = [];
  const brandBits: string[] = [];
  if (logoUrl) brandBits.push(`Logo: ${logoUrl}.`);
  if (primaryColor) brandBits.push(`Primary color: ${primaryColor}.`);
  if (tone) brandBits.push(`Tone: ${tone}.`);
  if (brandBits.length) {
    kb.push({
      kind: "brand_guide",
      title: "Brand guide (from SiteLaunch onboarding)",
      content: brandBits.join(" "),
    });
  }

  if (promptParts.length === 0 && Object.keys(context).length === 0 && kb.length === 0) {
    return null;
  }

  return {
    system_prompt_additions: promptParts.join(" "),
    context_variables: context,
    knowledge_base_entries: kb.length ? kb : undefined,
  };
}

/**
 * ReputationShield onboarding → AI config mapper.
 *
 * Onboarding collects: GBP URL, customer-list source, brand voice for
 * review replies. The ReputationShield review-draft AI gets the brand
 * voice + sender context so replies sound like the merchant, not a bot.
 */

import type { OnboardingSubmission } from "@shared/schema";
import { type AIConfigPatch, pullString } from "./index";

export async function mapOnboardingToReputationShieldConfig(
  submission: OnboardingSubmission,
): Promise<AIConfigPatch | null> {
  const responses = (submission.responses as Record<string, unknown>) || {};
  if (!responses || Object.keys(responses).length === 0) return null;

  const gbpUrl = pullString(responses, "gbp_url") || pullString(responses, "google_business_url");
  const customerSource = pullString(responses, "customer_list_source") || pullString(responses, "review_source");
  const voice = pullString(responses, "brand_voice") || pullString(responses, "brand_tone");
  const ownerName = pullString(responses, "owner_name") || pullString(responses, "signoff_name");
  const businessName = pullString(responses, "business_name");

  const promptParts: string[] = [];
  if (businessName) promptParts.push(`Business: ${businessName}.`);
  if (voice) promptParts.push(`Brand voice for review replies: ${voice}.`);
  if (ownerName) promptParts.push(`Sign replies as: ${ownerName}.`);

  const context: Record<string, unknown> = {};
  if (gbpUrl) context.gbp_url = gbpUrl;
  if (customerSource) context.customer_source = customerSource;
  if (voice) context.brand_voice = voice;
  if (ownerName) context.owner_name = ownerName;
  if (businessName) context.business_name = businessName;

  if (promptParts.length === 0 && Object.keys(context).length === 0) return null;

  return {
    system_prompt_additions: promptParts.join(" "),
    context_variables: context,
  };
}

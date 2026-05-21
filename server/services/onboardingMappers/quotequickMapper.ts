/**
 * QuoteQuick onboarding → AI config mapper.
 *
 * Onboarding collects: business name, trade, calculator template,
 * branding. We feed the QuoteQuick AI chat assistant a customer profile
 * + an inferred services/pricing summary so it can answer pricing questions
 * in the merchant's voice.
 */

import type { OnboardingSubmission } from "@shared/schema";
import { type AIConfigPatch, pullString } from "./index";

export async function mapOnboardingToQuoteQuickConfig(
  submission: OnboardingSubmission,
): Promise<AIConfigPatch | null> {
  const responses = (submission.responses as Record<string, unknown>) || {};
  if (!responses || Object.keys(responses).length === 0) return null;

  const businessName = pullString(responses, "business_name");
  const trade = pullString(responses, "trade_type") || pullString(responses, "trade");
  const template = pullString(responses, "calculator_template") || pullString(responses, "calc_template");
  const brandTone = pullString(responses, "brand_tone");
  const websiteUrl = pullString(responses, "website_url");

  const promptParts: string[] = [];
  if (businessName) {
    promptParts.push(`Business: ${businessName}.`);
  }
  if (trade) promptParts.push(`Trade: ${trade}.`);
  if (template) promptParts.push(`Default calculator: ${template}.`);
  if (brandTone) promptParts.push(`Voice/tone for replies: ${brandTone}.`);

  const context: Record<string, unknown> = {};
  if (businessName) context.business_name = businessName;
  if (trade) context.trade_type = trade;
  if (template) context.calculator_template = template;
  if (websiteUrl) context.website_url = websiteUrl;

  const kb: AIConfigPatch["knowledge_base_entries"] = [];
  if (template) {
    kb.push({
      kind: "calculator_template",
      title: `${template} pricing template`,
      content: `This customer uses the ${template} pricing model. When asked about pricing, refer to the line items configured in their calculator — never invent rates.`,
    });
  }

  if (promptParts.length === 0 && Object.keys(context).length === 0) return null;

  return {
    system_prompt_additions: promptParts.join(" "),
    context_variables: context,
    knowledge_base_entries: kb.length ? kb : undefined,
  };
}

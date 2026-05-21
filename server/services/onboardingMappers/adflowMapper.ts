/**
 * AdFlow onboarding → AI config mapper.
 *
 * Onboarding collects: ad budget, geo target, audience. We give the
 * AdFlow strategy AI a concise ad-targeting context block.
 */

import type { OnboardingSubmission } from "@shared/schema";
import { type AIConfigPatch, pullString } from "./index";

export async function mapOnboardingToAdFlowConfig(
  submission: OnboardingSubmission,
): Promise<AIConfigPatch | null> {
  const responses = (submission.responses as Record<string, unknown>) || {};
  if (!responses || Object.keys(responses).length === 0) return null;

  const budget = pullString(responses, "monthly_budget") || pullString(responses, "budget");
  const geo = pullString(responses, "geo_target") || pullString(responses, "service_area");
  const audience = pullString(responses, "target_audience") || pullString(responses, "ideal_customer");
  const trade = pullString(responses, "trade_type");
  const goals = pullString(responses, "campaign_goals") || pullString(responses, "goals");

  const promptParts: string[] = [];
  if (budget) promptParts.push(`Monthly ad budget: $${budget.replace(/^\$/, "")}.`);
  if (geo) promptParts.push(`Geo target: ${geo}.`);
  if (audience) promptParts.push(`Audience: ${audience}.`);
  if (trade) promptParts.push(`Trade: ${trade}.`);
  if (goals) promptParts.push(`Campaign goals: ${goals}.`);

  const context: Record<string, unknown> = {};
  if (budget) context.budget = budget;
  if (geo) context.geo = geo;
  if (audience) context.audience = audience;
  if (trade) context.trade_type = trade;
  if (goals) context.campaign_goals = goals;

  if (promptParts.length === 0 && Object.keys(context).length === 0) return null;

  return {
    system_prompt_additions: promptParts.join(" "),
    context_variables: context,
  };
}

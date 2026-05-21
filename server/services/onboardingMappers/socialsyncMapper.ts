/**
 * SocialSync onboarding → AI config mapper.
 *
 * Onboarding collects: platforms, posting cadence, content style. The
 * SocialSync post generator gets this so it knows where, how often, and
 * in what tone to publish.
 */

import type { OnboardingSubmission } from "@shared/schema";
import { type AIConfigPatch, pullString, pullList } from "./index";

export async function mapOnboardingToSocialSyncConfig(
  submission: OnboardingSubmission,
): Promise<AIConfigPatch | null> {
  const responses = (submission.responses as Record<string, unknown>) || {};
  if (!responses || Object.keys(responses).length === 0) return null;

  const platforms = pullList(responses, "platforms");
  const cadence = pullString(responses, "posting_cadence") || pullString(responses, "cadence");
  const style = pullString(responses, "content_style") || pullString(responses, "brand_tone");
  const topics = pullList(responses, "preferred_topics");
  const audience = pullString(responses, "target_audience") || pullString(responses, "ideal_customer");

  const promptParts: string[] = [];
  if (platforms.length) promptParts.push(`Platforms: ${platforms.join(", ")}.`);
  if (cadence) promptParts.push(`Cadence: ${cadence}.`);
  if (style) promptParts.push(`Content style: ${style}.`);
  if (audience) promptParts.push(`Audience: ${audience}.`);

  const context: Record<string, unknown> = {};
  if (platforms.length) context.platforms = platforms;
  if (cadence) context.cadence = cadence;
  if (style) context.style = style;
  if (topics.length) context.preferred_topics = topics;
  if (audience) context.target_audience = audience;

  if (promptParts.length === 0 && Object.keys(context).length === 0) return null;

  return {
    system_prompt_additions: promptParts.join(" "),
    context_variables: context,
  };
}

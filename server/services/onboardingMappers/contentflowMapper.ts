/**
 * ContentFlow onboarding → AI config mapper.
 *
 * Onboarding collects: website URL, industries, voice/tone, USPs,
 * forbidden words (from the AZ-1 brand profile capture). The ContentFlow
 * generator gets a voice/tone block + a brand-voice knowledge entry.
 */

import type { OnboardingSubmission } from "@shared/schema";
import { type AIConfigPatch, pullString, pullList } from "./index";

export async function mapOnboardingToContentFlowConfig(
  submission: OnboardingSubmission,
): Promise<AIConfigPatch | null> {
  const responses = (submission.responses as Record<string, unknown>) || {};
  if (!responses || Object.keys(responses).length === 0) return null;

  const websiteUrl = pullString(responses, "website_url");
  const tone = pullString(responses, "brand_tone");
  const audience = pullString(responses, "ideal_customer") || pullString(responses, "target_audience");
  const usps = pullString(responses, "unique_selling_points");
  const topics = pullList(responses, "preferred_topics");
  const forbidden = pullList(responses, "forbidden_words");
  const industries = pullList(responses, "industries");

  const promptParts: string[] = [];
  if (tone) promptParts.push(`Voice/tone: ${tone}.`);
  if (audience) promptParts.push(`Target audience: ${audience}.`);
  if (industries.length) promptParts.push(`Industries: ${industries.join(", ")}.`);

  const context: Record<string, unknown> = {};
  if (websiteUrl) context.website_url = websiteUrl;
  if (tone) context.tone = tone;
  if (audience) context.target_audience = audience;
  if (industries.length) context.industries = industries;
  if (topics.length) context.preferred_topics = topics;
  if (forbidden.length) context.forbidden_words = forbidden;

  const kb: AIConfigPatch["knowledge_base_entries"] = [];
  const voiceParts: string[] = [];
  if (tone) voiceParts.push(`Tone: ${tone}.`);
  if (usps) voiceParts.push(`Unique selling points: ${usps}.`);
  if (topics.length) voiceParts.push(`Preferred topics: ${topics.join(", ")}.`);
  if (forbidden.length) voiceParts.push(`Avoid: ${forbidden.join(", ")}.`);
  if (voiceParts.length) {
    kb.push({
      kind: "voice_guide",
      title: "Brand voice guide",
      content: voiceParts.join(" "),
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

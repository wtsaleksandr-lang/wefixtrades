/**
 * WebCare onboarding → AI config mapper.
 *
 * Similar to WebFix but ongoing — captures alert preferences + CMS so the
 * WebCare automation AI knows what to flag and how often. Raw credentials
 * stay in client_service.metadata (encrypted by onboardingAI.ts) and are
 * intentionally NOT projected into the prompt.
 */

import type { OnboardingSubmission } from "@shared/schema";
import { type AIConfigPatch, pullString, pullList } from "./index";

export async function mapOnboardingToWebCareConfig(
  submission: OnboardingSubmission,
): Promise<AIConfigPatch | null> {
  const responses = (submission.responses as Record<string, unknown>) || {};
  if (!responses || Object.keys(responses).length === 0) return null;

  const siteUrl = pullString(responses, "site_url") || pullString(responses, "website_url");
  const cms = pullString(responses, "cms_platform") || pullString(responses, "cms");
  const alertChannel = pullString(responses, "alert_channel") || pullString(responses, "notification_preference");
  const alertFrequency = pullString(responses, "alert_frequency") || pullString(responses, "report_cadence");
  const concerns = pullList(responses, "concerns");

  const promptParts: string[] = [];
  if (siteUrl) promptParts.push(`Site: ${siteUrl}.`);
  if (cms) promptParts.push(`CMS: ${cms}.`);
  if (alertChannel) promptParts.push(`Alert channel: ${alertChannel}.`);
  if (alertFrequency) promptParts.push(`Reporting cadence: ${alertFrequency}.`);

  const context: Record<string, unknown> = {};
  if (siteUrl) context.site_url = siteUrl;
  if (cms) context.cms = cms;
  if (alertChannel) context.alert_channel = alertChannel;
  if (alertFrequency) context.alert_frequency = alertFrequency;
  if (concerns.length) context.concerns = concerns;

  if (promptParts.length === 0 && Object.keys(context).length === 0) return null;

  return {
    system_prompt_additions: promptParts.join(" "),
    context_variables: context,
  };
}

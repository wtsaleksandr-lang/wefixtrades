/**
 * BookFlow onboarding → AI config mapper.
 *
 * Onboarding collects: business hours, services offered, calendar provider.
 * The BookFlow booking AI gets this so it can offer correct slots and quote
 * the right services back to the caller.
 */

import type { OnboardingSubmission } from "@shared/schema";
import { type AIConfigPatch, pullString, pullList } from "./index";

export async function mapOnboardingToBookFlowConfig(
  submission: OnboardingSubmission,
): Promise<AIConfigPatch | null> {
  const responses = (submission.responses as Record<string, unknown>) || {};
  if (!responses || Object.keys(responses).length === 0) return null;

  const hours = pullString(responses, "business_hours") || pullString(responses, "hours");
  const services = pullList(responses, "services_offered") || pullList(responses, "services");
  const calendar = pullString(responses, "calendar_provider") || pullString(responses, "calendar");
  const timezone = pullString(responses, "timezone");
  const slotDuration = pullString(responses, "slot_duration");

  const promptParts: string[] = [];
  if (hours) promptParts.push(`Hours: ${hours}.`);
  if (calendar) promptParts.push(`Calendar provider: ${calendar}.`);
  if (timezone) promptParts.push(`Timezone: ${timezone}.`);
  if (services.length) promptParts.push(`Services available to book: ${services.join(", ")}.`);

  const context: Record<string, unknown> = {};
  if (hours) context.hours = hours;
  if (services.length) context.services = services;
  if (calendar) context.calendar_provider = calendar;
  if (timezone) context.timezone = timezone;
  if (slotDuration) context.slot_duration = slotDuration;

  if (promptParts.length === 0 && Object.keys(context).length === 0) return null;

  return {
    system_prompt_additions: promptParts.join(" "),
    context_variables: context,
  };
}

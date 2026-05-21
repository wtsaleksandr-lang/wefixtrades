/**
 * TradeLine onboarding → AI config mapper.
 *
 * NOTE: The original `mapOnboardingToTradeLineConfig` in
 * `@shared/schemas/adminCrm` stays where it is and continues to be the
 * authoritative path for writing TradelineConfig (phone routing, embed mode,
 * booking, etc.) from `portalRoutes.ts`. This file does NOT replace it.
 *
 * The patch produced here is the *AI prompt* projection of the same answers,
 * so the per-client TradeLine voice/chat assistant can introduce itself as
 * "the AI assistant for <business>" and answer in their voice. Existing
 * TradeLine behavior is preserved end-to-end.
 */

import type { OnboardingSubmission } from "@shared/schema";
import { type AIConfigPatch, pullString } from "./index";

export async function mapOnboardingToTradeLinePatch(
  submission: OnboardingSubmission,
): Promise<AIConfigPatch | null> {
  const responses = (submission.responses as Record<string, unknown>) || {};
  if (!responses || Object.keys(responses).length === 0) return null;

  const businessName = pullString(responses, "business_name");
  const tradeType = pullString(responses, "trade_type") || pullString(responses, "trade");
  const serviceArea = pullString(responses, "service_area") || pullString(responses, "primary_service_area");
  const primaryPhone = pullString(responses, "primary_phone");
  const forwarding = pullString(responses, "forwarding_preference");
  const bookingEnabled = pullString(responses, "booking_enabled");

  const promptLines: string[] = [];
  if (businessName) {
    promptLines.push(
      `Business: ${businessName}${tradeType ? ` (${tradeType})` : ""}${serviceArea ? `, serving ${serviceArea}` : ""}.`,
    );
  }
  if (forwarding) {
    promptLines.push(`Call forwarding preference: ${forwarding}.`);
  }
  if (bookingEnabled && /yes|true|on/i.test(bookingEnabled)) {
    promptLines.push("Booking is enabled — offer to book customers into the calendar when appropriate.");
  }

  const context: Record<string, unknown> = {};
  if (businessName) context.business_name = businessName;
  if (tradeType) context.trade_type = tradeType;
  if (serviceArea) context.service_area = serviceArea;
  if (primaryPhone) context.primary_phone = primaryPhone;

  if (promptLines.length === 0 && Object.keys(context).length === 0) return null;

  return {
    system_prompt_additions: promptLines.join(" "),
    context_variables: context,
  };
}

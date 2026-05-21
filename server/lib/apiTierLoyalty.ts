/**
 * API tier loyalty pricing helper (Wave AJ-3).
 *
 * Existing QuoteQuick paid customers (Pro or Business) get the API Starter
 * tier at $29/mo (40% off the $49 list) — locked while their QQ paid
 * subscription remains active. This module decides whether the loyalty
 * Stripe price should be substituted for the list price at checkout.
 *
 * Source of truth: `calculators.plan_tier` is kept in sync with Stripe by
 * `stripeBillingRoutes.handleSubscriptionUpdated` (Pro ↔ Business) and
 * `handleSubscriptionDeleted` (→ free). A user is "QQ-paid" iff they own
 * at least one calculator currently on a paid tier with a non-null
 * `stripe_subscription_id`.
 */

import { db } from "../db";
import { calculators } from "@shared/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";

const QQ_PAID_TIERS = ["pro", "business"] as const;

/**
 * Returns true iff the user owns at least one calculator on a paid QQ
 * plan with an active Stripe subscription. The webhook keeps `plan_tier`
 * accurate on cancellation (reverts to 'free'), so a stale row here means
 * a cancelled subscription has already been processed.
 */
export async function isEligibleForApiLoyaltyPricing(
  userId: number,
): Promise<boolean> {
  if (!userId || !Number.isFinite(userId)) return false;
  const rows = await db
    .select({ id: calculators.id })
    .from(calculators)
    .where(
      and(
        eq(calculators.user_id, userId),
        inArray(calculators.plan_tier, [...QQ_PAID_TIERS]),
        isNotNull(calculators.stripe_subscription_id),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

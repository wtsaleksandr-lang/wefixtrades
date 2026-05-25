/**
 * Citation Tracker — Stripe webhook integration.
 *
 * Hooks into the existing billing-webhook event loop in
 * stripeBillingRoutes.ts. We don't ship a parallel webhook — we just
 * branch on metadata.product === "citation_tracker".
 *
 * Lifecycle:
 *   checkout.session.completed
 *     → insert citation_tracker_subscriptions row in "active" status
 *       and stamp stripe_subscription_id from session.subscription.
 *   customer.subscription.updated / .created
 *     → update status (active / past_due / canceled) and stripe_subscription_id.
 *   customer.subscription.deleted
 *     → mark status="canceled" + canceled_at=now().
 */
import Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  citationTrackerSubscriptions,
  type InsertCitationTrackerSubscription,
} from "@shared/schema";
import { createLogger } from "../lib/logger";

const log = createLogger("citation-tracker-webhook");

export function isCitationTrackerCheckout(session: Stripe.Checkout.Session): boolean {
  return session.metadata?.product === "citation_tracker";
}

export function isCitationTrackerSubscription(sub: Stripe.Subscription): boolean {
  return sub.metadata?.product === "citation_tracker";
}

/* ─── Checkout completion ─────────────────────────────────────────── */

export async function handleCitationTrackerCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userIdRaw = session.metadata?.user_id;
  const planTier = (session.metadata?.plan_tier as "standalone" | "bundle") ||
    (session.metadata?.plan?.startsWith("bundle") ? "bundle" : "standalone");
  const businessName = session.metadata?.business_name || "Untitled business";
  let nap: Record<string, string> = {};
  try {
    if (session.metadata?.nap) nap = JSON.parse(session.metadata.nap);
  } catch {
    // Fallback to empty NAP; Wave 3.5 will add a portal "complete profile" flow.
  }

  if (!userIdRaw) {
    log.warn("checkout.session.completed missing user_id metadata — skipping", { session_id: session.id });
    return;
  }
  const customerId = parseInt(userIdRaw, 10);
  if (!Number.isFinite(customerId)) {
    log.warn("invalid user_id metadata", { session_id: session.id, userIdRaw });
    return;
  }

  const stripeSubscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;

  // Idempotency: if a row already exists for this stripe_subscription_id, no-op.
  if (stripeSubscriptionId) {
    const existing = await db
      .select()
      .from(citationTrackerSubscriptions)
      .where(eq(citationTrackerSubscriptions.stripe_subscription_id, stripeSubscriptionId))
      .limit(1);
    if (existing.length > 0) {
      log.info("subscription row already exists — skipping insert", { stripe_subscription_id: stripeSubscriptionId });
      return;
    }
  }

  const payload: InsertCitationTrackerSubscription = {
    customer_id: customerId,
    business_name: businessName,
    nap: nap as any,
    plan_tier: planTier,
    stripe_subscription_id: stripeSubscriptionId ?? undefined,
    status: "active",
    canceled_at: null,
  };

  try {
    await db.insert(citationTrackerSubscriptions).values(payload);
    log.info("citation_tracker subscription created", {
      customer_id: customerId,
      plan_tier: planTier,
      stripe_subscription_id: stripeSubscriptionId,
    });
  } catch (err: any) {
    log.error("failed to insert citation_tracker subscription", { error: err?.message });
    throw err;
  }
}

/* ─── Subscription updates ────────────────────────────────────────── */

export async function handleCitationTrackerSubscriptionEvent(sub: Stripe.Subscription): Promise<void> {
  const status = mapStripeStatus(sub.status);
  const canceledAt = status === "canceled" ? new Date() : null;

  // Try to find an existing row first by stripe_subscription_id.
  const existing = await db
    .select()
    .from(citationTrackerSubscriptions)
    .where(eq(citationTrackerSubscriptions.stripe_subscription_id, sub.id))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(citationTrackerSubscriptions)
      .set({
        status,
        canceled_at: canceledAt ?? existing[0].canceled_at,
      })
      .where(eq(citationTrackerSubscriptions.id, existing[0].id));
    return;
  }

  // No row yet — try to backfill via user_id metadata + match to most
  // recent active row without a stripe_subscription_id.
  const userIdRaw = sub.metadata?.user_id;
  if (!userIdRaw) {
    log.warn("subscription event without user_id metadata and no existing row — skipping", { stripe_subscription_id: sub.id });
    return;
  }
  const customerId = parseInt(userIdRaw, 10);
  if (!Number.isFinite(customerId)) return;

  const unlinked = await db
    .select()
    .from(citationTrackerSubscriptions)
    .where(and(
      eq(citationTrackerSubscriptions.customer_id, customerId),
      eq(citationTrackerSubscriptions.status, "active"),
    ))
    .limit(1);

  if (unlinked.length > 0) {
    await db
      .update(citationTrackerSubscriptions)
      .set({ stripe_subscription_id: sub.id, status, canceled_at: canceledAt ?? unlinked[0].canceled_at })
      .where(eq(citationTrackerSubscriptions.id, unlinked[0].id));
  }
}

function mapStripeStatus(status: Stripe.Subscription.Status): "active" | "canceled" | "past_due" {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  return "canceled";
}

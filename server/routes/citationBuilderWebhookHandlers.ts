/**
 * Citation Builder — Stripe webhook integration.
 *
 * Branches on metadata.product === "citation_builder" inside the
 * existing billing-webhook event loop (stripeBillingRoutes.ts). No
 * parallel webhook ships — we extend the existing one.
 *
 * Lifecycle:
 *   checkout.session.completed
 *     → insert citation_builder_submissions row in "pending" status
 *       (or update if a row exists with this session_id), stamp
 *       stripe_payment_intent_id, fire welcome email.
 */
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../db";
import {
  citationBuilderSubmissions,
  CITATION_BUILDER_TIER_DIRECTORIES,
} from "@shared/schema";
import { createLogger } from "../lib/logger";
import { sendCitationBuilderOrderEmail } from "../lib/citationBuilderOrderEmail";

const log = createLogger("citation-builder-webhook");

export function isCitationBuilderCheckout(session: Stripe.Checkout.Session): boolean {
  return session.metadata?.product === "citation_builder";
}

export async function handleCitationBuilderCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const tier = (session.metadata?.tier || "starter") as "starter" | "pro" | "premium";
  let businessInfo: Record<string, any> = {};
  try {
    if (session.metadata?.business_info) businessInfo = JSON.parse(session.metadata.business_info);
  } catch {
    // intentionally tolerant — ops can fill via portal "edit submission"
  }

  const userIdRaw = session.metadata?.user_id || "";
  const customerId = parseInt(userIdRaw, 10);
  if (!Number.isFinite(customerId)) {
    log.warn("citation_builder checkout missing/invalid user_id metadata — skipping insert", { session_id: session.id });
    // Soft-fail: order completed but we can't tie it to a portal account.
    // Ops will reach out via session.customer_email + intake form.
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

  // Idempotency — bail if a row already exists for this session.
  const existing = await db
    .select()
    .from(citationBuilderSubmissions)
    .where(eq(citationBuilderSubmissions.stripe_session_id, session.id))
    .limit(1);
  if (existing.length > 0) {
    log.info("citation_builder submission already exists — skipping", { session_id: session.id });
    return;
  }

  try {
    await db.insert(citationBuilderSubmissions).values({
      customer_id: customerId,
      tier,
      business_info: businessInfo as any,
      status: "pending",
      stripe_payment_intent_id: paymentIntentId ?? undefined,
      stripe_session_id: session.id,
      directories_total: CITATION_BUILDER_TIER_DIRECTORIES[tier] ?? 25,
    });
    log.info("citation_builder submission created", { customer_id: customerId, tier });

    // Order confirmation email (fire-and-forget, don't block webhook).
    const toEmail = session.customer_details?.email || session.customer_email;
    if (toEmail) {
      sendCitationBuilderOrderEmail({
        recipientEmail: toEmail,
        businessName: (businessInfo.name as string) || "your business",
        tier,
        directoriesTotal: CITATION_BUILDER_TIER_DIRECTORIES[tier] ?? 25,
      }).catch(err => log.warn("order email failed", { error: err?.message }));
    }
  } catch (err: any) {
    log.error("failed to insert citation_builder submission", { error: err?.message });
    throw err;
  }
}

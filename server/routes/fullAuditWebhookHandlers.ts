/**
 * Full Audit Master — Stripe webhook integration.
 *
 * Branches on metadata.product === "full_audit_master" inside the
 * existing billing-webhook event loop (stripeBillingRoutes.ts).
 *
 * Lifecycle:
 *   checkout.session.completed
 *     → insert full_audit_master_orders row in "pending" status (or
 *       update existing), stamp stripe_payment_intent_id, schedule
 *       async audit run (placeholder — Wave 3.6 hooks the real
 *       five-tool audit pipeline), fire delivery email when complete.
 */
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { fullAuditMasterOrders } from "@shared/schema";
import { createLogger } from "../lib/logger";
import { sendFullAuditDeliveryEmail } from "../lib/fullAuditDeliveryEmail";

const log = createLogger("full-audit-webhook");

export function isFullAuditMasterCheckout(session: Stripe.Checkout.Session): boolean {
  return session.metadata?.product === "full_audit_master";
}

export async function handleFullAuditMasterCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const businessUrl = session.metadata?.business_url || "";
  const email = session.metadata?.email || session.customer_details?.email || session.customer_email || "";

  if (!email || !businessUrl) {
    log.warn("full_audit_master checkout missing email/business_url metadata", { session_id: session.id });
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

  // Idempotency.
  const existing = await db
    .select()
    .from(fullAuditMasterOrders)
    .where(eq(fullAuditMasterOrders.stripe_session_id, session.id))
    .limit(1);
  if (existing.length > 0) {
    log.info("full_audit_master order already exists — skipping", { session_id: session.id });
    return;
  }

  let orderId: string;
  try {
    const [row] = await db.insert(fullAuditMasterOrders).values({
      customer_email: email,
      business_url: businessUrl,
      status: "pending",
      stripe_payment_intent_id: paymentIntentId ?? undefined,
      stripe_session_id: session.id,
    }).returning();
    orderId = row.id;
    log.info("full_audit_master order created", { email, business_url: businessUrl });
  } catch (err: any) {
    log.error("failed to insert full_audit_master order", { error: err?.message });
    throw err;
  }

  // Kick off the audit run + delivery email (fire-and-forget, don't
  // block the webhook). Wave 3.6 will replace the placeholder with the
  // real five-tool aggregated audit pipeline.
  runFullAuditAndEmail(orderId, email, businessUrl).catch(err =>
    log.warn("audit run failed", { error: err?.message, orderId }),
  );
}

async function runFullAuditAndEmail(orderId: string, email: string, businessUrl: string): Promise<void> {
  try {
    await db.update(fullAuditMasterOrders)
      .set({ status: "running" })
      .where(eq(fullAuditMasterOrders.id, orderId));

    // Placeholder: real audit pipeline lands in Wave 3.6. For now we
    // mark complete with a stub payload so the delivery email goes out
    // and the customer can use their portal link to track the report.
    const result_payload = {
      placeholder: true,
      message: "Your audit is queued — full report arrives within 10 minutes.",
    };

    await db.update(fullAuditMasterOrders)
      .set({
        status: "completed",
        completed_at: new Date(),
        result_payload: result_payload as any,
      })
      .where(eq(fullAuditMasterOrders.id, orderId));

    const baseUrl = process.env.APP_URL || "https://wefixtrades.com";
    const resultUrl = `${baseUrl}/tools/free-audit?order=${orderId}`;
    await sendFullAuditDeliveryEmail({
      recipientEmail: email,
      businessUrl,
      resultUrl,
    });
  } catch (err: any) {
    log.error("audit run + email failed", { error: err?.message, orderId });
    await db.update(fullAuditMasterOrders)
      .set({ status: "failed" })
      .where(eq(fullAuditMasterOrders.id, orderId));
  }
}

/**
 * Full Audit Master — Stripe webhook integration.
 *
 * Branches on metadata.product === "full_audit_master" inside the
 * existing billing-webhook event loop (stripeBillingRoutes.ts).
 *
 * Lifecycle:
 *   checkout.session.completed
 *     → insert full_audit_master_orders row in "pending" status
 *     → mint a per-order share_token (acts as the bearer in the public
 *       /full-audit-report/:id/:token route)
 *     → kick off the real 5-section Master Audit pipeline (Wave 3.6)
 *     → on success: status → "completed", persist MasterAuditReport JSON
 *       in result_payload, fire delivery email with the share URL
 *     → on failure: status → "failed", fire failure email (with refund
 *       link) instead of leaving the order in "running" forever
 */
import * as crypto from "node:crypto";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { fullAuditMasterOrders } from "@shared/schema";
import { createLogger } from "../lib/logger";
import { sendFullAuditDeliveryEmail, sendFullAuditFailureEmail } from "../lib/fullAuditDeliveryEmail";
import { runFullAuditMaster, isReportHalfEmpty } from "../services/fullAuditMaster/pipeline";

const log = createLogger("full-audit-webhook");

export function isFullAuditMasterCheckout(session: Stripe.Checkout.Session): boolean {
  return session.metadata?.product === "full_audit_master";
}

function buildShareUrl(orderId: string, token: string): string {
  const base = process.env.APP_URL || "https://wefixtrades.com";
  return `${base}/full-audit-report/${orderId}/${token}`;
}

function normalizeWebsite(input: string): string {
  // Stripe checkout collects the URL pre-validated to Zod's z.string().url(),
  // but defensively ensure a protocol so the pipeline's fetchers don't
  // choke on bare domains.
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
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

  // Idempotency — webhooks can re-fire.
  const existing = await db
    .select()
    .from(fullAuditMasterOrders)
    .where(eq(fullAuditMasterOrders.stripe_session_id, session.id))
    .limit(1);
  if (existing.length > 0) {
    log.info("full_audit_master order already exists — skipping", { session_id: session.id });
    return;
  }

  // 32-byte url-safe token paired with the order UUID in the public
  // share URL. Long enough to be unguessable, short enough not to break
  // the email-friendly line-length.
  const shareToken = crypto.randomBytes(24).toString("base64url");

  let orderId: string;
  try {
    const [row] = await db.insert(fullAuditMasterOrders).values({
      customer_email: email,
      business_url: businessUrl,
      status: "pending",
      stripe_payment_intent_id: paymentIntentId ?? undefined,
      stripe_session_id: session.id,
      report_share_token: shareToken,
    }).returning();
    orderId = row.id;
    log.info("full_audit_master order created", { email, business_url: businessUrl, orderId });
  } catch (err: any) {
    log.error("failed to insert full_audit_master order", { error: err?.message });
    throw err;
  }

  // Kick off the audit + delivery email. We `await` instead of true
  // fire-and-forget so the audit completes in the same request lifecycle
  // (the spec says ~30-60s; Stripe webhook handler has a 5min ceiling).
  // Catch-all so the webhook still returns 200 to Stripe regardless of
  // pipeline outcome — failures are persisted to the order row.
  try {
    await runPipelineAndDeliver(orderId, email, normalizeWebsite(businessUrl), shareToken);
  } catch (err: any) {
    log.warn("pipeline failed (already persisted to order)", { error: err?.message, orderId });
  }
}

async function runPipelineAndDeliver(
  orderId: string,
  email: string,
  websiteUrl: string,
  shareToken: string,
): Promise<void> {
  await db.update(fullAuditMasterOrders)
    .set({ status: "running", started_at: new Date() })
    .where(eq(fullAuditMasterOrders.id, orderId));

  let report;
  try {
    report = await runFullAuditMaster({
      orderId,
      websiteUrl,
      // Use the URL host as a friendly business-name fallback; the
      // checkout flow doesn't currently capture a business name.
      businessName: new URL(websiteUrl).hostname.replace(/^www\./, ""),
    });
  } catch (err: any) {
    log.error("pipeline threw", { error: err?.message, orderId });
    await db.update(fullAuditMasterOrders)
      .set({
        status: "failed",
        failed_at: new Date(),
        error_message: String(err?.message || "Pipeline error").slice(0, 500),
      })
      .where(eq(fullAuditMasterOrders.id, orderId));
    await sendFullAuditFailureEmail({
      recipientEmail: email,
      businessUrl: websiteUrl,
      orderId,
    }).catch((e) => log.warn("failure-email send failed", { error: e?.message }));
    return;
  }

  await db.update(fullAuditMasterOrders)
    .set({
      status: "completed",
      completed_at: new Date(),
      result_payload: report as any,
    })
    .where(eq(fullAuditMasterOrders.id, orderId));

  const shareUrl = buildShareUrl(orderId, shareToken);

  // If more than 2 of 5 sections failed (after the one retry inside the
  // pipeline), apologise + offer refund rather than email a half-empty
  // report.
  if (isReportHalfEmpty(report)) {
    log.warn("report is half-empty — sending apology", { orderId });
    await sendFullAuditFailureEmail({
      recipientEmail: email,
      businessUrl: websiteUrl,
      orderId,
    }).catch((e) => log.warn("apology-email send failed", { error: e?.message }));
    return;
  }

  await sendFullAuditDeliveryEmail({
    recipientEmail: email,
    businessUrl: websiteUrl,
    resultUrl: shareUrl,
    report,
  }).catch((e) => log.warn("delivery-email send failed", { error: e?.message }));
}

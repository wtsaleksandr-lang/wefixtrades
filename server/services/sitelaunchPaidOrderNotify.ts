/**
 * SiteLaunch paid-order notification + tracked kickoff task.
 *
 * SiteLaunch ($1,197, 5-day delivery promise) is fulfilled outsourced / AI-
 * built, but there is NO supplier-dispatch automation. Before this, a paid
 * SiteLaunch order created its CRM rows + granular template tasks and then
 * silently waited for Alex to notice the new row. The smallest worthwhile
 * fix: the instant a SiteLaunch order is paid, (1) notify Alex via the
 * existing alert channel and (2) drop ONE clear, actionable kickoff task that
 * anchors the 5-day delivery clock — so the order can never sit unseen.
 *
 * Reuses the existing notification mechanism (fireAlert → system_alerts row +
 * admin email + optional Slack) and the existing fulfillment-task surface
 * (createFulfillmentTask). It does NOT invent a new channel.
 *
 * Contract:
 *   - Scoped to SiteLaunch only (isSiteLaunchServiceId).
 *   - Idempotent: keyed off the Stripe session id stamped into the kickoff
 *     task's metadata. Stripe retries the webhook; this fires at most once
 *     per (client_service, session).
 *   - Non-blocking: never throws. Errors are logged (no silent catch), so a
 *     notification failure can never break webhook provisioning.
 */

import { storage } from "../storage";
import { fireAlert } from "./alertService";
import { createLogger } from "../lib/logger";

const log = createLogger("SiteLaunchPaidOrderNotify");

/** SiteLaunch product id (shared/pricing.ts → SITELAUNCH.id === "sitelaunch"). */
export const SITELAUNCH_SERVICE_PREFIX = "sitelaunch";

/** The delivery promise on the product page. */
export const SITELAUNCH_DELIVERY_DAYS = 5;

/**
 * Pure predicate: is this service catalog id a SiteLaunch order?
 *
 * Matches the canonical product id and any tier/variant beneath it
 * (e.g. "sitelaunch", "sitelaunch-pro") — mirrors how the rest of the
 * codebase detects product families (serviceId.startsWith(...)). Excludes
 * lookalikes that merely contain the substring.
 */
export function isSiteLaunchServiceId(serviceId: string | null | undefined): boolean {
  if (!serviceId) return false;
  const id = serviceId.trim().toLowerCase();
  return id === SITELAUNCH_SERVICE_PREFIX || id.startsWith(`${SITELAUNCH_SERVICE_PREFIX}-`);
}

/** Marker written into the kickoff task metadata for idempotency + discovery. */
const KICKOFF_MARKER = "sitelaunch_paid_kickoff";

export interface SiteLaunchPaidOrderInput {
  /** Stripe checkout session id — the idempotency key. */
  sessionId: string;
  clientId: number;
  /** The SiteLaunch service catalog id (already confirmed SiteLaunch). */
  serviceId: string;
  /** The provisioned client_service row id (where the kickoff task is filed). */
  clientServiceId: number;
  /** Settled amount in cents (session.amount_total). */
  amountCents: number | null | undefined;
  currency: string | null | undefined;
}

export interface SiteLaunchNotifyResult {
  notified: boolean;
  taskId?: number;
  /** Why nothing was done — "already_notified" | "not_sitelaunch" | error string. */
  reason?: string;
}

function formatAmount(amountCents: number | null | undefined, currency: string | null | undefined): string {
  if (typeof amountCents !== "number") return "amount unknown";
  const symbol = (currency || "usd").toLowerCase() === "gbp" ? "£" : "$";
  return `${symbol}${(amountCents / 100).toFixed(2)}`;
}

/**
 * Notify Alex + create the tracked kickoff task for a PAID SiteLaunch order.
 *
 * Idempotent on the Stripe session id (the webhook can retry). Never throws —
 * the caller is the Stripe webhook and must not be disrupted; failures are
 * logged, not swallowed silently.
 *
 * Callers MUST gate on isSiteLaunchServiceId() before invoking, but this also
 * self-guards so it is safe to call defensively.
 */
export async function notifySiteLaunchPaidOrder(
  input: SiteLaunchPaidOrderInput,
): Promise<SiteLaunchNotifyResult> {
  const { sessionId, clientId, serviceId, clientServiceId, amountCents, currency } = input;

  if (!isSiteLaunchServiceId(serviceId)) {
    return { notified: false, reason: "not_sitelaunch" };
  }

  try {
    // ── Idempotency ──────────────────────────────────────────────────────
    // Stripe can deliver checkout.session.completed more than once. Key off
    // the session id stamped into a prior kickoff task's metadata for THIS
    // client_service — fire at most once per (client_service, session).
    const existingTasks = await storage.listFulfillmentTasks({ clientId, limit: 200 });
    const already = existingTasks.find((t) => {
      if (t.client_service_id !== clientServiceId) return false;
      const meta = (t.metadata as Record<string, any> | null) || {};
      return meta[KICKOFF_MARKER] === true && meta.stripe_session_id === sessionId;
    });
    if (already) {
      log.info(
        `SiteLaunch paid-order notify already fired for session ${sessionId} (client_service #${clientServiceId}, task #${already.id}) — skipping`,
      );
      return { notified: false, taskId: already.id, reason: "already_notified" };
    }

    // Best-effort client context for a useful notification (never fatal).
    let businessName = `client #${clientId}`;
    let contact: string | null = null;
    try {
      const client = await storage.getClientById(clientId);
      if (client) {
        businessName = client.business_name || businessName;
        contact = client.contact_email || client.contact_phone || null;
      }
    } catch (err: any) {
      log.warn(`SiteLaunch notify: client #${clientId} lookup failed (non-fatal): ${err.message}`);
    }

    const clockStart = new Date();
    const dueAt = new Date(clockStart.getTime() + SITELAUNCH_DELIVERY_DAYS * 86_400_000);
    const amountLabel = formatAmount(amountCents, currency);

    // ── 1. Tracked, actionable kickoff task (the 5-day clock anchor) ─────
    // One clear "START the build" task — not just the granular template
    // sub-steps — with a hard due date matching the delivery promise.
    const task = await storage.createFulfillmentTask({
      client_service_id: clientServiceId,
      client_id: clientId,
      title: `🚀 START SiteLaunch build — ${SITELAUNCH_DELIVERY_DAYS}-day delivery clock running`,
      description:
        `Paid SiteLaunch order (${amountLabel}) for ${businessName}.\n` +
        `NO supplier-dispatch automation exists for SiteLaunch — dispatch the build manually now.\n` +
        `\n` +
        `Delivery promise: ${SITELAUNCH_DELIVERY_DAYS} days. Clock started ${clockStart.toISOString()} → due ${dueAt.toISOString()}.\n` +
        (contact ? `Client contact: ${contact}\n` : "") +
        `Stripe session: ${sessionId}`,
      sort_order: 0,
      priority: "high",
      handled_by: "internal",
      waiting_on: null,
      human_review_required: false,
      due_at: dueAt,
      status: "not_started",
      actor_type: "system",
      metadata: {
        [KICKOFF_MARKER]: true,
        stripe_session_id: sessionId,
        service_id: serviceId,
        amount_cents: typeof amountCents === "number" ? amountCents : null,
        currency: currency ?? null,
        delivery_days: SITELAUNCH_DELIVERY_DAYS,
        clock_started_at: clockStart.toISOString(),
        due_at: dueAt.toISOString(),
        auto_created: true,
        auto_created_reason: "sitelaunch_paid_order",
      },
    });

    // ── 2. Notify Alex immediately via the existing alert channel ────────
    // fireAlert: system_alerts row + admin email + optional Slack, with its
    // own 1-hour (category+title) dedupe. Title carries the session id so
    // distinct orders stay distinct in the dedupe window.
    await fireAlert({
      severity: "warning",
      category: "sitelaunch_paid_order",
      title: `SiteLaunch paid — START build (${businessName}) [${sessionId}]`,
      details:
        `${businessName} just paid ${amountLabel} for SiteLaunch.\n` +
        `5-day delivery clock started ${clockStart.toISOString()} — due ${dueAt.toISOString()}.\n` +
        (contact ? `Contact: ${contact}\n` : "") +
        `No supplier-dispatch automation exists — dispatch the build manually. ` +
        `Kickoff task #${task.id} created.`,
      metadata: {
        client_id: clientId,
        client_service_id: clientServiceId,
        service_id: serviceId,
        stripe_session_id: sessionId,
        amount_cents: typeof amountCents === "number" ? amountCents : null,
        currency: currency ?? null,
        kickoff_task_id: task.id,
        due_at: dueAt.toISOString(),
      },
    });

    // ── 3. Durable audit trail ───────────────────────────────────────────
    try {
      await storage.logAdminActivity({
        actor_type: "system",
        actor_name: "SiteLaunchPaidOrderNotify",
        action: "sitelaunch.paid_order_notified",
        entity_type: "client",
        entity_id: clientId,
        summary: `SiteLaunch paid (${amountLabel}) — admin alerted, kickoff task #${task.id} created (${SITELAUNCH_DELIVERY_DAYS}-day clock → ${dueAt.toISOString()})`,
        metadata: {
          stripe_session_id: sessionId,
          client_service_id: clientServiceId,
          kickoff_task_id: task.id,
          service_id: serviceId,
        },
      });
    } catch (err: any) {
      log.warn(`SiteLaunch notify: admin-activity log failed (non-fatal): ${err.message}`);
    }

    log.info(
      `SiteLaunch paid-order notify fired for session ${sessionId} (client #${clientId}) — task #${task.id}, due ${dueAt.toISOString()}`,
    );
    return { notified: true, taskId: task.id };
  } catch (err: any) {
    // Never break the webhook. Log loudly (no silent catch) and report back.
    log.error(
      `SiteLaunch paid-order notify FAILED for session ${sessionId} (client #${clientId}): ${err?.message ?? err}`,
      { err },
    );
    return { notified: false, reason: `error: ${err?.message ?? err}` };
  }
}

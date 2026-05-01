/**
 * Dunning service — schedule, cancel, send.
 *
 * Pure data operations on the billing_dunning_events table. The actual
 * email delivery happens in dunningWorker.ts, which calls sendDunningRow().
 *
 * Idempotency model:
 *   1. Schema-level: UNIQUE (stripe_subscription_id, trigger_event_id, kind)
 *      via the manual where-clause guard below — Stripe redelivers events
 *      occasionally, and ON CONFLICT DO NOTHING semantics on duplicate
 *      (event_id, kind) keep the schedule clean.
 *   2. 24h resend guard: enforced in the worker before each send by
 *      hasRecentSendOfKind() — prevents two of the same kind landing
 *      within 24 hours even if a second trigger event arrives.
 *   3. Cancellation: cancelPendingForSubscription() flips all 'pending'
 *      rows for a sub to 'cancelled' when payment succeeds or sub is
 *      canceled, so already-scheduled reminders never go out.
 *
 * Day 0 is intentionally NOT scheduled here — the existing
 * paymentFailedEmail.ts module handles the immediate heads-up email
 * from the same webhook. This module schedules Day 2 / Day 5 / Day 7.
 */

import { db } from "../db";
import { billingDunningEvents, clients, type BillingDunningEvent } from "@shared/schema";
import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import {
  buildDay2ReminderEmail,
  buildDay5FinalReminderEmail,
  buildDay7WarningEmail,
  buildCardExpiringEmail,
  buildSubscriptionCanceledEmail,
} from "../lib/dunningEmails";
import { buildBillingPortalUrl } from "../lib/billingPortalToken";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import { isEmailUnsubscribed } from "../lib/unsubscribeStorage";
import { createLogger } from "../lib/logger";

const log = createLogger("DunningService");

const DUNNING_FROM_NAME = "WeFixTrades Billing";

const DAY_MS = 24 * 60 * 60 * 1000;

export type DunningKind =
  | "day_2_reminder"
  | "day_5_final"
  | "day_7_warning"
  | "card_expiring"
  | "subscription_canceled";

export type DunningTrigger = "payment_failed" | "card_expiring" | "subscription_canceled";

interface ScheduleFailedPaymentParams {
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  stripeInvoiceId: string | null;
  triggerEventId: string;
  amountCents?: number;
  currency?: string;
  clientId?: number | null;
  failedAt?: Date;        // defaults to now
}

/**
 * Schedule the day-2 / day-5 / day-7 dunning emails for a failed payment.
 *
 * Idempotent on (subscription_id, trigger_event_id, kind) — re-running with
 * the same Stripe event id is a no-op. Returns the rows actually inserted.
 */
export async function scheduleFailedPaymentSequence(params: ScheduleFailedPaymentParams): Promise<{
  scheduled: number;
  skipped: number;
  rows: BillingDunningEvent[];
}> {
  const failedAt = params.failedAt || new Date();
  const kinds: Array<{ kind: DunningKind; offsetDays: number }> = [
    { kind: "day_2_reminder", offsetDays: 2 },
    { kind: "day_5_final", offsetDays: 5 },
    { kind: "day_7_warning", offsetDays: 7 },
  ];

  let scheduled = 0;
  let skipped = 0;
  const rows: BillingDunningEvent[] = [];

  for (const { kind, offsetDays } of kinds) {
    const scheduledFor = new Date(failedAt.getTime() + offsetDays * DAY_MS);

    // Idempotency: skip if a row already exists for (sub, event, kind).
    // We don't rely on a unique constraint (which would require a migration)
    // — the SELECT-then-INSERT pattern is safe enough here because dunning
    // scheduling is single-writer (the webhook handler).
    const existing = await db.select({ id: billingDunningEvents.id })
      .from(billingDunningEvents)
      .where(and(
        params.stripeSubscriptionId
          ? eq(billingDunningEvents.stripe_subscription_id, params.stripeSubscriptionId)
          : isNull(billingDunningEvents.stripe_subscription_id),
        eq(billingDunningEvents.trigger_event_id, params.triggerEventId),
        eq(billingDunningEvents.kind, kind),
      ))
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    const [inserted] = await db.insert(billingDunningEvents).values({
      client_id: params.clientId ?? null,
      stripe_customer_id: params.stripeCustomerId,
      stripe_subscription_id: params.stripeSubscriptionId,
      stripe_invoice_id: params.stripeInvoiceId,
      trigger_event: "payment_failed",
      trigger_event_id: params.triggerEventId,
      kind,
      scheduled_for: scheduledFor,
      status: "pending",
      amount_cents: params.amountCents ?? null,
      currency: params.currency ?? null,
      metadata: null,
    }).returning();

    if (inserted) {
      scheduled++;
      rows.push(inserted);
    }
  }

  log.info(`[dunning] scheduled ${scheduled}/${kinds.length} for sub=${params.stripeSubscriptionId ?? "none"} event=${params.triggerEventId}`);
  return { scheduled, skipped, rows };
}

/**
 * Schedule a single one-shot card-expiring email. Sent immediately
 * (scheduled_for = now), but goes through the same worker path so it
 * picks up the 24h resend guard, unsubscribe check, and idempotency.
 */
export async function scheduleCardExpiringEmail(params: {
  stripeCustomerId: string;
  triggerEventId: string;
  clientId?: number | null;
  cardLast4?: string;
  cardBrand?: string;
  expMonth?: number;
  expYear?: number;
}): Promise<{ scheduled: number; skipped: number }> {
  // Same-event idempotency on (customer, event, kind="card_expiring")
  const existing = await db.select({ id: billingDunningEvents.id })
    .from(billingDunningEvents)
    .where(and(
      eq(billingDunningEvents.stripe_customer_id, params.stripeCustomerId),
      eq(billingDunningEvents.trigger_event_id, params.triggerEventId),
      eq(billingDunningEvents.kind, "card_expiring"),
    ))
    .limit(1);

  if (existing.length > 0) return { scheduled: 0, skipped: 1 };

  await db.insert(billingDunningEvents).values({
    client_id: params.clientId ?? null,
    stripe_customer_id: params.stripeCustomerId,
    stripe_subscription_id: null,
    stripe_invoice_id: null,
    trigger_event: "card_expiring",
    trigger_event_id: params.triggerEventId,
    kind: "card_expiring",
    scheduled_for: new Date(),
    status: "pending",
    metadata: {
      card_last4: params.cardLast4 ?? null,
      card_brand: params.cardBrand ?? null,
      exp_month: params.expMonth ?? null,
      exp_year: params.expYear ?? null,
    },
  });

  return { scheduled: 1, skipped: 0 };
}

/**
 * Schedule a single one-shot subscription-canceled confirmation email.
 * Also cancels any pending dunning rows for the same subscription so we
 * don't keep nagging a customer who has already canceled.
 */
export async function scheduleSubscriptionCanceledEmail(params: {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  triggerEventId: string;
  clientId?: number | null;
  serviceName?: string;
}): Promise<{ scheduled: number; skipped: number; cancelled_pending: number }> {
  const cancelledPending = await cancelPendingForSubscription({
    stripeSubscriptionId: params.stripeSubscriptionId,
    reason: "subscription_canceled",
  });

  const existing = await db.select({ id: billingDunningEvents.id })
    .from(billingDunningEvents)
    .where(and(
      eq(billingDunningEvents.stripe_subscription_id, params.stripeSubscriptionId),
      eq(billingDunningEvents.trigger_event_id, params.triggerEventId),
      eq(billingDunningEvents.kind, "subscription_canceled"),
    ))
    .limit(1);

  if (existing.length > 0) return { scheduled: 0, skipped: 1, cancelled_pending: cancelledPending };

  await db.insert(billingDunningEvents).values({
    client_id: params.clientId ?? null,
    stripe_customer_id: params.stripeCustomerId,
    stripe_subscription_id: params.stripeSubscriptionId,
    stripe_invoice_id: null,
    trigger_event: "subscription_canceled",
    trigger_event_id: params.triggerEventId,
    kind: "subscription_canceled",
    scheduled_for: new Date(),
    status: "pending",
    metadata: { service_name: params.serviceName ?? null },
  });

  return { scheduled: 1, skipped: 0, cancelled_pending: cancelledPending };
}

/**
 * Cancel all pending dunning rows for a subscription. Called on:
 *   - invoice.payment_succeeded → reason "payment_succeeded"
 *   - customer.subscription.deleted → reason "subscription_canceled"
 *
 * Returns the number of rows cancelled. Idempotent — re-running is a no-op.
 */
export async function cancelPendingForSubscription(params: {
  stripeSubscriptionId: string;
  reason: "payment_succeeded" | "subscription_canceled" | "manual";
}): Promise<number> {
  const result = await db.update(billingDunningEvents)
    .set({
      status: "cancelled",
      cancel_reason: params.reason,
      updated_at: new Date(),
    })
    .where(and(
      eq(billingDunningEvents.stripe_subscription_id, params.stripeSubscriptionId),
      eq(billingDunningEvents.status, "pending"),
    ))
    .returning({ id: billingDunningEvents.id });

  if (result.length > 0) {
    log.info(`[dunning] cancelled ${result.length} pending row(s) for sub=${params.stripeSubscriptionId} reason=${params.reason}`);
  }
  return result.length;
}

/**
 * Look up rows due for sending. Used by the worker.
 */
export async function listDuePending(now: Date = new Date(), limit = 100): Promise<BillingDunningEvent[]> {
  return db.select().from(billingDunningEvents)
    .where(and(
      eq(billingDunningEvents.status, "pending"),
      lte(billingDunningEvents.scheduled_for, now),
    ))
    .orderBy(billingDunningEvents.scheduled_for)
    .limit(limit);
}

/**
 * 24h resend guard — has the same kind been sent to the same subscription
 * (or customer for card_expiring) within the last 24 hours?
 *
 * Belt-and-braces protection on top of the per-event idempotency: if two
 * webhook events with different IDs both schedule a day_2_reminder for
 * the same subscription within 24h, only the first sends.
 */
export async function hasRecentSendOfKind(row: BillingDunningEvent): Promise<boolean> {
  const cutoff = new Date(Date.now() - DAY_MS);
  const existing = await db.select({ id: billingDunningEvents.id })
    .from(billingDunningEvents)
    .where(and(
      eq(billingDunningEvents.kind, row.kind),
      eq(billingDunningEvents.status, "sent"),
      gte(billingDunningEvents.sent_at, cutoff),
      // Match on subscription where we have one, customer otherwise (card_expiring)
      row.stripe_subscription_id
        ? eq(billingDunningEvents.stripe_subscription_id, row.stripe_subscription_id)
        : eq(billingDunningEvents.stripe_customer_id, row.stripe_customer_id),
      sql`${billingDunningEvents.id} != ${row.id}`,
    ))
    .limit(1);
  return existing.length > 0;
}

/**
 * Send a single dunning row. Pulls the recipient email from the linked
 * client (or attempts a Stripe-customer-id match if client_id is null at
 * row creation time). Marks the row 'sent' on success or 'failed' /
 * 'skipped' with cancel_reason on each known skip path.
 */
export async function sendDunningRow(row: BillingDunningEvent): Promise<{
  outcome: "sent" | "skipped" | "failed";
  reason?: string;
}> {
  // Resolve client (re-attempt match if scheduling happened before client linked)
  let clientId = row.client_id;
  let client: { id: number; contact_email: string | null; contact_name: string | null; business_name: string | null } | null = null;

  if (clientId) {
    const [c] = await db.select({
      id: clients.id,
      contact_email: clients.contact_email,
      contact_name: clients.contact_name,
      business_name: clients.business_name,
    }).from(clients).where(eq(clients.id, clientId)).limit(1);
    client = c ?? null;
  } else {
    const [c] = await db.select({
      id: clients.id,
      contact_email: clients.contact_email,
      contact_name: clients.contact_name,
      business_name: clients.business_name,
    }).from(clients).where(eq(clients.stripe_customer_id, row.stripe_customer_id)).limit(1);
    if (c) {
      client = c;
      clientId = c.id;
      await db.update(billingDunningEvents)
        .set({ client_id: c.id, updated_at: new Date() })
        .where(eq(billingDunningEvents.id, row.id));
    }
  }

  if (!client?.contact_email) {
    await markRow(row.id, "skipped", "no_client_email");
    return { outcome: "skipped", reason: "no_client_email" };
  }

  if (await isEmailUnsubscribed(client.contact_email)) {
    await markRow(row.id, "skipped", "recipient_unsubscribed");
    return { outcome: "skipped", reason: "recipient_unsubscribed" };
  }

  // 24h resend guard
  if (await hasRecentSendOfKind(row)) {
    await markRow(row.id, "skipped", "resend_guard");
    return { outcome: "skipped", reason: "resend_guard" };
  }

  const transporter = getEmailTransporter();
  if (!transporter) {
    await markRow(row.id, "failed", "smtp_not_configured");
    return { outcome: "failed", reason: "smtp_not_configured" };
  }

  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  const supportEmail = process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress();
  const portalUrl = buildBillingPortalUrl({
    stripeCustomerId: row.stripe_customer_id,
    baseUrl,
  });

  const contactFirstName = (client.contact_name || client.business_name || "").split(" ")[0] || "";
  const amount = row.amount_cents != null ? formatMoney(row.amount_cents, row.currency || "usd") : undefined;

  const baseParams = {
    contactFirstName,
    amount,
    portalUrl,
    supportEmail,
    recipientEmail: client.contact_email,
  };

  let composed: { subject: string; html: string; text: string };
  switch (row.kind) {
    case "day_2_reminder":
      composed = buildDay2ReminderEmail(baseParams);
      break;
    case "day_5_final":
      composed = buildDay5FinalReminderEmail(baseParams);
      break;
    case "day_7_warning":
      composed = buildDay7WarningEmail(baseParams);
      break;
    case "card_expiring": {
      const meta = (row.metadata as any) || {};
      composed = buildCardExpiringEmail({
        ...baseParams,
        cardLast4: meta.card_last4 ?? undefined,
        cardBrand: meta.card_brand ?? undefined,
        expMonth: meta.exp_month ?? undefined,
        expYear: meta.exp_year ?? undefined,
      });
      break;
    }
    case "subscription_canceled": {
      const meta = (row.metadata as any) || {};
      composed = buildSubscriptionCanceledEmail({
        ...baseParams,
        serviceName: meta.service_name ?? undefined,
      });
      break;
    }
    default:
      await markRow(row.id, "failed", `unknown_kind:${row.kind}`);
      return { outcome: "failed", reason: `unknown_kind:${row.kind}` };
  }

  try {
    const info = await transporter.sendMail({
      from: `${DUNNING_FROM_NAME} <${getFromAddress()}>`,
      to: client.contact_email,
      replyTo: supportEmail,
      subject: composed.subject,
      html: composed.html,
      text: composed.text,
    });

    await db.update(billingDunningEvents)
      .set({
        status: "sent",
        sent_at: new Date(),
        metadata: {
          ...((row.metadata as any) || {}),
          recipient_email_at_send: client.contact_email,
          message_id: (info as any)?.messageId ?? null,
        },
        updated_at: new Date(),
      })
      .where(eq(billingDunningEvents.id, row.id));

    log.info(`[dunning] sent ${row.kind} to ${client.contact_email} (row #${row.id}, client #${clientId})`);

    // Fire payment_at_risk alert on day_7_warning (3rd and final dunning step)
    if (row.kind === "day_7_warning") {
      const { fireAlert } = await import("./alertService");
      fireAlert({
        severity: "critical",
        category: "payment_at_risk",
        title: `Payment at risk: ${client.business_name || `Client #${clientId}`}`,
        details: `Day-7 final warning sent to ${client.contact_email}. Subscription ${row.stripe_subscription_id || "unknown"} may churn.`,
        metadata: { client_id: clientId, stripe_subscription_id: row.stripe_subscription_id, dunning_row_id: row.id },
      }).catch(() => {});
    }

    return { outcome: "sent" };
  } catch (err: any) {
    await db.update(billingDunningEvents)
      .set({
        status: "failed",
        metadata: {
          ...((row.metadata as any) || {}),
          last_error: err.message,
          attempt_count: (((row.metadata as any) || {}).attempt_count || 0) + 1,
        },
        updated_at: new Date(),
      })
      .where(eq(billingDunningEvents.id, row.id));

    log.error(`[dunning] sendMail failed for row #${row.id}:`, err.message);
    return { outcome: "failed", reason: `sendMail_error: ${err.message}` };
  }
}

async function markRow(id: number, status: "skipped" | "failed", reason: string): Promise<void> {
  await db.update(billingDunningEvents)
    .set({
      status,
      cancel_reason: status === "skipped" ? reason : null,
      metadata: sql`COALESCE(${billingDunningEvents.metadata}, '{}'::jsonb) || ${JSON.stringify({ skip_reason: reason })}::jsonb`,
      updated_at: new Date(),
    })
    .where(eq(billingDunningEvents.id, id));
}

function formatMoney(cents: number, currency: string): string {
  const sym = currency.toLowerCase() === "usd" ? "$"
    : currency.toLowerCase() === "cad" ? "$"
    : currency.toLowerCase() === "eur" ? "€"
    : currency.toLowerCase() === "gbp" ? "£"
    : "";
  return `${sym}${(cents / 100).toFixed(2)}`;
}

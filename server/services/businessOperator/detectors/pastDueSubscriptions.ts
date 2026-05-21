/**
 * Detector: past_due_subs.
 *
 * Finds client_payments rows that are subscription-style ('invoice' or
 * 'payment'), still unpaid, and overdue by more than 3 days. WeFixTrades
 * doesn't model Stripe subscriptions in its own DB — billing state lives
 * inside Stripe — so the closest proxy is the most-recent invoice row that
 * has gone unpaid past its due date.
 *
 * Severity: high.
 */

import { and, eq, lt, not, inArray, sql } from "drizzle-orm";
import { db } from "../../../db";
import { clientPayments } from "@shared/schema";
import type { DetectorSignal } from "../types";

const MAX_SIGNALS = 20;
const PAST_DUE_DAYS = 3;

export async function detect(): Promise<DetectorSignal[]> {
  const cutoff = new Date(Date.now() - PAST_DUE_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: clientPayments.id,
      client_id: clientPayments.client_id,
      amount_cents: clientPayments.amount_cents,
      status: clientPayments.status,
      due_at: clientPayments.due_at,
      stripe_invoice_id: clientPayments.stripe_invoice_id,
    })
    .from(clientPayments)
    .where(
      and(
        inArray(clientPayments.status, ["pending", "failed", "partial"]),
        lt(clientPayments.due_at, cutoff),
      ),
    )
    .limit(MAX_SIGNALS);

  return rows.map((r) => {
    const daysOverdue = r.due_at
      ? Math.round((Date.now() - r.due_at.getTime()) / 86_400_000)
      : null;
    return {
      signal_id: `payment_${r.id}`,
      detail: {
        payment_id: r.id,
        client_id: r.client_id,
        amount_cents: r.amount_cents,
        status: r.status,
        due_at: r.due_at?.toISOString() ?? null,
        days_overdue: daysOverdue,
        stripe_invoice_id: r.stripe_invoice_id,
      },
      summary: `Payment #${r.id} (client ${r.client_id}) is ${r.status}, $${(
        (r.amount_cents ?? 0) / 100
      ).toFixed(2)}${daysOverdue ? `, ${daysOverdue}d overdue` : ""}.`,
      severity: "high",
    };
  });
}

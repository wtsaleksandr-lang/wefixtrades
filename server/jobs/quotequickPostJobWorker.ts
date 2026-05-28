/**
 * Wave 81 — QuoteQuick post-job thank-you SMS worker.
 *
 * Every 30 minutes. Polls `bookflow_appointments` for rows where:
 *   - source = 'quotequick'           (only QuoteQuick-origin bookings)
 *   - status = 'completed'            (job is done)
 *   - post_job_thank_you_sent_at IS NULL  (idempotency)
 *   - updated_at <= now() - 1h        (~1h after completion)
 *   - customer_phone IS NOT NULL
 *
 * SMS consent is checked against the appointment's customer_phone via
 * the most-recent matching lead row (matches the existing per-tenant
 * opt-out semantics — a homeowner who consented when submitting their
 * QuoteQuick form keeps that consent through the booking lifecycle).
 *
 * Quiet-hours bypass = 'reminder'. Deferred sends keep sent_at = NULL
 * and the next 30-minute tick re-attempts naturally.
 *
 * Batched at 100 rows/tick.
 */

import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { bookflowAppointments, leads, calculators, clients } from "@shared/schema";
import { createLogger } from "../lib/logger";
import { sendPostJobThankYouSms } from "../services/quotequickHomeownerSmsService";
import { isTwilioConfigured } from "../twilioClient";

const log = createLogger("QuotequickPostJob");

const BATCH_SIZE = 100;
const COMPLETION_AGE_MS = 60 * 60 * 1000; // 1 hour

export interface PostJobResult {
  processed: number;
  sent: number;
  deferred: number;
  skipped: number;
  errors: number;
}

/**
 * Resolve consent + calculator context for the homeowner attached to a
 * given bookflow appointment. We don't have a direct FK from
 * bookflow_appointments → leads, so we fall back to matching by
 * customer_phone normalized to a 10-digit suffix, scoped to the same
 * client's calculators. Returns null when no matching lead is found —
 * the worker then skips the SMS rather than risk texting a homeowner
 * who never consented.
 */
async function resolveLeadForAppointment(
  appointment: {
    id: number;
    client_id: number;
    customer_phone: string | null;
  },
): Promise<{
  smsConsent: boolean;
  calculatorId: number | null;
  fallbackTimezone: string | null;
} | null> {
  if (!appointment.customer_phone) return null;

  // Normalize to last 10 digits (matches twilioClient.normalizePhone).
  const normalized = appointment.customer_phone.replace(/\D/g, "").slice(-10);
  if (!normalized) return null;

  // Find the calculator(s) owned by this client_id (via clients.user_id →
  // calculators.user_id) and pick the most recent matching consented lead.
  const [client] = await db
    .select({ user_id: clients.user_id })
    .from(clients)
    .where(eq(clients.id, appointment.client_id))
    .limit(1);

  if (!client?.user_id) return null;

  const [match] = await db
    .select({
      lead_id: leads.id,
      calculator_id: leads.calculator_id,
      sms_consent: leads.sms_consent,
      settings: calculators.calculator_settings,
    })
    .from(leads)
    .innerJoin(calculators, eq(leads.calculator_id, calculators.id))
    .where(
      and(
        eq(calculators.user_id, client.user_id),
        sql`regexp_replace(${leads.phone}::text, '\D', '', 'g') LIKE ${"%" + normalized}`,
      ),
    )
    .orderBy(sql`${leads.created_date} DESC`)
    .limit(1);

  if (!match) return null;

  const settings = (match.settings as any) || {};
  const timezone =
    settings.booking_settings?.timezone ||
    settings.integrations?.timezone ||
    null;

  return {
    smsConsent: !!match.sms_consent,
    calculatorId: match.calculator_id,
    fallbackTimezone: timezone,
  };
}

export async function processQuotequickPostJob(): Promise<PostJobResult> {
  const result: PostJobResult = {
    processed: 0,
    sent: 0,
    deferred: 0,
    skipped: 0,
    errors: 0,
  };

  if (!isTwilioConfigured()) {
    log.debug("Twilio not configured — skipping tick");
    return result;
  }

  const completionCutoff = new Date(Date.now() - COMPLETION_AGE_MS);

  const due = await db
    .select()
    .from(bookflowAppointments)
    .where(
      and(
        eq(bookflowAppointments.source, "quotequick"),
        eq(bookflowAppointments.status, "completed"),
        isNull(bookflowAppointments.post_job_thank_you_sent_at),
        lte(bookflowAppointments.updated_at, completionCutoff),
        sql`${bookflowAppointments.customer_phone} IS NOT NULL`,
      ),
    )
    .limit(BATCH_SIZE);

  if (due.length === 0) return result;

  log.info(`[post-job] processing ${due.length} due rows`);

  for (const appt of due) {
    result.processed++;
    try {
      const context = await resolveLeadForAppointment(appt);

      if (!context || !context.smsConsent) {
        // No matching consented lead — permanent skip. Stamp so we don't
        // retry every 30 min for the next ~∞.
        await db
          .update(bookflowAppointments)
          .set({ post_job_thank_you_sent_at: new Date() })
          .where(eq(bookflowAppointments.id, appt.id));
        result.skipped++;
        continue;
      }

      const sendResult = await sendPostJobThankYouSms({
        appointmentId: appt.id,
        clientId: appt.client_id,
        calculatorId: context.calculatorId,
        phone: appt.customer_phone!,
        smsConsent: context.smsConsent,
        fallbackTimezone: context.fallbackTimezone,
      });

      if (sendResult.ok) {
        await db
          .update(bookflowAppointments)
          .set({ post_job_thank_you_sent_at: new Date() })
          .where(eq(bookflowAppointments.id, appt.id));
        result.sent++;
      } else if (sendResult.reason === "deferred") {
        result.deferred++;
      } else if (
        sendResult.reason === "no_consent" ||
        sendResult.reason === "no_phone" ||
        sendResult.reason === "no_calculator"
      ) {
        await db
          .update(bookflowAppointments)
          .set({ post_job_thank_you_sent_at: new Date() })
          .where(eq(bookflowAppointments.id, appt.id));
        result.skipped++;
      } else {
        result.errors++;
        log.warn(`[post-job] send failed for appointment ${appt.id}: ${sendResult.error}`);
      }
    } catch (err: any) {
      result.errors++;
      log.error(`[post-job] unexpected error for appointment ${appt.id}: ${err.message}`);
    }
  }

  log.info(
    `[post-job] tick complete — sent=${result.sent} deferred=${result.deferred} skipped=${result.skipped} errors=${result.errors}`,
  );
  return result;
}

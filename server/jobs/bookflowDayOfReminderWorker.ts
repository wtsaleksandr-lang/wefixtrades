/**
 * BookFlow day-of reminder worker (Wave 80 — W-SMS-5 Flow 2).
 *
 * Fires the "your appointment is today at X" SMS ~3-4h before the
 * appointment's start_time. Runs every 15 minutes; the matching
 * window [now+3h, now+4h] is wider than the cron interval so each
 * appointment is matched on multiple ticks until the first send
 * succeeds — but the day_of_reminder_sent_at column makes the worker
 * idempotent across all subsequent ticks.
 *
 * Quiet-hours: transactional bypass. The day-of reminder is a
 * critical operational nudge (the homeowner needs to be home or
 * cancel) so we deliver even in the 21:00-08:00 local window. This
 * is consistent with the W-SMS-7 quiet-hours doctrine — appointment
 * reminders are at the boundary between "reminder" and
 * "transactional", and the trade has a strong business reason to
 * reach the homeowner regardless of hour.
 *
 * Skips: cancelled / no_show / completed appointments, rows missing
 * customer_phone, rows already flagged sent (day_of_reminder_sent_at
 * IS NOT NULL), opted-out numbers (enforced inside sendSmsAsClient).
 *
 * Best-effort per row — one failure does not abort the batch.
 */

import { and, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { bookflowAppointments, bookflowSettings } from "@shared/schema";
import { createLogger } from "../lib/logger";
import { sendSmsAsClient } from "../twilioClient";
import {
  BOOKFLOW_SMS_TEMPLATES,
  interpolate,
  formatAppointmentTime,
} from "../lib/bookflowSmsTemplates";

const log = createLogger("BookFlowDayOfReminder");

export interface DayOfReminderResult {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
}

export async function processBookflowDayOfReminders(): Promise<DayOfReminderResult> {
  const result: DayOfReminderResult = { scanned: 0, sent: 0, skipped: 0, failed: 0 };

  const windowStart = sql`now() + interval '3 hours'`;
  const windowEnd = sql`now() + interval '4 hours 15 minutes'`;

  const due = await db
    .select()
    .from(bookflowAppointments)
    .where(
      and(
        gte(bookflowAppointments.start_time, windowStart as any),
        lte(bookflowAppointments.start_time, windowEnd as any),
        ne(bookflowAppointments.status, "cancelled"),
        ne(bookflowAppointments.status, "no_show"),
        ne(bookflowAppointments.status, "completed"),
        isNull(bookflowAppointments.day_of_reminder_sent_at),
      ),
    );

  for (const appt of due) {
    result.scanned++;

    if (!appt.customer_phone) {
      result.skipped++;
      continue;
    }

    // Per-tenant brand_name + timezone lookup. One round-trip per due
    // row — fine at typical BookFlow volumes; if we ever batch up to
    // hundreds per tick, hoist this into a per-client map.
    const [settings] = await db
      .select({
        business_name: bookflowSettings.business_name,
        timezone: bookflowSettings.timezone,
      })
      .from(bookflowSettings)
      .where(eq(bookflowSettings.client_id, appt.client_id))
      .limit(1);
    const brandName = settings?.business_name ?? "Your tradesperson";
    const timezone = settings?.timezone ?? null;

    const body = interpolate(BOOKFLOW_SMS_TEMPLATES.day_of_reminder, {
      brand_name: brandName,
      time: formatAppointmentTime(new Date(appt.start_time), timezone),
    });

    try {
      await sendSmsAsClient({
        clientId: appt.client_id,
        to: appt.customer_phone,
        body,
        channel: "sms",
        quietHoursBypass: "transactional",
        fallbackTimezone: timezone,
      });
      await db
        .update(bookflowAppointments)
        .set({ day_of_reminder_sent_at: new Date(), updated_at: new Date() })
        .where(eq(bookflowAppointments.id, appt.id));
      result.sent++;
    } catch (err: any) {
      if (err?.message === "sms_recipient_opted_out") {
        // Stamp it so we don't try again — opt-out is permanent.
        await db
          .update(bookflowAppointments)
          .set({ day_of_reminder_sent_at: new Date(), updated_at: new Date() })
          .where(eq(bookflowAppointments.id, appt.id))
          .catch(() => {});
        result.skipped++;
      } else if (err?.message === "sms_quiet_hours_blocked") {
        // Should not happen — we pass transactional bypass — but if
        // a future quiet-hours rule tightens around transactional
        // sends too, defer without stamping so we retry next tick.
        result.skipped++;
      } else {
        result.failed++;
        log.warn(`[bookflow-day-of] failed for appointment ${appt.id}: ${err?.message ?? "unknown"}`);
      }
    }
  }

  if (result.scanned > 0) {
    log.info(
      `[bookflow-day-of] scanned=${result.scanned} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`,
    );
  }
  return result;
}

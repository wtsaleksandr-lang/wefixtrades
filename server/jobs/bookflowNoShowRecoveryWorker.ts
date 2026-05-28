/**
 * BookFlow no-show recovery worker (Wave 80 — W-SMS-5 Flow 5).
 *
 * 1-2 hours after a scheduled BookFlow appointment is past its
 * computed end_time (which encodes scheduled_start_at +
 * service_duration), if the row is still NOT in 'completed' or
 * 'cancelled' status, fires a recovery SMS asking the homeowner to
 * reschedule.
 *
 * The worker treats "no_show" status the same as the implicit no-
 * show case (status still on 'confirmed' / 'pending' past end_time)
 * — both deserve the recovery touch. The trade can manually skip
 * by deleting / cancelling the row before the window opens.
 *
 * Quiet-hours: reminder bypass (i.e. honored). A no-show late in
 * the day might land in the 21:00 local window — the worker
 * naturally defers and re-fires the next morning.
 *
 * Skips: rows without customer_phone, rows already flagged sent
 * (no_show_recovery_sent_at IS NOT NULL), rows where the recovery
 * window has not opened yet, opted-out numbers (enforced inside
 * sendSmsAsClient).
 */

import { and, eq, gte, isNull, lte, notInArray, sql } from "drizzle-orm";
import { db } from "../db";
import { bookflowAppointments, bookflowSettings } from "@shared/schema";
import { createLogger } from "../lib/logger";
import { sendSmsAsClient } from "../twilioClient";
// Wave 82 — template body + override resolution via the central registry.
import { resolveSmsTemplate } from "../lib/smsTemplateResolver";

const log = createLogger("BookFlowNoShowRecovery");

export interface NoShowRecoveryResult {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
}

export async function processBookflowNoShowRecovery(): Promise<NoShowRecoveryResult> {
  const result: NoShowRecoveryResult = { scanned: 0, sent: 0, skipped: 0, failed: 0 };

  // Recovery window: end_time was 1-3 hours ago. Lower bound (-3h)
  // keeps the worker from spamming yesterday's no-shows after a
  // service restart — same-day only by design.
  const windowStart = sql`now() - interval '3 hours'`;
  const windowEnd = sql`now() - interval '1 hour'`;

  const due = await db
    .select()
    .from(bookflowAppointments)
    .where(
      and(
        gte(bookflowAppointments.end_time, windowStart as any),
        lte(bookflowAppointments.end_time, windowEnd as any),
        notInArray(bookflowAppointments.status, ["completed", "cancelled"]),
        isNull(bookflowAppointments.no_show_recovery_sent_at),
      ),
    );

  for (const appt of due) {
    result.scanned++;

    if (!appt.customer_phone) {
      result.skipped++;
      continue;
    }

    const [settings] = await db
      .select({
        business_name: bookflowSettings.business_name,
        slug: bookflowSettings.slug,
        timezone: bookflowSettings.timezone,
      })
      .from(bookflowSettings)
      .where(eq(bookflowSettings.client_id, appt.client_id))
      .limit(1);
    const brandName = settings?.business_name ?? "Your tradesperson";
    const slug = settings?.slug ?? null;
    const timezone = settings?.timezone ?? null;

    const baseUrl =
      process.env.APP_URL ||
      process.env.APP_PUBLIC_URL ||
      (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://wefixtrades.com");
    const rescheduleLink = slug ? `${baseUrl}/book/${slug}` : `${baseUrl}/book`;

    const resolved = await resolveSmsTemplate({
      templateId: "bookflow.no_show_recovery",
      clientId: appt.client_id,
      vars: {
        brand_name: brandName,
        service_name: appt.service_name ?? "your scheduled",
        reschedule_link: rescheduleLink,
      },
    });
    if (!resolved.enabled) {
      await db
        .update(bookflowAppointments)
        .set({ no_show_recovery_sent_at: new Date(), updated_at: new Date() })
        .where(eq(bookflowAppointments.id, appt.id));
      result.skipped++;
      continue;
    }

    try {
      await sendSmsAsClient({
        clientId: appt.client_id,
        to: appt.customer_phone,
        body: resolved.body,
        channel: "sms",
        quietHoursBypass: "reminder",
        fallbackTimezone: timezone,
      });
      await db
        .update(bookflowAppointments)
        .set({ no_show_recovery_sent_at: new Date(), updated_at: new Date() })
        .where(eq(bookflowAppointments.id, appt.id));
      result.sent++;
    } catch (err: any) {
      if (err?.message === "sms_recipient_opted_out") {
        await db
          .update(bookflowAppointments)
          .set({ no_show_recovery_sent_at: new Date(), updated_at: new Date() })
          .where(eq(bookflowAppointments.id, appt.id))
          .catch(() => {});
        result.skipped++;
      } else if (err?.message === "sms_quiet_hours_blocked") {
        result.skipped++;
      } else {
        result.failed++;
        log.warn(`[bookflow-no-show] failed for appointment ${appt.id}: ${err?.message ?? "unknown"}`);
      }
    }
  }

  if (result.scanned > 0) {
    log.info(
      `[bookflow-no-show] scanned=${result.scanned} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`,
    );
  }
  return result;
}

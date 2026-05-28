/**
 * BookFlow post-appointment thank-you worker (Wave 80 — W-SMS-5 Flow 4).
 *
 * ~30 minutes after a BookFlow appointment is marked 'completed',
 * fires a thank-you SMS with a 1-5 sentiment hook + a review link.
 * The 30-minute delay is deliberate: sending immediately on tap
 * feels robotic, and the homeowner needs a moment to reflect on
 * the service before they'd plausibly rate it.
 *
 * Quiet-hours: reminder bypass (i.e. honored). If the appointment
 * ran late and the 30-minute delay would put the send into the
 * 21:00 local window, the worker defers without stamping
 * post_thank_you_sent_at and naturally retries on the first tick
 * after the next 08:00 local boundary.
 *
 * Skips: rows without customer_phone, rows already flagged sent
 * (post_thank_you_sent_at IS NOT NULL), opted-out numbers
 * (enforced inside sendSmsAsClient).
 *
 * Review-link resolution piggybacks on the existing
 * server/services/reputation/reviewRequestService.ts getReviewLink
 * helper, which checks SocialSync GBP metadata for an explicit link
 * or place_id-derived link. When neither is configured we degrade
 * to a generic "leave us feedback" body (no URL) so the homeowner
 * still gets the thank-you touch.
 *
 * Inbound 1-5 reply routes through the existing SMS inbound /
 * sentiment pipeline — no Wave-80 work needed there.
 */

import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { bookflowAppointments, bookflowSettings } from "@shared/schema";
import { createLogger } from "../lib/logger";
import { sendSmsAsClient } from "../twilioClient";
import {
  BOOKFLOW_SMS_TEMPLATES,
  interpolate,
} from "../lib/bookflowSmsTemplates";
import { getReviewLink } from "../services/reputation/reviewRequestService";

const log = createLogger("BookFlowPostAppointment");

export interface PostAppointmentResult {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
}

export async function processBookflowPostAppointment(): Promise<PostAppointmentResult> {
  const result: PostAppointmentResult = { scanned: 0, sent: 0, skipped: 0, failed: 0 };

  const cutoff = sql`now() - interval '30 minutes'`;

  const due = await db
    .select()
    .from(bookflowAppointments)
    .where(
      and(
        eq(bookflowAppointments.status, "completed"),
        lte(bookflowAppointments.completed_at, cutoff as any),
        isNull(bookflowAppointments.post_thank_you_sent_at),
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
        timezone: bookflowSettings.timezone,
      })
      .from(bookflowSettings)
      .where(eq(bookflowSettings.client_id, appt.client_id))
      .limit(1);
    const brandName = settings?.business_name ?? "Your tradesperson";
    const timezone = settings?.timezone ?? null;

    let reviewLink: string | null = null;
    try {
      reviewLink = await getReviewLink(appt.client_id);
    } catch (err: any) {
      // Review-link lookup failures shouldn't block the thank-you
      // send — we degrade to no URL and still ship the touch.
      log.warn(`[bookflow-thank-you] review-link lookup failed for client ${appt.client_id}: ${err?.message}`);
    }

    const body = interpolate(BOOKFLOW_SMS_TEMPLATES.post_thank_you, {
      brand_name: brandName,
      review_link: reviewLink ?? "",
    }).replace(/\s+Or leave a review:\s*$/i, "");

    try {
      await sendSmsAsClient({
        clientId: appt.client_id,
        to: appt.customer_phone,
        body,
        channel: "sms",
        quietHoursBypass: "reminder",
        fallbackTimezone: timezone,
      });
      await db
        .update(bookflowAppointments)
        .set({ post_thank_you_sent_at: new Date(), updated_at: new Date() })
        .where(eq(bookflowAppointments.id, appt.id));
      result.sent++;
    } catch (err: any) {
      if (err?.message === "sms_recipient_opted_out") {
        await db
          .update(bookflowAppointments)
          .set({ post_thank_you_sent_at: new Date(), updated_at: new Date() })
          .where(eq(bookflowAppointments.id, appt.id))
          .catch(() => {});
        result.skipped++;
      } else if (err?.message === "sms_quiet_hours_blocked") {
        // Defer to the next non-quiet tick. Don't stamp so worker retries.
        result.skipped++;
      } else {
        result.failed++;
        log.warn(`[bookflow-thank-you] failed for appointment ${appt.id}: ${err?.message ?? "unknown"}`);
      }
    }
  }

  if (result.scanned > 0) {
    log.info(
      `[bookflow-thank-you] scanned=${result.scanned} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`,
    );
  }
  return result;
}

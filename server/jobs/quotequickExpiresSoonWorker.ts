/**
 * Wave 81 — QuoteQuick "your quote expires tomorrow" reminder worker.
 *
 * Hourly cron. Polls `leads` for rows where:
 *   - quote_expires_at is between now+23h and now+25h
 *     (~24h window; ±1h slop so an hourly tick can't miss any row)
 *   - status = 'new' (homeowner hasn't been converted yet)
 *   - expires_soon_sent_at IS NULL (idempotency)
 *   - sms_consent = true
 *   - phone IS NOT NULL
 *
 * Quiet-hours bypass = 'reminder'. On a quiet-hours defer the row's
 * sent_at stamp stays NULL — the next tick picks it up if still inside
 * the 23-25h window. Worst case (window closes during quiet hours) the
 * lead just doesn't get the reminder, which is acceptable degradation —
 * the homeowner still has their original quote_link.
 *
 * Batched at 100 rows/tick so a backlog burst can't monopolize a single
 * tick. Per-row failures are logged but never throw.
 */

import { and, eq, gte, lte, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { leads } from "@shared/schema";
import { createLogger } from "../lib/logger";
import { sendExpiresSoonSms } from "../services/quotequickHomeownerSmsService";
import { isTwilioConfigured } from "../twilioClient";

const log = createLogger("QuotequickExpiresSoon");

const BATCH_SIZE = 100;
const WINDOW_LOWER_HOURS = 23;
const WINDOW_UPPER_HOURS = 25;

export interface ExpiresSoonResult {
  processed: number;
  sent: number;
  deferred: number;
  skipped: number;
  errors: number;
}

export async function processQuotequickExpiresSoon(): Promise<ExpiresSoonResult> {
  const result: ExpiresSoonResult = {
    processed: 0,
    sent: 0,
    deferred: 0,
    skipped: 0,
    errors: 0,
  };

  // No-op fast-path when Twilio isn't configured (local dev, test envs).
  if (!isTwilioConfigured()) {
    log.debug("Twilio not configured — skipping tick");
    return result;
  }

  const now = new Date();
  const lower = new Date(now.getTime() + WINDOW_LOWER_HOURS * 60 * 60 * 1000);
  const upper = new Date(now.getTime() + WINDOW_UPPER_HOURS * 60 * 60 * 1000);

  const due = await db
    .select()
    .from(leads)
    .where(
      and(
        gte(leads.quote_expires_at, lower),
        lte(leads.quote_expires_at, upper),
        eq(leads.status, "new"),
        isNull(leads.expires_soon_sent_at),
        eq(leads.sms_consent, true),
        sql`${leads.phone} IS NOT NULL`,
      ),
    )
    .limit(BATCH_SIZE);

  if (due.length === 0) return result;

  log.info(`[expires-soon] processing ${due.length} due rows`);

  for (const lead of due) {
    result.processed++;
    try {
      const sendResult = await sendExpiresSoonSms({
        leadId: lead.id,
        calculatorId: lead.calculator_id,
        phone: lead.phone!,
        smsConsent: !!lead.sms_consent,
        expiresAt: lead.quote_expires_at!,
      });

      if (sendResult.ok) {
        await db
          .update(leads)
          .set({ expires_soon_sent_at: new Date() })
          .where(eq(leads.id, lead.id));
        result.sent++;
      } else if (sendResult.reason === "deferred") {
        // Quiet hours — leave the stamp NULL so next tick re-attempts.
        result.deferred++;
      } else if (
        sendResult.reason === "no_consent" ||
        sendResult.reason === "no_phone" ||
        sendResult.reason === "no_calculator"
      ) {
        // Permanent — stamp so we don't retry every tick for the rest of
        // the 2-hour window.
        await db
          .update(leads)
          .set({ expires_soon_sent_at: new Date() })
          .where(eq(leads.id, lead.id));
        result.skipped++;
      } else {
        // send_failed — leave NULL so the next hourly tick retries.
        result.errors++;
        log.warn(`[expires-soon] send failed for lead ${lead.id}: ${sendResult.error}`);
      }
    } catch (err: any) {
      result.errors++;
      log.error(`[expires-soon] unexpected error for lead ${lead.id}: ${err.message}`);
    }
  }

  log.info(
    `[expires-soon] tick complete — sent=${result.sent} deferred=${result.deferred} skipped=${result.skipped} errors=${result.errors}`,
  );
  return result;
}

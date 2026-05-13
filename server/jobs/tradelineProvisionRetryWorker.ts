/**
 * Retries Twilio number provisioning for tradeline_phone_setups rows
 * that landed in provisioning_status='queued' because Twilio wasn't
 * configured at the time of first attempt.
 *
 * Fulfils the queued-state UX promise:
 *   "Your number is reserved. We're finalizing the connection — you'll
 *    get an email within 24 hours when it's ready to use."
 *
 * Scheduled hourly. Each run:
 *   - Skips entirely if Twilio is still not configured (no point retrying)
 *   - Reads queued rows + joins clients for contact info
 *   - For each row, retries provisionNumber()
 *   - On success: updates DB + queues an email to the client's contact_email
 *   - On still-queued (rare): leaves alone
 *   - On hard-failed: marks provisioning_status='failed' + records reason
 *
 * Idempotent: rows that have already been moved off 'queued' are skipped
 * by the WHERE clause.
 */

import { db } from "../db";
import { tradelinePhoneSetups, clients } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { isTwilioConfigured } from "../twilioClient";
import { provisionNumber } from "../services/tradelineSetup/provisionNumber";
import { queueEmail } from "../services/emailQueueService";
import { buildEmailHeader, buildLegalFooter } from "../lib/emailFooter";
import { createLogger } from "../lib/logger";

const log = createLogger("TradelineProvisionRetry");

export interface RetryStats {
  scanned: number;
  provisioned: number;
  stillQueued: number;
  failed: number;
}

export async function processTradelineProvisionRetry(): Promise<RetryStats> {
  if (!isTwilioConfigured()) {
    log.debug("Twilio still not configured — skipping retry sweep");
    return { scanned: 0, provisioned: 0, stillQueued: 0, failed: 0 };
  }

  const candidates = await db
    .select({
      id: tradelinePhoneSetups.id,
      client_id: tradelinePhoneSetups.client_id,
      carrier_country: tradelinePhoneSetups.carrier_country,
      business_name: clients.business_name,
      contact_email: clients.contact_email,
      contact_name: clients.contact_name,
    })
    .from(tradelinePhoneSetups)
    .innerJoin(clients, eq(clients.id, tradelinePhoneSetups.client_id))
    .where(
      and(
        eq(tradelinePhoneSetups.mode, "new"),
        eq(tradelinePhoneSetups.provisioning_status, "queued"),
      ),
    );

  if (candidates.length === 0) return { scanned: 0, provisioned: 0, stillQueued: 0, failed: 0 };

  let provisioned = 0;
  let stillQueued = 0;
  let failed = 0;

  for (const row of candidates) {
    const countryCode = (row.carrier_country === "CA" ? "CA" : "US") as "US" | "CA";
    const result = await provisionNumber(countryCode, "local");

    if (result.ok && !result.queued) {
      await db
        .update(tradelinePhoneSetups)
        .set({
          assigned_number: result.number,
          assigned_number_sid: result.sid,
          provisioning_status: "provisioned",
          provisioning_failed_reason: null,
          provisioned_at: new Date(),
          completed_at: new Date(),
          last_step: "new_provisioned",
          updated_at: new Date(),
        })
        .where(eq(tradelinePhoneSetups.id, row.id));

      if (row.contact_email) {
        try {
          await queueEmail(
            row.contact_email,
            `Your AI tradeline number is ready: ${result.number}`,
            renderReadyEmail({
              contactName: row.contact_name,
              businessName: row.business_name,
              number: result.number,
            }),
          );
        } catch (err) {
          log.error("email queue failed (number was provisioned though)", {
            id: row.id,
            err: (err as Error).message,
          });
        }
      }

      provisioned++;
      log.info("Retry succeeded", { id: row.id, number: result.number });
    } else if (result.ok && result.queued) {
      // Still no luck (e.g., admin token expired again). Leave row as-is.
      stillQueued++;
    } else {
      await db
        .update(tradelinePhoneSetups)
        .set({
          provisioning_status: "failed",
          provisioning_failed_reason: result.error,
          updated_at: new Date(),
        })
        .where(eq(tradelinePhoneSetups.id, row.id));
      failed++;
      log.warn("Retry hard-failed", { id: row.id, err: result.error });
    }
  }

  log.info("Retry sweep complete", { scanned: candidates.length, provisioned, stillQueued, failed });
  return { scanned: candidates.length, provisioned, stillQueued, failed };
}

function renderReadyEmail(args: { contactName: string | null; businessName: string; number: string }): string {
  const greeting = args.contactName ? `Hi ${escapeHtml(args.contactName)},` : "Hi,";
  return `<!DOCTYPE html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2937;">
${buildEmailHeader({ tagline: "Your tradeline is live", theme: "light" })}
<h1 style="font-size: 22px; margin: 0 0 12px;">Your tradeline number is live</h1>
<p style="font-size: 15px; line-height: 1.5;">${greeting}</p>
<p style="font-size: 15px; line-height: 1.5;">
  Good news — your new WeFixTrades phone number is provisioned and connected to your AI assistant for <strong>${escapeHtml(args.businessName)}</strong>.
</p>
<div style="background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 12px; padding: 16px; text-align: center; margin: 20px 0;">
  <p style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #4338ca; font-weight: 600; margin: 0 0 6px;">Your new number</p>
  <p style="font-size: 28px; font-weight: 700; color: #312e81; margin: 0;">${escapeHtml(args.number)}</p>
</div>
<p style="font-size: 15px; line-height: 1.5;">
  Customers calling this number will reach your AI assistant 24/7. You can listen in, hand off, or take over conversations from your WeFixTrades dashboard.
</p>
<p style="font-size: 15px; line-height: 1.5;">
  <strong>Next:</strong> update your Google Business Profile, website, and invoices with the new number. We've prepared template copy for every surface in your dashboard.
</p>
<p style="font-size: 14px; line-height: 1.5;">
  <a href="https://wefixtrades.com/portal/tradeline/setup" style="background: #4f46e5; color: white; padding: 10px 18px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 600; font-size: 14px;">Open my dashboard</a>
</p>
${buildLegalFooter({ marketing: false })}
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

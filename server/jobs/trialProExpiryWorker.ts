/**
 * Daily cron worker that retires expired Pro-trial flags.
 *
 * Self-serve signups get a 14-day Pro-features trial (see
 * authRoutes.ts /api/auth/signup). When trial_pro_expires_at passes,
 * this worker:
 *   1. Flips trial_pro_features_enabled = false
 *   2. Logs an audit event
 *   3. Fires the "trial ended" email (best-effort)
 *
 * Scheduled at 04:00 UTC daily via server/jobs/scheduler.ts. Idempotent —
 * re-running the same day is a no-op (rows already flipped won't match
 * the WHERE clause).
 */

import { db } from "../db";
import { clients } from "@shared/schema";
import { and, eq, lt, sql, isNotNull } from "drizzle-orm";
import { storage } from "../storage";
import { sendProTrialEndedEmail } from "../lib/proTrialEndedEmail";
import { createLogger } from "../lib/logger";

const log = createLogger("trial-pro-expiry");

export interface TrialProExpiryResult {
  status: "ok";
  expiredCount: number;
  emailsSent: number;
  emailsFailed: number;
}

export async function processProTrialExpiry(): Promise<TrialProExpiryResult> {
  const expired = await db
    .select({
      id: clients.id,
      business_name: clients.business_name,
      contact_email: clients.contact_email,
    })
    .from(clients)
    .where(
      and(
        eq(clients.trial_pro_features_enabled, true),
        isNotNull(clients.trial_pro_expires_at),
        lt(clients.trial_pro_expires_at, sql`now()`),
      ),
    );

  if (expired.length === 0) {
    return { status: "ok", expiredCount: 0, emailsSent: 0, emailsFailed: 0 };
  }

  log.info(`Found ${expired.length} clients with expired Pro trials`);

  let emailsSent = 0;
  let emailsFailed = 0;

  for (const row of expired) {
    try {
      await db
        .update(clients)
        .set({ trial_pro_features_enabled: false, updated_at: new Date() })
        .where(eq(clients.id, row.id));
    } catch (err: any) {
      log.error(`Flip failed for client ${row.id}: ${err.message}`);
      continue;
    }

    try {
      await storage.logAdminActivity({
        actor_type: "system",
        actor_name: "Trial Pro Expiry Worker",
        action: "client.pro_trial_ended",
        entity_type: "client",
        entity_id: row.id,
        summary: `14-day Pro trial expired for ${row.business_name}`,
      });
    } catch (err: any) {
      log.warn(`Audit log failed for client ${row.id}: ${err.message}`);
    }

    if (row.contact_email) {
      const upgradeUrl = `${process.env.APP_URL || "https://wefixtrades.com"}/pricing?from=trial-ended`;
      const sent = await sendProTrialEndedEmail(row.contact_email, {
        businessName: row.business_name,
        upgradeUrl,
      }, row.id);
      if (sent) emailsSent++;
      else emailsFailed++;
    }
  }

  log.info(`Pro-trial expiry: flipped ${expired.length}, emails sent ${emailsSent}, failed ${emailsFailed}`);
  return { status: "ok", expiredCount: expired.length, emailsSent, emailsFailed };
}

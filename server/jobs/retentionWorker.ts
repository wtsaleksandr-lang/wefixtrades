/**
 * Data retention worker — deletes aged-out rows from high-volume
 * logging tables to keep the database lean.
 *
 * Schedule: weekly (registered in scheduler.ts).
 *
 * Policies:
 *   - integration_error_logs: 30 days
 *   - processed_stripe_events: 90 days
 */
import { db } from "../db";
import { integrationErrorLogs, processedStripeEvents } from "@shared/schema";
import { lt } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("RetentionWorker");

export async function processRetention(): Promise<{
  integration_error_logs_deleted: number;
  processed_stripe_events_deleted: number;
}> {
  const now = new Date();

  // integration_error_logs: 30-day retention
  const errorCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const errorResult = await db
    .delete(integrationErrorLogs)
    .where(lt(integrationErrorLogs.created_at, errorCutoff));
  const errorDeleted = (errorResult as any)?.rowCount ?? 0;
  if (errorDeleted > 0) {
    log.info("Purged integration_error_logs", { deleted: errorDeleted, olderThan: errorCutoff.toISOString() });
  }

  // processed_stripe_events: 90-day retention
  const stripeCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const stripeResult = await db
    .delete(processedStripeEvents)
    .where(lt(processedStripeEvents.processed_at, stripeCutoff));
  const stripeDeleted = (stripeResult as any)?.rowCount ?? 0;
  if (stripeDeleted > 0) {
    log.info("Purged processed_stripe_events", { deleted: stripeDeleted, olderThan: stripeCutoff.toISOString() });
  }

  return {
    integration_error_logs_deleted: errorDeleted,
    processed_stripe_events_deleted: stripeDeleted,
  };
}

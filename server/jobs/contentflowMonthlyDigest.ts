/**
 * ContentFlow Monthly Digest Worker — Wave 75.
 *
 * Runs monthly (1st of each month at 09:05 UTC, staggered after the
 * WebCare digest at 09:00). For every active enabled standalone
 * ContentFlow client_service (Creator / Studio / Agency), compiles the
 * past calendar month's data and sends a recap email to the client.
 *
 * Per-client safety:
 *   - SQL-filters to active, enabled `contentflow-*` services with a
 *     non-empty contact_email
 *   - Each sendContentflowMonthlyDigest() is idempotent per period via
 *     client_service.metadata.last_contentflow_digest_period
 *   - Honors the per-product email-preference flag at
 *     clients.metadata.contentflow_notifications.monthly_digest_ready.email
 *     (default true — opt-in)
 *   - Honors the global unsubscribe list inside the sender
 *   - Skips entirely when the client had zero activity for the month
 *     (don't send "you had 0 posts" — depressing and useless)
 *
 * Wrapped by `runJob()` in scheduler — retry-with-backoff and the
 * `job_logs` row are provided by the wrapper. Email failures must never
 * block downstream worker processing.
 */

import { db } from "../db";
import { clients, clientServices } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  sendContentflowMonthlyDigest,
} from "../lib/contentflowMonthlyDigestEmail";
import { createLogger } from "./../lib/logger";

const log = createLogger("ContentFlowDigest");

interface DigestResult {
  servicesProcessed: number;
  digestsSent: number;
  skippedAlreadySent: number;
  skippedNoEmail: number;
  skippedNoActivity: number;
  errors: number;
}

function monthLabel(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function monthBounds(now: Date): { start: Date; end: Date; label: string } {
  // Cover the PREVIOUS calendar month (we run on the 1st).
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { start, end, label: monthLabel(start) };
}

export async function processContentflowMonthlyDigest(): Promise<DigestResult> {
  log.info("Starting ContentFlow monthly digest sweep");

  const result: DigestResult = {
    servicesProcessed: 0,
    digestsSent: 0,
    skippedAlreadySent: 0,
    skippedNoEmail: 0,
    skippedNoActivity: 0,
    errors: 0,
  };

  const { end, label } = monthBounds(new Date());

  const rows = await db
    .select({
      cs_id: clientServices.id,
      cs_client_id: clientServices.client_id,
      cs_metadata: clientServices.metadata,
      client_business_name: clients.business_name,
      client_contact_email: clients.contact_email,
      client_metadata: clients.metadata,
    })
    .from(clientServices)
    .innerJoin(clients, eq(clientServices.client_id, clients.id))
    .where(
      and(
        sql`${clientServices.service_id} LIKE 'contentflow%'`,
        eq(clientServices.status, "active"),
        eq(clientServices.enabled, true),
      ),
    );

  // De-dupe by client_id — a client with multiple contentflow services
  // should only get one recap (the deeper subscription wins).
  const seenClients = new Set<number>();

  for (const row of rows) {
    if (seenClients.has(row.cs_client_id)) continue;
    seenClients.add(row.cs_client_id);

    result.servicesProcessed += 1;
    try {
      const csMeta = (row.cs_metadata as Record<string, unknown>) ?? {};
      const lastPeriod = typeof csMeta.last_contentflow_digest_period === "string"
        ? csMeta.last_contentflow_digest_period
        : "";
      const lastAt = typeof csMeta.last_contentflow_digest_at === "string"
        ? new Date(csMeta.last_contentflow_digest_at).getTime()
        : 0;

      // Idempotency: skip if last digest was for this period OR was sent
      // inside the current month window.
      if (lastPeriod === label || (lastAt && lastAt >= end.getTime())) {
        result.skippedAlreadySent += 1;
        continue;
      }

      if (!row.client_contact_email) {
        result.skippedNoEmail += 1;
        continue;
      }

      // Per-product opt-in (default true).
      const clientMd = (row.client_metadata as Record<string, unknown>) ?? {};
      const prefs = (clientMd.contentflow_notifications as Record<string, unknown>) ?? {};
      const digestPref = (prefs.monthly_digest_ready as Record<string, unknown>) ?? {};
      if (digestPref.email === false) {
        result.skippedAlreadySent += 1;
        continue;
      }

      const sendResult = await sendContentflowMonthlyDigest({
        clientId: row.cs_client_id,
        recipientEmail: row.client_contact_email,
        businessName: row.client_business_name,
        periodLabel: label,
      });

      if (sendResult.sent) {
        result.digestsSent += 1;
        await db
          .update(clientServices)
          .set({
            metadata: {
              ...csMeta,
              last_contentflow_digest_at: new Date().toISOString(),
              last_contentflow_digest_period: label,
              last_contentflow_digest_posts: sendResult.posts_this_month,
            },
            updated_at: new Date(),
          } as any)
          .where(eq(clientServices.id, row.cs_id));
      } else if (sendResult.reason === "no_activity_this_month") {
        result.skippedNoActivity += 1;
      } else if (sendResult.reason === "recipient_unsubscribed") {
        result.skippedAlreadySent += 1;
      } else {
        log.warn("ContentFlow digest send skipped", {
          clientId: row.cs_client_id,
          reason: sendResult.reason,
        });
      }
    } catch (err: any) {
      log.error(`Digest failed for cs#${row.cs_id}`, { error: err?.message });
      result.errors += 1;
    }
  }

  log.info(
    `Complete: ${result.servicesProcessed} processed, ${result.digestsSent} sent, ` +
    `${result.skippedAlreadySent} skipped (already-sent/unsubscribed), ` +
    `${result.skippedNoEmail} no-email, ${result.skippedNoActivity} no-activity, ` +
    `${result.errors} errors`,
  );

  return result;
}

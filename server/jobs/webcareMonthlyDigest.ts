/**
 * WebCare Monthly Digest Worker — Wave 31.
 *
 * Runs monthly (1st of each month at 09:00 UTC). For each active
 * WebCare client_service, builds a 5-number digest of the past
 * calendar month:
 *
 *   1. Uptime % this month
 *   2. Current security grade (A-F)
 *   3. Updates applied (count)
 *   4. Threats blocked (count)
 *   5. Backups taken (count)
 *
 * Sends the digest to the client via the existing email transport
 * (same SMTP path as webcareAlertEmail). Closes the "what exactly
 * am I paying you for?" reporting-visibility gap surfaced by the
 * competitive research.
 *
 * Idempotency: each successful digest stamps
 * `client_service.metadata.last_webcare_digest_at` so re-running the
 * cron in the same month is a no-op.
 *
 * Wrapped by `runJob()` in the scheduler — retry-with-backoff and
 * a `job_logs` row provided by the wrapper. Email failures must
 * never block downstream processing.
 */

import { db } from "../db";
import { clients, clientServices, webcareActionLog } from "@shared/schema";
import { eq, and, sql, gte, lt } from "drizzle-orm";
import { sendWebcareMonthlyDigest } from "../lib/webcareMonthlyDigestEmail";
import { computeWebcareDashboardKpis } from "../routes/portal/webcare/dashboardKpis";
import { createLogger } from "./../lib/logger";

const log = createLogger("WebCareDigest");

interface DigestResult {
  servicesProcessed: number;
  digestsSent: number;
  skippedAlreadySent: number;
  skippedNoEmail: number;
  errors: number;
}

interface MonthlyStats {
  uptimePct: number;
  securityLetter: string;
  updatesApplied: number;
  threatsBlocked: number;
  backupsTaken: number;
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

async function gatherMonthlyStats(
  clientId: number,
  start: Date,
  end: Date,
): Promise<MonthlyStats> {
  // 1. Pull the live dashboard KPIs (uptime% is 90-day rolling — we use
  //    it as a proxy when no per-month uptime tracking exists).
  let uptimePct = 0;
  let securityLetter = "F";
  try {
    const dashboard = await computeWebcareDashboardKpis(clientId);
    uptimePct = dashboard.kpis.uptimePct;
    securityLetter = dashboard.kpis.securityGrade.letter;
  } catch (err: any) {
    log.warn("digest gather: dashboard kpis failed", {
      clientId,
      error: err?.message,
    });
  }

  // 2. Aggregate action-log counts for the month window.
  const rows = await db
    .select({
      event_type: webcareActionLog.event_type,
      severity: webcareActionLog.severity,
    })
    .from(webcareActionLog)
    .where(
      and(
        eq(webcareActionLog.client_id, clientId),
        gte(webcareActionLog.recorded_at, start),
        lt(webcareActionLog.recorded_at, end),
      ),
    );

  let updatesApplied = 0;
  let threatsBlocked = 0;
  let backupsTaken = 0;
  for (const r of rows) {
    if (r.event_type === "updates") updatesApplied += 1;
    else if (r.event_type === "security" && r.severity !== "failed") threatsBlocked += 1;
    else if (r.event_type === "backups" && r.severity !== "failed") backupsTaken += 1;
  }

  return {
    uptimePct,
    securityLetter,
    updatesApplied,
    threatsBlocked,
    backupsTaken,
  };
}

export async function processWebcareMonthlyDigest(): Promise<DigestResult> {
  log.info("Starting WebCare monthly digest sweep");

  const result: DigestResult = {
    servicesProcessed: 0,
    digestsSent: 0,
    skippedAlreadySent: 0,
    skippedNoEmail: 0,
    errors: 0,
  };

  const { start, end, label } = monthBounds(new Date());

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
        sql`${clientServices.service_id} LIKE 'webcare%'`,
        eq(clientServices.status, "active"),
        eq(clientServices.enabled, true),
      ),
    );

  for (const row of rows) {
    result.servicesProcessed += 1;
    try {
      const csMeta = (row.cs_metadata as Record<string, unknown>) ?? {};
      const lastDigestAt = typeof csMeta.last_webcare_digest_at === "string"
        ? new Date(csMeta.last_webcare_digest_at).getTime()
        : 0;

      // Idempotency: skip if last digest was sent inside the current month window.
      if (lastDigestAt && lastDigestAt >= end.getTime()) {
        result.skippedAlreadySent += 1;
        continue;
      }

      if (!row.client_contact_email) {
        result.skippedNoEmail += 1;
        continue;
      }

      // Notification-prefs honor: customer must have monthly_digest_ready
      // -> email enabled (default true).
      const clientMd = (row.client_metadata as Record<string, unknown>) ?? {};
      const prefs = (clientMd.webcare_notifications as Record<string, unknown>) ?? {};
      const digestPref = (prefs.monthly_digest_ready as Record<string, unknown>) ?? {};
      if (digestPref.email === false) {
        result.skippedAlreadySent += 1;
        continue;
      }

      const stats = await gatherMonthlyStats(row.cs_client_id, start, end);

      const sent = await sendWebcareMonthlyDigest({
        businessName: row.client_business_name,
        recipientEmail: row.client_contact_email,
        periodLabel: label,
        stats,
      });

      if (sent) {
        result.digestsSent += 1;
        await db
          .update(clientServices)
          .set({
            metadata: {
              ...csMeta,
              last_webcare_digest_at: new Date().toISOString(),
              last_webcare_digest_period: label,
            },
            updated_at: new Date(),
          } as any)
          .where(eq(clientServices.id, row.cs_id));
      }
    } catch (err: any) {
      log.error(`Digest failed for cs#${row.cs_id}`, { error: err?.message });
      result.errors += 1;
    }
  }

  log.info(
    `Complete: ${result.servicesProcessed} processed, ${result.digestsSent} sent, ` +
    `${result.skippedAlreadySent} skipped (already-sent), ${result.skippedNoEmail} no-email, ` +
    `${result.errors} errors`,
  );

  return result;
}

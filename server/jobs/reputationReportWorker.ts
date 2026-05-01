/**
 * Reputation report worker — sends periodic review report emails to clients.
 *
 * Runs daily. Determines which clients are due for a report based on their
 * tier's report frequency (weekly/biweekly/monthly) and last report date.
 *
 * Dedup: stores last_report_sent_at in service metadata to prevent duplicates.
 */

import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import { clients, clientServices } from "@shared/schema";
import { extractTier, mergeSettings, TIER_REPORT_FREQUENCY, type ReportFrequency } from "@shared/reputationConfig";
import { aggregateReportData, sendReputationReport } from "../lib/reputationReport";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";

const log = createLogger("ReputationReport");

/** Map frequency to minimum days between reports. */
const FREQUENCY_DAYS: Record<ReportFrequency, number> = {
  weekly: 6,     // send if >= 6 days since last (allows for scheduler jitter)
  biweekly: 13,
  monthly: 27,
};

function getBaseUrl(): string {
  return process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "";
}

interface ClientReportCandidate {
  clientId: number;
  serviceId: string;
  metadata: any;
}

/** Find all clients with active ReputationShield that are due for a report. */
async function findEligibleClients(): Promise<ClientReportCandidate[]> {
  const rows = await db.select({
    clientId: clientServices.client_id,
    serviceId: clientServices.service_id,
    metadata: clientServices.metadata,
    clientStatus: clients.status,
    contactEmail: clients.contact_email,
  })
    .from(clientServices)
    .innerJoin(clients, eq(clients.id, clientServices.client_id))
    .where(and(
      sql`${clientServices.service_id} LIKE 'reputationshield-%'`,
      sql`${clientServices.status} IN ('active')`,
      sql`${clients.status} IN ('active')`,
      sql`${clients.contact_email} IS NOT NULL`,
    ));

  const now = Date.now();
  const eligible: ClientReportCandidate[] = [];

  for (const row of rows) {
    const tier = extractTier(row.serviceId);
    if (!tier) continue;

    const metadata = (row.metadata ?? {}) as Record<string, any>;
    const settings = mergeSettings(metadata.reputation_settings);
    if (!settings.report_enabled) continue;

    const frequency = TIER_REPORT_FREQUENCY[tier];
    const minDays = FREQUENCY_DAYS[frequency];
    const lastSent = metadata.last_report_sent_at;
    const lastSentMs = lastSent ? new Date(lastSent).getTime() : 0;
    const daysSinceLast = (now - lastSentMs) / (1000 * 60 * 60 * 24);

    if (daysSinceLast >= minDays) {
      eligible.push({
        clientId: row.clientId!,
        serviceId: row.serviceId,
        metadata,
      });
    }
  }

  return eligible;
}

function getPeriodStart(frequency: ReportFrequency): Date {
  const now = new Date();
  const days = frequency === "weekly" ? 7 : frequency === "biweekly" ? 14 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Main worker function — called by scheduler.
 */
export async function processReputationReports(): Promise<{
  sent: number;
  skipped: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;

  const eligible = await findEligibleClients();
  if (eligible.length === 0) {
    return { sent: 0, skipped: 0, errors: [] };
  }

  const baseUrl = getBaseUrl();

  for (const candidate of eligible) {
    try {
      const tier = extractTier(candidate.serviceId);
      if (!tier) { skipped++; continue; }

      const frequency = TIER_REPORT_FREQUENCY[tier];
      const periodStart = getPeriodStart(frequency);
      const periodEnd = new Date();

      const reportData = await aggregateReportData(candidate.clientId, periodStart, periodEnd);
      if (!reportData) {
        skipped++;
        continue;
      }

      const result = await sendReputationReport(reportData, baseUrl);
      if (result.ok) {
        // Mark as sent to prevent duplicate
        const updatedMeta = {
          ...candidate.metadata,
          last_report_sent_at: new Date().toISOString(),
        };
        await storage.updateClientServiceMetadata(
          candidate.clientId,
          candidate.serviceId,
          updatedMeta,
        );

        // Log activity
        await storage.logAdminActivity({
          actor_type: "system",
          actor_id: null,
          actor_name: "ReputationReport",
          action: "report.sent",
          entity_type: "client",
          entity_id: candidate.clientId,
          summary: `${frequency} review report sent to ${reportData.contactEmail} (${reportData.newReviewsCount} new reviews)`,
          metadata: {
            frequency,
            tier,
            newReviews: reportData.newReviewsCount,
            averageRating: reportData.averageRating,
          },
        });

        sent++;
        log.info("Sent report", { frequency, email: reportData.contactEmail, businessName: reportData.businessName });
      } else {
        errors.push(`Client ${candidate.clientId}: ${result.error}`);
      }
    } catch (err: any) {
      errors.push(`Client ${candidate.clientId}: ${err.message}`);
      log.error("Error processing client", { clientId: candidate.clientId, error: err.message });
    }
  }

  return { sent, skipped, errors };
}

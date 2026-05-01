/**
 * Upsell Worker
 *
 * Runs daily at 10:00 UTC. Queries completed SiteLaunch and WebFix
 * services where completed_at was 7 days ago. Sends an upsell email
 * pitching WebCare. Stamps metadata.upsell_email_sent to prevent
 * duplicate sends.
 *
 * Idempotent: checks upsell_email_sent flag before sending.
 */

import { db } from "../db";
import { clientServices, clients, serviceCatalog } from "@shared/schema";
import { eq, and, sql, lte, gte } from "drizzle-orm";
import { sendPostSiteLaunchUpsell, sendPostWebFixUpsell } from "../lib/upsellEmails";
import { createLogger } from "../lib/logger";

const log = createLogger("UpsellWorker");

interface UpsellResult {
  checked: number;
  sent: number;
  skipped: number;
  errors: number;
}

export async function processUpsellEmails(): Promise<UpsellResult> {
  log.info("Starting upsell email sweep");

  const result: UpsellResult = { checked: 0, sent: 0, skipped: 0, errors: 0 };

  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";

  // Find completed SiteLaunch/WebFix services where completed_at is between
  // 7 and 8 days ago (window to catch exactly 7 days with daily runs)
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      cs_id: clientServices.id,
      cs_service_id: clientServices.service_id,
      cs_metadata: clientServices.metadata,
      cs_completed_at: clientServices.completed_at,
      client_business_name: clients.business_name,
      client_contact_email: clients.contact_email,
    })
    .from(clientServices)
    .innerJoin(clients, eq(clientServices.client_id, clients.id))
    .where(
      and(
        eq(clientServices.status, "completed"),
        sql`(${clientServices.service_id} LIKE 'sitelaunch%' OR ${clientServices.service_id} LIKE 'webfix%')`,
        lte(clientServices.completed_at, sevenDaysAgo),
        gte(clientServices.completed_at, eightDaysAgo),
      ),
    );

  for (const row of rows) {
    result.checked++;

    // Check if already sent
    const meta = (row.cs_metadata as Record<string, any>) || {};
    if (meta.upsell_email_sent) {
      log.debug(`Skipping cs#${row.cs_id} — upsell already sent`);
      result.skipped++;
      continue;
    }

    // Need an email to send to
    if (!row.client_contact_email) {
      log.debug(`Skipping cs#${row.cs_id} — no contact email`);
      result.skipped++;
      continue;
    }

    const portalUrl = `${baseUrl}/portal/services`;
    const isSiteLaunch = row.cs_service_id.startsWith("sitelaunch");

    try {
      let sent: boolean;
      if (isSiteLaunch) {
        sent = await sendPostSiteLaunchUpsell(row.client_contact_email, {
          businessName: row.client_business_name,
          portalUrl,
        });
      } else {
        sent = await sendPostWebFixUpsell(row.client_contact_email, {
          businessName: row.client_business_name,
          portalUrl,
        });
      }

      if (sent) {
        // Stamp metadata to prevent re-send
        await db
          .update(clientServices)
          .set({
            metadata: {
              ...meta,
              upsell_email_sent: true,
              upsell_email_sent_at: new Date().toISOString(),
              upsell_email_type: isSiteLaunch ? "post_sitelaunch" : "post_webfix",
            },
            updated_at: new Date(),
          } as any)
          .where(eq(clientServices.id, row.cs_id));

        result.sent++;
        log.info(`Upsell sent for cs#${row.cs_id} (${isSiteLaunch ? "SiteLaunch" : "WebFix"})`);
      } else {
        result.skipped++;
      }
    } catch (err: any) {
      log.error(`Error sending upsell for cs#${row.cs_id}`, { error: err.message });
      result.errors++;
    }
  }

  log.info(
    `Complete: ${result.checked} checked, ${result.sent} sent, ${result.skipped} skipped, ${result.errors} errors`,
  );

  return result;
}

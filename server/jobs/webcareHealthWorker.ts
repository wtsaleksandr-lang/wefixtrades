/**
 * WebCare Health Worker
 *
 * Runs on a 15-minute cron. For each active WebCare client_service,
 * performs an HTTP HEAD check against the client's website_url.
 *
 * - 2xx → logs uptime OK
 * - non-2xx or timeout → creates a high-priority fulfillment task
 *   (type "uptime_alert") so the ops team can investigate
 *
 * Wrapped by `runJob()` in the scheduler — that wrapper provides
 * the retry-with-backoff (3 attempts) and the job-log database row.
 *
 * Returns aggregate counts that flow into job_logs.metadata for audit.
 */

import { db } from "../db";
import { storage } from "../storage";
import { clients, clientServices, serviceCatalog } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

const REQUEST_TIMEOUT_MS = 15_000;

interface HealthCheckResult {
  checked: number;
  up: number;
  down: number;
  skipped: number;
  errors: number;
  tasksCreated: number;
}

/**
 * Perform a simple HTTP HEAD request. Returns true if the response
 * status is 2xx within the timeout window, false otherwise.
 */
async function checkSiteHealth(url: string): Promise<{ ok: boolean; status: number | null; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "WeFixTrades-WebCare/1.0 (health-check)",
      },
    });

    clearTimeout(timer);

    const ok = response.status >= 200 && response.status < 300;
    return { ok, status: response.status };
  } catch (err: any) {
    if (err.name === "AbortError") {
      return { ok: false, status: null, error: "timeout" };
    }
    return { ok: false, status: null, error: err.message };
  }
}

export async function processWebcareHealthChecks(): Promise<HealthCheckResult> {
  console.log("[WebCare] Starting health check sweep...");

  const result: HealthCheckResult = {
    checked: 0,
    up: 0,
    down: 0,
    skipped: 0,
    errors: 0,
    tasksCreated: 0,
  };

  // Query all active, enabled WebCare client_services joined with client data
  const rows = await db
    .select({
      cs_id: clientServices.id,
      cs_client_id: clientServices.client_id,
      cs_service_id: clientServices.service_id,
      client_website_url: clients.website_url,
      client_business_name: clients.business_name,
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
    const websiteUrl = row.client_website_url;

    // Skip if no website URL configured
    if (!websiteUrl) {
      console.log(`[WebCare] Skipping cs#${row.cs_id} (${row.client_business_name}) — no website_url`);
      result.skipped++;
      continue;
    }

    // Normalize URL — ensure it has a protocol
    const normalizedUrl = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;

    try {
      result.checked++;
      const health = await checkSiteHealth(normalizedUrl);

      if (health.ok) {
        console.log(`[WebCare] UP — cs#${row.cs_id} ${normalizedUrl} (${health.status})`);
        result.up++;
      } else {
        console.warn(
          `[WebCare] DOWN — cs#${row.cs_id} ${normalizedUrl} status=${health.status} error=${health.error || "none"}`,
        );
        result.down++;

        // Check for an existing open uptime_alert task to avoid duplicates
        const existingTasks = await db
          .select({ id: sql<number>`id` })
          .from(sql`fulfillment_tasks`)
          .where(
            and(
              eq(sql`client_service_id`, row.cs_id),
              sql`title = 'Uptime alert: site is down'`,
              sql`status NOT IN ('delivered', 'cancelled')`,
            ),
          )
          .limit(1);

        if (existingTasks.length > 0) {
          console.log(`[WebCare] Existing uptime_alert task already open for cs#${row.cs_id}, skipping task creation`);
          continue;
        }

        // Create a high-priority fulfillment task
        await storage.createFulfillmentTask({
          client_service_id: row.cs_id,
          client_id: row.cs_client_id,
          title: "Uptime alert: site is down",
          description: `Automated health check detected that ${normalizedUrl} is ${
            health.status ? `returning HTTP ${health.status}` : `unreachable (${health.error || "unknown error"})`
          }. Investigate and resolve.`,
          status: "not_started",
          priority: "high",
          handled_by: "internal",
          actor_type: "system",
          metadata: {
            type: "uptime_alert",
            url: normalizedUrl,
            http_status: health.status,
            error: health.error || null,
            detected_at: new Date().toISOString(),
          },
        });

        result.tasksCreated++;
        console.log(`[WebCare] Created uptime_alert task for cs#${row.cs_id}`);
      }
    } catch (err: any) {
      console.error(`[WebCare] Error checking cs#${row.cs_id} (${normalizedUrl}):`, err.message);
      result.errors++;
    }
  }

  console.log(
    `[WebCare] Complete: ${result.checked} checked, ${result.up} up, ${result.down} down, ` +
    `${result.skipped} skipped, ${result.errors} errors, ${result.tasksCreated} tasks created`,
  );

  return result;
}

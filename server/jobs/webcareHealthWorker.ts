/**
 * WebCare Health Worker
 *
 * Runs on a 15-minute cron. For each active WebCare client_service,
 * performs an HTTP HEAD check against the client's website_url.
 *
 * - 2xx → logs uptime OK
 * - non-2xx or timeout → creates a high-priority fulfillment task
 *   (type "uptime_alert") so the ops team can investigate, AND sends
 *   a downtime alert email to the client (deduped: max 1 per 4 hours
 *   per site via client_service.metadata.last_downtime_alert_at)
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
import { sendWebcareDowntimeAlert } from "../lib/webcareAlertEmail";
import { createLogger } from "../lib/logger";

const log = createLogger("WebCare");

const REQUEST_TIMEOUT_MS = 15_000;

/** Dedup cooldown — max 1 downtime alert email per site per 4 hours */
const ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000;

/** Max entries in uptime_history — one check per 15 min = ~96/day, keep 30 days */
const MAX_UPTIME_HISTORY = 30 * 96;

interface UptimeEntry {
  ts: string;
  status: "up" | "down";
  http_status: number | null;
}

/**
 * Record a health check result in the client_service metadata.
 * Keeps the last 30 days of checks (trimmed by MAX_UPTIME_HISTORY).
 */
async function recordUptimeHistory(
  csId: number,
  csMeta: Record<string, any>,
  checkStatus: "up" | "down",
  httpStatus: number | null,
): Promise<void> {
  const history: UptimeEntry[] = Array.isArray(csMeta.uptime_history)
    ? csMeta.uptime_history
    : [];

  history.push({
    ts: new Date().toISOString(),
    status: checkStatus,
    http_status: httpStatus,
  });

  // Trim to last MAX_UPTIME_HISTORY entries
  const trimmed = history.length > MAX_UPTIME_HISTORY
    ? history.slice(history.length - MAX_UPTIME_HISTORY)
    : history;

  await db.update(clientServices)
    .set({
      metadata: { ...csMeta, uptime_history: trimmed },
      updated_at: new Date(),
    } as any)
    .where(eq(clientServices.id, csId));
}

interface HealthCheckResult {
  checked: number;
  up: number;
  down: number;
  skipped: number;
  errors: number;
  tasksCreated: number;
  alertsSent: number;
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
  log.info("Starting health check sweep");

  const result: HealthCheckResult = {
    checked: 0,
    up: 0,
    down: 0,
    skipped: 0,
    errors: 0,
    tasksCreated: 0,
    alertsSent: 0,
  };

  // Query all active, enabled WebCare client_services joined with client data
  const rows = await db
    .select({
      cs_id: clientServices.id,
      cs_client_id: clientServices.client_id,
      cs_service_id: clientServices.service_id,
      cs_metadata: clientServices.metadata,
      client_website_url: clients.website_url,
      client_business_name: clients.business_name,
      client_contact_email: clients.contact_email,
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
      log.debug(`Skipping cs#${row.cs_id} (${row.client_business_name}) — no website_url`);
      result.skipped++;
      continue;
    }

    // Normalize URL — ensure it has a protocol
    const normalizedUrl = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;

    try {
      result.checked++;
      const health = await checkSiteHealth(normalizedUrl);

      // Record uptime history regardless of up/down
      const csMeta = (row.cs_metadata as Record<string, any>) || {};
      try {
        await recordUptimeHistory(row.cs_id, csMeta, health.ok ? "up" : "down", health.status);
      } catch (histErr: any) {
        log.warn(`Failed to record uptime history for cs#${row.cs_id}`, { error: histErr.message });
      }

      if (health.ok) {
        log.debug(`UP — cs#${row.cs_id} ${normalizedUrl} (${health.status})`);
        result.up++;
      } else {
        log.warn(
          `DOWN — cs#${row.cs_id} ${normalizedUrl} status=${health.status} error=${health.error || "none"}`,
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
          log.debug(`Existing uptime_alert task already open for cs#${row.cs_id}, skipping task creation`);
        } else {
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
          log.info(`Created uptime_alert task for cs#${row.cs_id}`);
        }

        // Send downtime alert email — deduped via 4-hour cooldown
        if (row.client_contact_email) {
          const lastAlertAt = csMeta.last_downtime_alert_at
            ? new Date(csMeta.last_downtime_alert_at).getTime()
            : 0;
          const now = Date.now();

          if (now - lastAlertAt >= ALERT_COOLDOWN_MS) {
            try {
              const sent = await sendWebcareDowntimeAlert({
                businessName: row.client_business_name,
                websiteUrl: normalizedUrl,
                httpStatus: health.status,
                error: health.error || null,
                detectedAt: new Date().toISOString(),
                recipientEmail: row.client_contact_email,
              });

              if (sent) {
                result.alertsSent++;
                // Stamp dedup marker
                await db.update(clientServices)
                  .set({
                    metadata: {
                      ...csMeta,
                      last_downtime_alert_at: new Date().toISOString(),
                    },
                    updated_at: new Date(),
                  } as any)
                  .where(eq(clientServices.id, row.cs_id));
              }
            } catch (emailErr: any) {
              // Email failures must never block health check processing
              log.error(`Alert email failed for cs#${row.cs_id}`, { error: emailErr.message });
            }
          } else {
            log.debug(`Alert cooldown active for cs#${row.cs_id} — skipping email`);
          }
        }
      }
    } catch (err: any) {
      log.error(`Error checking cs#${row.cs_id} (${normalizedUrl})`, { error: err.message });
      result.errors++;
    }
  }

  log.info(
    `Complete: ${result.checked} checked, ${result.up} up, ${result.down} down, ` +
    `${result.skipped} skipped, ${result.errors} errors, ${result.tasksCreated} tasks created, ` +
    `${result.alertsSent} alerts sent`,
  );

  return result;
}

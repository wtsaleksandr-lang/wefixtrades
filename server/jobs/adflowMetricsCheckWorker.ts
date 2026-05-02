/**
 * AdFlow Missing-Metrics Check Worker
 *
 * Runs daily from the 28th–30th of each month. Checks all active
 * AdFlow services for missing current-month metrics and fires a
 * system alert + admin email listing clients that need data entered.
 *
 * Idempotent per day: only fires one alert per calendar day.
 */
import { db } from "../db";
import { clientServices, clients, serviceCatalog } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { fireAlert } from "../services/alertService";
import { createLogger } from "../lib/logger";

const log = createLogger("AdflowMetricsCheck");

export async function checkAdflowMissingMetrics(): Promise<{
  checked: number;
  missing: number;
  clients_missing: string[];
}> {
  const now = new Date();
  const day = now.getUTCDate();

  // Only run on the 28th, 29th, or 30th
  if (day < 28 || day > 30) {
    log.info("[adflow-metrics-check] Not in 28-30 window, skipping");
    return { checked: 0, missing: 0, clients_missing: [] };
  }

  // The current month that we expect metrics for (the month about to end)
  const currentMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const activeServices = await db.select({
    cs_id: clientServices.id,
    metadata: clientServices.metadata,
    business_name: clients.business_name,
    service_id: clientServices.service_id,
  })
    .from(clientServices)
    .innerJoin(clients, eq(clientServices.client_id, clients.id))
    .where(and(
      eq(clientServices.status, "active"),
      eq(clientServices.enabled, true),
      sql`${clientServices.service_id} LIKE 'adflow%'`,
    ));

  const clientsMissing: string[] = [];

  for (const svc of activeServices) {
    const meta = (svc.metadata as any) || {};
    const latestReport = meta.latest_report;
    const periodStart: string | undefined = latestReport?.period_start;

    // Check if period_start is in the current month
    const hasCurrentMetrics = periodStart
      ? periodStart.slice(0, 7) === currentMonthKey
      : false;

    if (!hasCurrentMetrics) {
      clientsMissing.push(`${svc.business_name} (${svc.service_id}, cs#${svc.cs_id})`);
    }
  }

  if (clientsMissing.length > 0) {
    const details = `The following AdFlow clients are missing metrics for ${currentMonthKey}. Reports send on the 2nd — enter metrics before then.\n\n${clientsMissing.join("\n")}`;

    await fireAlert({
      severity: "warning",
      category: "adflow_missing_metrics",
      title: `${clientsMissing.length} AdFlow client${clientsMissing.length === 1 ? "" : "s"} missing metrics for ${currentMonthKey}`,
      details,
      metadata: {
        month: currentMonthKey,
        missing_count: clientsMissing.length,
        clients: clientsMissing,
      },
    });

    log.info(`[adflow-metrics-check] Alert fired: ${clientsMissing.length} clients missing metrics for ${currentMonthKey}`);
  } else {
    log.info(`[adflow-metrics-check] All ${activeServices.length} AdFlow services have current-month metrics`);
  }

  return {
    checked: activeServices.length,
    missing: clientsMissing.length,
    clients_missing: clientsMissing,
  };
}

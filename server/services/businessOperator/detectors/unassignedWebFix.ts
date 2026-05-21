/**
 * Detector: unassigned_webfix.
 *
 * Finds active WebFix client_services rows that don't have any
 * fulfillment_tasks assigned to a supplier yet, more than 48h after the
 * service was started. WeFixTrades models "service orders" as the join of
 * (clients × clientServices) — there is no dedicated `service_orders`
 * table — so the detector queries clientServices directly and joins
 * fulfillmentTasks to detect missing supplier assignment.
 *
 * Severity: high.
 */

import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "../../../db";
import { clientServices, fulfillmentTasks } from "@shared/schema";
import type { DetectorSignal } from "../types";

const MAX_SIGNALS = 20;
const STUCK_HOURS = 48;
const WEBFIX_SERVICE_ID_PATTERNS = ["webfix", "web-fix", "site-launch"];

export async function detect(): Promise<DetectorSignal[]> {
  const cutoff = new Date(Date.now() - STUCK_HOURS * 60 * 60 * 1000);

  // Active webfix client_services rows that have no fulfillment_task with a
  // supplier_id assigned. We use a NOT EXISTS subquery to keep the join cheap.
  const rows = await db
    .select({
      id: clientServices.id,
      client_id: clientServices.client_id,
      service_id: clientServices.service_id,
      status: clientServices.status,
      started_at: clientServices.started_at,
      created_at: clientServices.created_at,
    })
    .from(clientServices)
    .where(
      and(
        eq(clientServices.status, "active"),
        sql`${clientServices.service_id} ~* ${WEBFIX_SERVICE_ID_PATTERNS.join("|")}`,
        lt(clientServices.created_at, cutoff),
        sql`NOT EXISTS (
          SELECT 1 FROM ${fulfillmentTasks}
          WHERE ${fulfillmentTasks.client_service_id} = ${clientServices.id}
            AND ${fulfillmentTasks.supplier_id} IS NOT NULL
        )`,
      ),
    )
    .limit(MAX_SIGNALS);

  return rows.map((r) => {
    const hoursStuck = r.created_at
      ? Math.round((Date.now() - r.created_at.getTime()) / 36e5)
      : null;
    return {
      signal_id: `client_service_${r.id}`,
      detail: {
        client_service_id: r.id,
        client_id: r.client_id,
        service_id: r.service_id,
        status: r.status,
        started_at: r.started_at?.toISOString() ?? null,
        created_at: r.created_at?.toISOString() ?? null,
        hours_unassigned: hoursStuck,
      },
      summary: `WebFix order #${r.id} (client ${r.client_id}, ${r.service_id}) has no supplier assigned${
        hoursStuck ? ` after ${hoursStuck}h` : ""
      }.`,
      severity: "high",
    };
  });
}

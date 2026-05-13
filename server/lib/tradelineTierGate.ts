/**
 * Tier gate for Option C (port-existing-number) in the tradeline-setup wizard.
 *
 * A customer has "pro or higher" tradeline if they have an active
 * client_services row with a service_id in the pro tier set. Tier is
 * implicit per-service in WeFixTrades — there is no clients.plan_tier
 * column (see CARRYOVER M6).
 *
 * Bypass for v1 launch experiments: set TRADELINE_PORT_UNGATED=true.
 */

import { db } from "../db";
import { clientServices } from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";

/** Service IDs that grant Option C access. Extend as new pro tiers ship. */
const PRO_SERVICE_IDS = ["tradeline-pro", "tradeline-enterprise"] as const;

export async function hasTradelineProOrHigher(clientId: number): Promise<boolean> {
  if (process.env.TRADELINE_PORT_UNGATED === "true") return true;

  const rows = await db
    .select({ id: clientServices.id })
    .from(clientServices)
    .where(
      and(
        eq(clientServices.client_id, clientId),
        inArray(clientServices.service_id, [...PRO_SERVICE_IDS]),
        eq(clientServices.status, "active"),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

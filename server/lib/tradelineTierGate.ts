/**
 * Per-service tier check: does this client have an active TradeLine Pro or
 * Premium service? Tier is implicit per-service in WeFixTrades — there is
 * no clients.plan_tier column (see CARRYOVER M6).
 *
 * Not currently called from any wizard route (Option C porting was ungated
 * — available on all tiers). Kept for future Pro-only feature gating.
 */

import { db } from "../db";
import { clientServices } from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";

const PRO_SERVICE_IDS = ["tradeline-pro", "tradeline-premium"] as const;

export async function hasTradelineProOrHigher(clientId: number): Promise<boolean> {
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

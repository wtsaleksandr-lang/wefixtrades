/**
 * Canonical Pro-access check for a WeFixTrades client.
 *
 * A client has "Pro access" if EITHER:
 *   (a) they own an active client_service in the PRO_SERVICE_IDS list, OR
 *   (b) their 14-day Pro trial is still active
 *       (trial_pro_features_enabled = true AND trial_pro_expires_at > now()).
 *
 * Use this helper at every Pro-gated route. Supersedes the older
 * server/lib/tradelineTierGate.ts which is currently unused
 * (PR #122 removed all the porting-gate callers).
 *
 * Trial: every new self-serve signup is enrolled in a 14-day Pro trial
 * (see authRoutes.ts:/api/auth/signup). When the trial expires, the
 * daily cron in server/jobs/trialProExpiryWorker.ts flips the flag
 * back to false and emails the trade.
 */

import { db } from "../db";
import { clients, clientServices } from "@shared/schema";
import { and, eq, inArray, gt, sql } from "drizzle-orm";

const PRO_SERVICE_IDS = ["tradeline-pro", "tradeline-premium"] as const;

export async function clientHasProAccess(clientId: number): Promise<boolean> {
  // Real paying Pro subscription wins
  const [activeProService] = await db
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
  if (activeProService) return true;

  // Active trial
  const [trialClient] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        eq(clients.id, clientId),
        eq(clients.trial_pro_features_enabled, true),
        gt(clients.trial_pro_expires_at, sql`now()`),
      ),
    )
    .limit(1);
  return !!trialClient;
}

/** Days remaining in the Pro trial, or null if no active trial. */
export async function clientProTrialDaysRemaining(clientId: number): Promise<number | null> {
  const [row] = await db
    .select({
      enabled: clients.trial_pro_features_enabled,
      expiresAt: clients.trial_pro_expires_at,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!row?.enabled || !row.expiresAt) return null;
  const ms = row.expiresAt.getTime() - Date.now();
  if (ms <= 0) return null;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

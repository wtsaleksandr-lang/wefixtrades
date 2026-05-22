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
 *
 * P1 fix: when an admin has flipped the per-session
 * `admin_pro_preview` flag on (via POST /api/admin/me/preview-pro),
 * `clientHasProAccessForRequest(req, clientId)` returns true for that
 * admin's session regardless of the underlying client's subscription
 * state. The flag is read-only override — it does not affect billing,
 * other users' accounts, or audit logs. It clears automatically on
 * logout (req.logout destroys the session).
 */

import type { Request } from "express";
import { db } from "../db";
import { clients, clientServices } from "@shared/schema";
import { and, eq, inArray, gt, sql } from "drizzle-orm";

const PRO_SERVICE_IDS = ["tradeline-pro", "tradeline-premium"] as const;

/**
 * Returns true when the signed-in admin has the per-session
 * `admin_pro_preview` flag enabled. Safe to call without `req` (returns
 * false). Used by `clientHasProAccessForRequest` and any client-side
 * gating code that exposes the flag via `/api/auth/me`.
 */
export function adminProPreviewActive(req?: Request | null): boolean {
  if (!req) return false;
  if (req.user?.role !== "admin") return false;
  const sess = req.session as (typeof req.session & { admin_pro_preview?: boolean }) | undefined;
  return sess?.admin_pro_preview === true;
}

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

/**
 * Request-aware Pro-access check.
 *
 * Identical to `clientHasProAccess(clientId)` except that an admin with
 * `admin_pro_preview` flipped on in their session is treated as Pro
 * regardless of the underlying client's subscription state. Use this at
 * any route handler that has a `req` in scope — the plain
 * `clientHasProAccess(clientId)` is still the right call for cron jobs
 * and other request-less contexts.
 */
export async function clientHasProAccessForRequest(
  req: Request | null | undefined,
  clientId: number,
): Promise<boolean> {
  if (adminProPreviewActive(req)) return true;
  return clientHasProAccess(clientId);
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

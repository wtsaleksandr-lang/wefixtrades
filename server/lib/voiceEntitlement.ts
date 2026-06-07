/**
 * Mobile-voice entitlement + usage metering (P0 toll-fraud / unbounded-billing guard).
 *
 * Two independent gates, both enforced at the access-token mint AND in the
 * outbound-twiml webhook (defence in depth — the token is long-lived, so a
 * single mint must not grant unlimited billed calling for its lifetime):
 *
 *   1. ENTITLEMENT — does this WeFixTrades user own a live voice
 *      entitlement? Mirrors the inbound AI-employee gate in
 *      twilioRoutes.ts (~326): a real active/onboarding tradeline service
 *      OR an in-window Pro trial. No entitlement → no token, no dial.
 *
 *   2. USAGE CAP — a per-user call-count meter with a hard DAILY and
 *      MONTHLY ceiling. Rejects once either is exceeded so a compromised
 *      or abusive client can't run up an unbounded Twilio bill. Counts are
 *      in-memory (single-server) and reset with their window — that is
 *      acceptable for a cost CEILING (worst case after a restart is one
 *      extra window of headroom, still finite).
 *
 * Tier id note: WeFixTrades has tier-id drift across the codebase
 * (tradeline-starter / -pro / -premium / -elite / -enterprise). To avoid
 * a toll-fraud hole where a live tier is missing from a hardcoded list, the
 * entitlement match is `service_id LIKE 'tradeline%'` rather than an
 * allow-list — every tradeline tier grants voice, none can be forgotten.
 */

import { db } from "../db";
import { clients, clientServices } from "@shared/schema";
import { and, eq, like, inArray } from "drizzle-orm";
import { RateLimiter, MemoryRateLimitStore } from "../services/rateLimiter";
import { createLogger } from "./logger";

const log = createLogger("VoiceEntitlement");

export type VoiceEntitlement = "active" | "trial";

/** client_services.status values that count as a live (billable) service. */
const LIVE_SERVICE_STATUSES = ["active", "onboarding"] as const;

/**
 * Resolve a user's voice entitlement, or null if they have none.
 *
 *   "active" — owns an enabled tradeline service in a live status.
 *   "trial"  — no paid service, but inside the 14-day Pro trial window.
 *   null     — neither → must be refused a Voice token / outbound dial.
 *
 * Returns null (deny) on any DB error — fail CLOSED, never fail open for a
 * billing-sensitive gate.
 */
export async function resolveVoiceEntitlement(
  userId: number,
): Promise<VoiceEntitlement | null> {
  if (!Number.isFinite(userId) || userId <= 0) return null;
  try {
    // user → client
    const [client] = await db
      .select({
        id: clients.id,
        trialEnabled: clients.trial_pro_features_enabled,
        trialExpiresAt: clients.trial_pro_expires_at,
      })
      .from(clients)
      .where(eq(clients.user_id, userId))
      .limit(1);
    if (!client) return null;

    // Real, billable tradeline service in a live status wins.
    const [liveService] = await db
      .select({ id: clientServices.id })
      .from(clientServices)
      .where(
        and(
          eq(clientServices.client_id, client.id),
          like(clientServices.service_id, "tradeline%"),
          eq(clientServices.enabled, true),
          inArray(clientServices.status, [...LIVE_SERVICE_STATUSES]),
        ),
      )
      .limit(1);
    if (liveService) return "active";

    // In-window Pro trial (14-day signup trial; cron flips the flag off on expiry).
    if (
      client.trialEnabled &&
      client.trialExpiresAt &&
      client.trialExpiresAt.getTime() > Date.now()
    ) {
      return "trial";
    }

    return null;
  } catch (err) {
    // Fail closed — a DB hiccup must not open the billing gate.
    log.error("entitlement lookup failed; denying", {
      userId,
      err: (err as Error).message,
    });
    return null;
  }
}

/* ─── Per-user outbound usage caps (call-count ceiling) ───────────────────
 *
 * Hard ceilings on outbound calls PLACED per user, by entitlement tier:
 *
 *   trial  →  20 calls / day,  100 calls / month
 *   active →  60 calls / day,  600 calls / month
 *
 * Rationale: a real tradesperson returning leads makes on the order of a
 * few dozen calls a day; these ceilings sit comfortably above honest use
 * while making a runaway / compromised client's bill BOUNDED rather than
 * open-ended. (Per-minute duration metering is a follow-up — the status
 * webhook reports CallDuration but the cheapest, highest-value cap to ship
 * first is the call-count ceiling that stops a dial loop cold.)
 *
 * Counts are consumed at the point a call is actually authorised to dial
 * (outbound-twiml), so a token mint that never places a call costs nothing.
 */
export interface VoiceUsageCaps {
  dailyCalls: number;
  monthlyCalls: number;
}

export const VOICE_USAGE_CAPS: Record<VoiceEntitlement, VoiceUsageCaps> = {
  trial: { dailyCalls: 20, monthlyCalls: 100 },
  active: { dailyCalls: 60, monthlyCalls: 600 },
};

const DAY_MS = 24 * 60 * 60_000;
const MONTH_MS = 30 * DAY_MS;

// Shared store so the two limiters age out together; keys are namespaced.
const usageStore = new MemoryRateLimitStore();

// One limiter per (window × tier-ceiling). We can't put a per-tier ceiling
// on a single RateLimiter instance, so we build the four ceilings up front
// and pick the pair that matches the caller's entitlement.
const dailyLimiters: Record<VoiceEntitlement, RateLimiter> = {
  trial: new RateLimiter(usageStore, VOICE_USAGE_CAPS.trial.dailyCalls, DAY_MS),
  active: new RateLimiter(usageStore, VOICE_USAGE_CAPS.active.dailyCalls, DAY_MS),
};
const monthlyLimiters: Record<VoiceEntitlement, RateLimiter> = {
  trial: new RateLimiter(usageStore, VOICE_USAGE_CAPS.trial.monthlyCalls, MONTH_MS),
  active: new RateLimiter(usageStore, VOICE_USAGE_CAPS.active.monthlyCalls, MONTH_MS),
};

export interface UsageCheckResult {
  allowed: boolean;
  /** Which ceiling tripped, for logging / the rejection message. */
  scope?: "daily" | "monthly";
}

/**
 * Consume one outbound-call unit against the user's daily AND monthly
 * ceiling. Returns allowed=false (with the tripped scope) once either is
 * exceeded. Both windows are always incremented so a caller can't dodge the
 * monthly ceiling by spreading calls across days.
 */
export async function consumeOutboundCall(
  userId: number,
  entitlement: VoiceEntitlement,
): Promise<UsageCheckResult> {
  const dailyOk = await dailyLimiters[entitlement].check(`voice:day:${userId}`);
  const monthlyOk = await monthlyLimiters[entitlement].check(`voice:mon:${userId}`);
  if (!dailyOk) return { allowed: false, scope: "daily" };
  if (!monthlyOk) return { allowed: false, scope: "monthly" };
  return { allowed: true };
}

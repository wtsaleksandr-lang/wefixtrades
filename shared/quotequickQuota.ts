/**
 * QuoteQuick free-tier quote quota.
 *
 * The pricing model is "all features free; only the powered-by badge + this
 * monthly quote quota differentiate paid". This module is the single source
 * of truth for the limit + the soft-cap policy so the server enforcement and
 * the portal meter agree on the same numbers.
 *
 * Counting unit: quote/lead captures (POST /api/leads) per ACCOUNT
 * (calculators.user_id) per CALENDAR month (created_date within the current
 * month, account-local UTC). Paid tiers are unlimited.
 *
 * ── ENFORCEMENT POLICY (FLAGGED FOR ALEX) ───────────────────────────────────
 * Default is SOFT-CAP: when a free account is at/over the limit we STILL accept
 * and persist the lead (never lose a tradesperson a real customer), but we
 * flag the capture response with `quota_exceeded: true` and surface an upgrade
 * nudge to the OWNER in the portal. Hard-blocking capture would drop paying
 * customers on the floor — a worse failure than an over-quota free account.
 *
 * If Alex decides a HARD block is wanted instead, flip QUOTA_HARD_BLOCK to true
 * and the capture endpoint will reject over-limit free submissions with 402.
 * Left as an explicit constant so the choice is a one-line change, not a
 * rewrite.
 */

export const FREE_MONTHLY_QUOTE_LIMIT = 50;

/**
 * SOFT-CAP (default, false) = accept over-limit leads + flag.
 * HARD-BLOCK (true) = reject over-limit free-tier captures with 402.
 * See policy note above. Toggle only on Alex's explicit decision.
 */
export const QUOTA_HARD_BLOCK = false;

/**
 * "Near limit" threshold for the portal nudge (90% of the free allowance).
 * The meter switches to a warning style + shows the upgrade CTA at/above this.
 */
export const QUOTA_NEAR_LIMIT_RATIO = 0.9;

/**
 * An account is treated as PAID (unlimited) when it owns at least one
 * calculator whose plan_tier is anything other than "free" / null. A paid
 * subscription on the account unlocks the whole account, not a single widget.
 */
export function isPaidTier(planTiers: Array<string | null | undefined>): boolean {
  return planTiers.some(
    (t) => t != null && t.trim() !== "" && t.trim().toLowerCase() !== "free",
  );
}

export interface QuotaUsage {
  used: number;
  limit: number | null; // null = unlimited (paid)
  tier: "free" | "paid";
  quota_exceeded: boolean;
  near_limit: boolean;
  resets_at: string; // ISO — first instant of next calendar month (UTC)
}

/** First instant of the current calendar month (UTC). */
export function startOfMonthUTC(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

/** First instant of the next calendar month (UTC) — when the quota resets. */
export function startOfNextMonthUTC(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

/**
 * Build the usage view-model from a raw monthly count + the account's tier.
 * Pure — shared by the usage endpoint and the capture-time flag so they never
 * disagree.
 */
export function buildQuotaUsage(
  used: number,
  isPaid: boolean,
  now: Date = new Date(),
): QuotaUsage {
  if (isPaid) {
    return {
      used,
      limit: null,
      tier: "paid",
      quota_exceeded: false,
      near_limit: false,
      resets_at: startOfNextMonthUTC(now).toISOString(),
    };
  }
  return {
    used,
    limit: FREE_MONTHLY_QUOTE_LIMIT,
    tier: "free",
    quota_exceeded: used >= FREE_MONTHLY_QUOTE_LIMIT,
    near_limit: used >= Math.floor(FREE_MONTHLY_QUOTE_LIMIT * QUOTA_NEAR_LIMIT_RATIO),
    resets_at: startOfNextMonthUTC(now).toISOString(),
  };
}

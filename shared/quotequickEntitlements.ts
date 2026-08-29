/**
 * QuoteQuick feature entitlements — the single source of truth for
 * "does this calculator's plan include feature X?".
 *
 * ── WHY THIS MODULE EXISTS ──────────────────────────────────────────────────
 * Before this file there was no shared tier helper at all. Five different
 * "is this account paid?" predicates had drifted apart across the codebase:
 *
 *   calculatorRoutes.ts:581        pro | business | starter
 *   brandSettings.ts:108-116       business | enterprise
 *   portalBrandKitsRoutes.ts:62    starter | pro | business
 *   quotequickQuota.ts:46          anything not-null and not "free"
 *   apiTierLoyalty.ts:20           pro | business (+ live stripe_subscription_id)
 *
 * None of them could express "Business only", which the pricing page needs:
 * it sells webhooks and booking/deposits as Business but SMS as Pro. New gates
 * therefore go through `hasQuoteQuickFeature()` rather than a sixth predicate.
 *
 * ── ⚠️ POLICY CONFLICT — FLAGGED FOR ALEX (do not resolve silently) ──────────
 * Two records of the QuoteQuick packaging decision disagree, and this module
 * deliberately does NOT pick a winner behind anyone's back:
 *
 *   (a) shared/pricing.ts — the canonical, customer-visible pricing page —
 *       advertises "Email + SMS follow-ups" as Pro and "Online booking +
 *       deposits" / "Webhook / CRM integration" as Business. Alex last edited
 *       that file himself on 2026-06-23 (commit 2f14a201) and kept the comment
 *       "Pro unlocks badge removal + custom domain + SMS; Business at $79 adds
 *       the AI assistant + bookings + webhooks + multi-calc."
 *
 *   (b) A 2026-06-06 product decision recorded outside the repo states that
 *       EVERY wizard feature is free and the only paid differentiators are the
 *       "Powered by" badge and the monthly quote quota. shared/quotequickQuota.ts
 *       (created 2026-06-06) still opens with that claim, and the outbound lead
 *       webhook shipped 2026-06-08 with an explicit "Free for all tiers — no
 *       plan gate" comment implementing it.
 *
 * Until 2026-08-29 the SERVER implemented (b) while the PRICING PAGE advertised
 * (a) — customers were told three features were paid and were then handed them
 * for free. That mismatch is the actual defect. This module makes the server
 * match the advertised page, which is the honest-claims default.
 *
 * If (b) is the live decision, the fix is ONE line: set QQ_FEATURE_GATES_ENABLED
 * to false below and update the Pro/Business bullet lists in shared/pricing.ts
 * to stop advertising feature locks. Nothing else needs to change.
 *
 * ── MIGRATION SAFETY ────────────────────────────────────────────────────────
 * A production audit on 2026-08-29 found 3 calculators total, ALL on the free
 * tier, and ZERO of them with a webhook, deposit or owner-SMS configured (no
 * widget_deposits rows exist at all). So turning these gates on breaks nobody
 * today. `grandfathered` below is the escape hatch if that ever stops being
 * true: listing a feature key in calculator_settings.entitlements.grandfathered
 * keeps it working on any tier, with no schema change and no code deploy.
 */

/** DB `calculators.plan_tier` values, lowest → highest. */
export const QQ_TIER_RANK: Readonly<Record<string, number>> = Object.freeze({
  free: 0,
  /* Legacy alias — migrations/0014_quotequick_starter_to_pro.sql converted
   * these rows to 'pro', but the value is still accepted defensively because
   * three other gates in the codebase still list it. Ranks AS pro. */
  starter: 2,
  pro: 2,
  business: 3,
  /* Not a real sold tier; brandSettings.ts accepts it, so it is tolerated
   * here rather than silently ranking as free. */
  enterprise: 4,
});

/** Features whose availability depends on the plan tier. */
export type QuoteQuickFeature = "lead_webhook" | "booking_deposits" | "sms_followups";

/**
 * Minimum tier per gated feature.
 *
 * Mirrors the bullet lists in shared/pricing.ts (QUOTEQUICK.tiers). If a
 * bullet there moves between Pro and Business, change it HERE too — these two
 * files are the pair that must never disagree, because one is what we promise
 * and the other is what we enforce.
 */
export const QQ_FEATURE_MIN_TIER: Readonly<Record<QuoteQuickFeature, string>> = Object.freeze({
  // "Webhook / CRM integration (Zapier, Stripe, HubSpot)" — Business bullet.
  lead_webhook: "business",
  // "Online booking + deposits" — Business bullet.
  booking_deposits: "business",
  // "Email + SMS follow-ups" — Pro bullet.
  sms_followups: "pro",
});

/** Customer-facing names, used to build upgrade copy. */
export const QQ_FEATURE_LABELS: Readonly<Record<QuoteQuickFeature, string>> = Object.freeze({
  lead_webhook: "Webhook / CRM integration",
  booking_deposits: "Online booking + deposits",
  sms_followups: "SMS follow-ups",
});

/** Display names for tiers, for upgrade copy. */
const TIER_LABELS: Readonly<Record<string, string>> = Object.freeze({
  free: "Free",
  starter: "Pro",
  pro: "Pro",
  business: "Business",
  enterprise: "Enterprise",
});

/**
 * MASTER SWITCH for all three feature gates.
 *
 * true  = enforce the tiers advertised on shared/pricing.ts (current default).
 * false = every feature available on every tier; only the "Powered by" badge
 *         and the monthly quote quota differentiate paid.
 *
 * See the POLICY CONFLICT note at the top of this file. Flipping this is a
 * deliberate product decision, not a refactor — the pricing page copy must be
 * updated in the same change so what we advertise and what we enforce agree.
 */
export const QQ_FEATURE_GATES_ENABLED = true;

/** Normalise a raw plan_tier value. Null / blank / unknown → "free". */
export function normalizeTier(raw: string | null | undefined): string {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return "free";
  return Object.prototype.hasOwnProperty.call(QQ_TIER_RANK, t) ? t : "free";
}

/**
 * Rank a plan tier. An unrecognised tier ranks as FREE (0), not as paid —
 * `plan_tier` is an unconstrained text column with no CHECK constraint, so a
 * typo or a future tier name must fail CLOSED rather than unlock everything.
 */
export function tierRank(raw: string | null | undefined): number {
  return QQ_TIER_RANK[normalizeTier(raw)] ?? 0;
}

/** True when `planTier` is at or above `minTier`. */
export function tierAtLeast(planTier: string | null | undefined, minTier: string): boolean {
  return tierRank(planTier) >= tierRank(minTier);
}

/**
 * Grandfather escape hatch.
 *
 * `calculator_settings.entitlements.grandfathered` is a string[] of feature
 * keys that stay available on this calculator regardless of tier. It exists so
 * an account that configured a feature BEFORE it was gated is never broken
 * mid-integration; it is set by hand (or by a backfill) rather than earned.
 * Zero production rows need it as of 2026-08-29.
 */
export function isFeatureGrandfathered(
  calculatorSettings: unknown,
  feature: QuoteQuickFeature,
): boolean {
  const list = (calculatorSettings as any)?.entitlements?.grandfathered;
  return Array.isArray(list) && list.includes(feature);
}

export interface EntitlementResult {
  /** Whether the feature may be used. */
  allowed: boolean;
  /** Why — useful for logs and for choosing UI copy. */
  reason: "entitled" | "gates_disabled" | "grandfathered" | "tier_too_low";
  /** The tier this feature is advertised at. */
  requiredTier: string;
  /** The calculator's normalised tier. */
  planTier: string;
  feature: QuoteQuickFeature;
}

/**
 * THE gate. Every server route and every client control asks this.
 *
 * Order matters: the master switch wins, then grandfathering, then tier. That
 * way disabling the gates can never be overridden by a stale grandfather list,
 * and a grandfathered account is never broken by a tier downgrade.
 */
export function checkQuoteQuickFeature(
  planTier: string | null | undefined,
  feature: QuoteQuickFeature,
  calculatorSettings?: unknown,
): EntitlementResult {
  const requiredTier = QQ_FEATURE_MIN_TIER[feature];
  const normalized = normalizeTier(planTier);
  const base = { requiredTier, planTier: normalized, feature } as const;

  if (!QQ_FEATURE_GATES_ENABLED) {
    return { ...base, allowed: true, reason: "gates_disabled" };
  }
  if (isFeatureGrandfathered(calculatorSettings, feature)) {
    return { ...base, allowed: true, reason: "grandfathered" };
  }
  if (tierAtLeast(normalized, requiredTier)) {
    return { ...base, allowed: true, reason: "entitled" };
  }
  return { ...base, allowed: false, reason: "tier_too_low" };
}

/** Boolean convenience wrapper around checkQuoteQuickFeature(). */
export function hasQuoteQuickFeature(
  planTier: string | null | undefined,
  feature: QuoteQuickFeature,
  calculatorSettings?: unknown,
): boolean {
  return checkQuoteQuickFeature(planTier, feature, calculatorSettings).allowed;
}

/**
 * The allow-map handed to the client so the wizard never re-derives the tier
 * table (the mistake that let the five server predicates drift apart). The
 * client renders locks from THIS, so UI and server can never disagree.
 */
export function buildFeatureAllowMap(
  planTier: string | null | undefined,
  calculatorSettings?: unknown,
): Record<QuoteQuickFeature, boolean> {
  return {
    lead_webhook: hasQuoteQuickFeature(planTier, "lead_webhook", calculatorSettings),
    booking_deposits: hasQuoteQuickFeature(planTier, "booking_deposits", calculatorSettings),
    sms_followups: hasQuoteQuickFeature(planTier, "sms_followups", calculatorSettings),
  };
}

/** Human-readable upgrade sentence for an error body or a UI hint. */
export function upgradeMessageFor(feature: QuoteQuickFeature): string {
  const tier = QQ_FEATURE_MIN_TIER[feature];
  return `${QQ_FEATURE_LABELS[feature]} requires the QuoteQuick ${TIER_LABELS[tier] ?? tier} plan.`;
}

/**
 * Canonical rejection body for a blocked feature.
 *
 * Shape follows the ContentFlow tier-gate convention already asserted by
 * tests (`{ code: "tier_too_low", upgrade_required: true }`) rather than the
 * older ad-hoc `{ error: "pro_tier_required" }`, because it carries the
 * required tier as data instead of baking it into prose.
 */
export function featureGateErrorBody(feature: QuoteQuickFeature) {
  return {
    code: "tier_too_low" as const,
    upgrade_required: true as const,
    feature,
    required_tier: QQ_FEATURE_MIN_TIER[feature],
    error: upgradeMessageFor(feature),
  };
}

/** HTTP status used by every QuoteQuick feature gate. */
export const QQ_FEATURE_GATE_STATUS = 402;

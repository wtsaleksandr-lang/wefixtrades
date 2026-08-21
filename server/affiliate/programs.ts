/**
 * Affiliate + Referral program — PURE terms, tiers and helpers (no DB, no IO).
 *
 * Single source of truth for the numbers (kept out of the DB / render / route
 * layers so tests pin the terms and both programs read one definition). See
 * server/affiliate/{codes,attribution}.ts and server/routes/partnersRoutes.ts
 * for the DB-touching + HTTP layers.
 *
 * Ported from QuoteFleet src/server/affiliate/programs.ts (PR #352), adjusting
 * tenant→client. The one WFT addition is `evaluateReferralSignup` — the pure
 * signup-decision branch extracted so it is testable under WFT's tsx +
 * node:assert harness (WFT has no vitest / module-mock runtime, unlike QF).
 *
 * TWO PROGRAMS
 *   • REFERRAL (existing clients → peers, double-sided):
 *       - referrer earns 1 free month (account credit) per referred client that
 *         becomes paying;
 *       - referee gets a 30-day trial (vs the standard 14) + 20% off 3 months.
 *   • AFFILIATE (public marketers/creators, tiered recurring cash):
 *       - 25% recurring base → 30% recurring for 12 months once the affiliate
 *         has 10+ active referred customers → negotiated lifetime % for top
 *         partners;
 *       - 90-day cookie, monthly payouts, $50 minimum payout.
 */

// ── Referral (peer) program terms ──────────────────────────────────────────
/** Referee's extended trial length (days) — vs the standard 14 (TRIAL_DAYS). */
export const REFEREE_TRIAL_DAYS = 30;
/** Referee's intro discount (fraction) applied to the first N months. */
export const REFEREE_DISCOUNT_PCT = 0.2;
export const REFEREE_DISCOUNT_MONTHS = 3;
/** Free months the referrer earns per referred client that becomes paying. */
export const REFERRER_FREE_MONTHS = 1;

// ── Affiliate (public) program terms ───────────────────────────────────────
export const AFFILIATE_BASE_RATE = 0.25; // 25% recurring
export const AFFILIATE_PRO_RATE = 0.3; // 30% recurring
/** Active referred customers required to reach the 'pro' tier. */
export const AFFILIATE_PRO_THRESHOLD = 10;
/** How long the elevated 'pro' rate lasts once earned (months). */
export const AFFILIATE_PRO_DURATION_MONTHS = 12;
/** 'partner' is a hand-negotiated lifetime %; this is the published floor. */
export const AFFILIATE_PARTNER_RATE = 0.35;
/** Cookie attribution window — 90 days. */
export const REF_COOKIE_DAYS = 90;
export const REF_COOKIE_MAX_AGE_MS = REF_COOKIE_DAYS * 24 * 60 * 60 * 1000;
/** WFT referral/affiliate attribution cookie name (QF used `qf_ref`). */
export const REF_COOKIE_NAME = "wft_ref";
/** Monthly payout cadence + minimum balance (USD cents) to trigger a payout. */
export const AFFILIATE_MIN_PAYOUT_CENTS = 5000; // $50.00
export const AFFILIATE_PAYOUT_CADENCE = "monthly";

export type AffiliateTier = "base" | "pro" | "partner";
export type AttributionKind = "referral" | "affiliate" | "unknown";

/**
 * The tier an affiliate qualifies for from their active referred-customer count.
 * 'partner' is never auto-assigned here (it is granted manually to top
 * partners); this maps the self-serve ladder: <10 → base, ≥10 → pro.
 */
export function resolveTier(activeReferredCustomers: number): AffiliateTier {
  return activeReferredCustomers >= AFFILIATE_PRO_THRESHOLD ? "pro" : "base";
}

/** Published commission rate (fraction) for a tier. */
export function commissionRateForTier(tier: AffiliateTier): number {
  switch (tier) {
    case "partner":
      return AFFILIATE_PARTNER_RATE;
    case "pro":
      return AFFILIATE_PRO_RATE;
    case "base":
    default:
      return AFFILIATE_BASE_RATE;
  }
}

export interface TierProgress {
  tier: AffiliateTier;
  activeReferredCustomers: number;
  /** Customers still needed to reach the next tier; 0 when already there/top. */
  toNextTier: number;
  /** The tier that `toNextTier` unlocks; null at the top of the ladder. */
  nextTier: AffiliateTier | null;
  rate: number;
}

/**
 * Progress toward the next tier, from a live active-customer count.
 * Deterministic and pure so the dashboard + tests share one definition. A
 * 'partner' affiliate is already top-of-ladder (no next tier).
 */
export function tierProgress(
  activeReferredCustomers: number,
  currentTier?: AffiliateTier,
): TierProgress {
  const n = Math.max(0, Math.floor(activeReferredCustomers || 0));
  const tier = currentTier === "partner" ? "partner" : resolveTier(n);
  if (tier === "base") {
    return {
      tier,
      activeReferredCustomers: n,
      toNextTier: Math.max(0, AFFILIATE_PRO_THRESHOLD - n),
      nextTier: "pro",
      rate: commissionRateForTier("base"),
    };
  }
  // pro or partner — top of the self-serve ladder.
  return {
    tier,
    activeReferredCustomers: n,
    toNextTier: 0,
    nextTier: tier === "pro" ? "partner" : null,
    rate: commissionRateForTier(tier),
  };
}

/**
 * Estimated MONTHLY commission (cents) from active referred customers, at the
 * affiliate's rate. Phase-1 estimate only — the phase-2 billing job writes the
 * authoritative affiliate_commissions rows from real invoice amounts.
 */
export function estimateMonthlyCommissionCents(
  activeReferredCustomers: number,
  avgMonthlyRevenueCents: number,
  rate: number,
): number {
  const n = Math.max(0, Math.floor(activeReferredCustomers || 0));
  return Math.round(n * Math.max(0, avgMonthlyRevenueCents) * rate);
}

// ── Code format ─────────────────────────────────────────────────────────────
/** Unambiguous alphabet for shareable codes (no O/0/I/1/L to avoid mis-typing). */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;
const CODE_RE = /^[A-Z0-9]{4,16}$/;

/** Normalize a user-supplied code from a `?ref=` param (uppercase, trimmed). */
export function normalizeCode(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);
}

/** True when a code is structurally valid (does NOT check DB existence). */
export function isValidCodeShape(code: string): boolean {
  return CODE_RE.test(code);
}

/**
 * Generate one candidate code. Pure given the injected randomness source (so a
 * uniqueness test can force a collision then a hit). Defaults to Math.random.
 */
export function generateCode(rand: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  }
  return out;
}

// ── Signup-decision logic (pure) ────────────────────────────────────────────
/**
 * The resolved owner of a clicked code, as returned by codes.resolveCodeOwner.
 * Defined here (pure, no DB import) so both codes.ts and the pure signup-branch
 * logic below share one shape without a circular import through db.
 */
export type ResolvedCodeOwner =
  | { kind: "referral"; clientId: number; ownerUserId: number | null; ownerEmail: string | null }
  | { kind: "affiliate"; affiliateId: number; ownerClientId: number | null; ownerEmail: string | null };

export interface ReferralOutcome {
  /** True when the signup is the code owner referring themselves — ignore it. */
  self: boolean;
  kind: "referral" | "affiliate";
  /** Peer referral: the extended trial the referee earns (days). */
  refereeTrialDays?: number;
  refereeDiscountPct?: number;
  refereeDiscountMonths?: number;
  /** Peer referral: queue a free-month credit for this referrer client. */
  queueCreditForClientId?: number;
  referrerFreeMonths?: number;
  /** Affiliate: the affiliate credited with this signup. */
  affiliateId?: number;
}

/**
 * PURE decision for what a signup through `owner`'s code should do. No DB, no
 * cookie — just the branch logic (self-referral detection + which reward
 * applies). attribution.linkReferralOnSignup does the IO around this, and the
 * co-located test pins every branch here without infrastructure.
 *
 * Self-referral is detected by email match (case-insensitive) OR by the owner's
 * own client id equalling the freshly-created client id.
 */
export function evaluateReferralSignup(
  owner: ResolvedCodeOwner,
  signupEmail: string,
  newClientId: number,
): ReferralOutcome {
  const email = String(signupEmail ?? "").trim().toLowerCase();
  const ownerEmail = (owner.ownerEmail ?? "").trim().toLowerCase();
  const selfByEmail = !!ownerEmail && ownerEmail === email;
  const selfByClient =
    (owner.kind === "referral" && owner.clientId === newClientId) ||
    (owner.kind === "affiliate" && owner.ownerClientId === newClientId);
  const self = selfByEmail || selfByClient;

  if (owner.kind === "referral") {
    return {
      self,
      kind: "referral",
      refereeTrialDays: REFEREE_TRIAL_DAYS,
      refereeDiscountPct: REFEREE_DISCOUNT_PCT,
      refereeDiscountMonths: REFEREE_DISCOUNT_MONTHS,
      queueCreditForClientId: owner.clientId,
      referrerFreeMonths: REFERRER_FREE_MONTHS,
    };
  }
  // Affiliate code — cash commission accrues in phase 2; nothing more here.
  return { self, kind: "affiliate", affiliateId: owner.affiliateId };
}

/**
 * Affiliate ADMIN-update logic (Phase 1) — PURE validation + diff, no DB/IO.
 *
 * The operator surface (server/routes/adminAffiliatesRoutes.ts) lets an admin
 * move a self-registered affiliate through its lifecycle (pending → active →
 * suspended), set its commission tier, and override the commission rate. This
 * module owns the ONE Zod shape + the before→after diff so the route stays thin
 * and the co-located test pins every branch with no infrastructure (mirrors the
 * pure `evaluateReferralSignup` / `buildAffiliateDashboard` split in this dir).
 *
 * The enums are the authoritative statuses/tiers from the affiliates schema
 * comments (shared/schemas/affiliate.ts): status 'pending'|'active'|'suspended',
 * tier 'base'|'pro'|'partner'. commission_rate is a fraction in [0,1].
 */
import { z } from "zod";

/** Lifecycle states an affiliate can be moved between (schema default 'pending'). */
export const AFFILIATE_STATUSES = ["pending", "active", "suspended"] as const;
/** Commission tiers (see programs.ts for the published rate each maps to). */
export const AFFILIATE_TIERS = ["base", "pro", "partner"] as const;

export type AffiliateStatus = (typeof AFFILIATE_STATUSES)[number];
export type AffiliateTierName = (typeof AFFILIATE_TIERS)[number];

/**
 * PATCH body: any subset of status / tier / commission_rate, but at least one.
 * commission_rate is a plain number (NOT coerced) so a non-numeric value is a
 * hard 400 rather than a silent NaN that would corrupt the rate. Bounded to a
 * [0,1] fraction (0.25 = 25%).
 */
export const affiliateAdminUpdateSchema = z
  .object({
    status: z.enum(AFFILIATE_STATUSES).optional(),
    tier: z.enum(AFFILIATE_TIERS).optional(),
    commission_rate: z
      .number({ invalid_type_error: "commission_rate must be a number" })
      .min(0, "commission_rate must be >= 0")
      .max(1, "commission_rate must be <= 1")
      .optional(),
  })
  .refine(
    (v) => v.status !== undefined || v.tier !== undefined || v.commission_rate !== undefined,
    { message: "Provide at least one of status, tier, commission_rate" },
  );

export type AffiliateAdminUpdate = z.infer<typeof affiliateAdminUpdateSchema>;

/** The mutable fields the admin can change, snapshotted for the audit diff. */
export interface AffiliateSnapshot {
  status: string;
  tier: string;
  commission_rate: number;
}

export interface AffiliateUpdateResult {
  /** Fields to write (only the ones that actually change). Empty = no-op. */
  set: Partial<AffiliateSnapshot>;
  /** Audit "before" projection — only the changed fields. */
  before: Partial<AffiliateSnapshot>;
  /** Audit "after" projection — only the changed fields. */
  after: Partial<AffiliateSnapshot>;
  /** Names of the fields that changed (drives the audit summary + no-op skip). */
  changed: Array<keyof AffiliateSnapshot>;
}

/**
 * PURE diff: given the current row + a validated patch, produce the minimal set
 * of columns to write plus the before/after projection for the audit row. A
 * field present in the patch but equal to the current value is treated as a
 * no-op (not written, not audited), so re-submitting an unchanged row is inert.
 */
export function computeAffiliateUpdate(
  before: AffiliateSnapshot,
  patch: AffiliateAdminUpdate,
): AffiliateUpdateResult {
  const set: Partial<AffiliateSnapshot> = {};
  const beforeDiff: Partial<AffiliateSnapshot> = {};
  const afterDiff: Partial<AffiliateSnapshot> = {};
  const changed: Array<keyof AffiliateSnapshot> = [];

  const keys: Array<keyof AffiliateSnapshot> = ["status", "tier", "commission_rate"];
  for (const key of keys) {
    const next = patch[key];
    if (next !== undefined && next !== before[key]) {
      (set as Record<string, unknown>)[key] = next;
      (beforeDiff as Record<string, unknown>)[key] = before[key];
      (afterDiff as Record<string, unknown>)[key] = next;
      changed.push(key);
    }
  }
  return { set, before: beforeDiff, after: afterDiff, changed };
}

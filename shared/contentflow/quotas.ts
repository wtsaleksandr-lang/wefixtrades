/**
 * ContentFlow Phase 4 — typed monthly quota schema.
 *
 * Single source of truth for per-tier asset volume + the
 * isWithinQuota() helper used by the runtime gate. Mirrors the feature
 * lists in shared/pricing.ts CONTENTFLOW.tiers. If the public pricing
 * page changes, this table changes with it.
 *
 * Storage shape (on clients.metadata.content_brand.quota_usage):
 *   {
 *     images_used:    number,
 *     articles_used:  number,
 *     videos_used:    number,
 *     period_start:   "YYYY-MM-01"   // UTC month boundary
 *   }
 *
 * No DB migration — counters live alongside the existing brand profile.
 */

export interface QuotaLimit {
  images: number;
  articles: number;
  videos: number;
  channels: number;
}

export interface QuotaUsage {
  images_used: number;
  articles_used: number;
  videos_used: number;
}

export type ContentflowAssetType = "image" | "article" | "video";

export const QUOTAS_BY_TIER: Record<string, QuotaLimit> = {
  "contentflow-free":    { images: 5,   articles: 3,   videos: 0,  channels: 1 },
  "contentflow-starter": { images: 10,  articles: 5,   videos: 1,  channels: 1 },
  "contentflow-creator": { images: 40,  articles: 20,  videos: 5,  channels: 3 },
  "contentflow-studio":  { images: 150, articles: 60,  videos: 15, channels: 5 },
  "contentflow-agency":  { images: 500, articles: 200, videos: 50, channels: 999 },
};

/** Default for non-subscribers / unknown tier IDs — treat as Free. */
const DEFAULT_LIMIT: QuotaLimit = QUOTAS_BY_TIER["contentflow-free"]!;

/** Resolve a per-tier limit table. Unknown IDs fall back to the Free tier. */
export function getQuotaForTier(tierId: string): QuotaLimit {
  return QUOTAS_BY_TIER[tierId] ?? DEFAULT_LIMIT;
}

/** Empty-state usage record (start of a new period). */
export function emptyUsage(): QuotaUsage {
  return { images_used: 0, articles_used: 0, videos_used: 0 };
}

export interface QuotaCheck {
  allowed: boolean;
  reason?: string;
  /** ISO timestamp at which the counter resets — start of next UTC month. */
  nextResetAt?: string;
}

/** Start-of-next-UTC-month, given a reference time. */
export function nextMonthlyResetAt(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  // Month is 0-indexed → next month is m + 1; Date handles overflow into Jan.
  return new Date(Date.UTC(y, m + 1, 1, 0, 5, 0)).toISOString();
}

/**
 * Check whether one more asset of `requestedType` is within the tier's
 * monthly limit. Returns a structured decision so the caller can surface
 * the reason + next-reset to the customer UI.
 */
export function isWithinQuota(
  used: QuotaUsage,
  limit: QuotaLimit,
  requestedType: ContentflowAssetType,
): QuotaCheck {
  const nextResetAt = nextMonthlyResetAt();
  switch (requestedType) {
    case "image":
      if (used.images_used >= limit.images) {
        return {
          allowed: false,
          reason: `Monthly image quota reached (${limit.images}). Resets on the 1st of next month.`,
          nextResetAt,
        };
      }
      return { allowed: true, nextResetAt };
    case "article":
      if (used.articles_used >= limit.articles) {
        return {
          allowed: false,
          reason: `Monthly article quota reached (${limit.articles}). Resets on the 1st of next month.`,
          nextResetAt,
        };
      }
      return { allowed: true, nextResetAt };
    case "video":
      if (limit.videos === 0) {
        return {
          allowed: false,
          reason: "Video generation isn't included on your current tier. Upgrade to unlock.",
          nextResetAt,
        };
      }
      if (used.videos_used >= limit.videos) {
        return {
          allowed: false,
          reason: `Monthly video quota reached (${limit.videos}). Resets on the 1st of next month.`,
          nextResetAt,
        };
      }
      return { allowed: true, nextResetAt };
    default:
      return { allowed: false, reason: `Unknown asset type: ${String(requestedType)}` };
  }
}

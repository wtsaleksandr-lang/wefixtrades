/**
 * ReputationShield configuration — single source of truth for
 * tier features, client settings defaults, and feature gating.
 */

/* ─── Tier Feature Definitions ─── */

export type ReputationTier = "basic" | "pro" | "premium";

export interface TierFeatures {
  reviewRequests: boolean;
  reminders: boolean;
  monitoring: boolean;
  alerts: boolean;
  aiDrafts: boolean;
  reviewWidget: boolean;
  competitorTracking: boolean;
}

export const TIER_FEATURES: Record<ReputationTier, TierFeatures> = {
  basic: {
    reviewRequests: true,
    reminders: true,
    monitoring: true,
    alerts: true,
    aiDrafts: false,
    reviewWidget: false,
    competitorTracking: false,
  },
  pro: {
    reviewRequests: true,
    reminders: true,
    monitoring: true,
    alerts: true,
    aiDrafts: true,
    reviewWidget: true,
    competitorTracking: false,
  },
  premium: {
    reviewRequests: true,
    reminders: true,
    monitoring: true,
    alerts: true,
    aiDrafts: true,
    reviewWidget: true,
    competitorTracking: true,
  },
};

/** Feature → minimum tier required. */
export const FEATURE_MIN_TIER: Record<keyof TierFeatures, ReputationTier> = {
  reviewRequests: "basic",
  reminders: "basic",
  monitoring: "basic",
  alerts: "basic",
  aiDrafts: "pro",
  reviewWidget: "pro",
  competitorTracking: "premium",
};

/** Human-readable feature names for upgrade prompts. */
export const FEATURE_LABELS: Record<keyof TierFeatures, string> = {
  reviewRequests: "Automated Review Requests",
  reminders: "Follow-up Reminders",
  monitoring: "Review Monitoring",
  alerts: "New Review Alerts",
  aiDrafts: "AI Response Drafts",
  reviewWidget: "Review Widget",
  competitorTracking: "Competitor Tracking",
};

/** Human-readable tier names. */
export const TIER_LABELS: Record<ReputationTier, string> = {
  basic: "Basic",
  pro: "Pro",
  premium: "Premium",
};

const TIER_ORDER: Record<ReputationTier, number> = { basic: 0, pro: 1, premium: 2 };

export function canAccessFeature(
  tier: ReputationTier | null | undefined,
  feature: keyof TierFeatures,
): boolean {
  if (!tier) return false;
  const required = TIER_ORDER[FEATURE_MIN_TIER[feature]] ?? 0;
  const current = TIER_ORDER[tier] ?? 0;
  return current >= required;
}

/** Extract tier from a service_id like "reputationshield-pro". */
export function extractTier(serviceId: string | null | undefined): ReputationTier | null {
  if (!serviceId) return null;
  const match = serviceId.match(/^reputationshield-(basic|pro|premium)$/);
  return match ? (match[1] as ReputationTier) : null;
}

/* ─── Per-Client Settings ─── */

export interface ReputationSettings {
  channel_preference: "email" | "sms" | "auto";
  reminders_enabled: boolean;
  review_request_delay_hours: number;
  low_rating_alerts: boolean;
}

export const DEFAULT_SETTINGS: ReputationSettings = {
  channel_preference: "email",
  reminders_enabled: true,
  review_request_delay_hours: 2,
  low_rating_alerts: true,
};

/** Merge partial settings with defaults, rejecting invalid values. */
export function mergeSettings(
  partial: Partial<ReputationSettings> | null | undefined,
): ReputationSettings {
  const base = { ...DEFAULT_SETTINGS };
  if (!partial) return base;

  if (partial.channel_preference && ["email", "sms", "auto"].includes(partial.channel_preference)) {
    base.channel_preference = partial.channel_preference;
  }
  if (typeof partial.reminders_enabled === "boolean") {
    base.reminders_enabled = partial.reminders_enabled;
  }
  if (typeof partial.review_request_delay_hours === "number" && partial.review_request_delay_hours >= 0 && partial.review_request_delay_hours <= 72) {
    base.review_request_delay_hours = partial.review_request_delay_hours;
  }
  if (typeof partial.low_rating_alerts === "boolean") {
    base.low_rating_alerts = partial.low_rating_alerts;
  }

  return base;
}

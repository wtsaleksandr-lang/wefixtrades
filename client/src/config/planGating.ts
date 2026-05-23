/**
 * Currently unused — preserved for future abstract-plan-tier work.
 * Tier gating today happens in tradelineTierGate.ts (per-feature, per-product).
 * If this file is still unwired in 6 months, delete it.
 */

/* ─── Plan gating — single source of truth ─── */
import { colors, mkt } from '@/theme/tokens';

export const PLAN_ORDER = { free: 0, starter: 1, pro: 2, elite: 3 } as const;
export type PlanTier = keyof typeof PLAN_ORDER;

export const PLAN_LABELS: Record<PlanTier, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  elite: "Elite",
};

export const PLAN_MONTHLY_PRICES: Record<PlanTier, string> = {
  free: "$0",
  starter: "$99",
  pro: "$199",
  elite: "$299",
};

export const PLAN_BADGE_STYLES: Record<PlanTier, { bg: string; color: string; border: string }> = {
  free:    { bg: colors.platform.surfaceRaised, color: colors.widget.muted, border: colors.widget.border },
  starter: { bg: "#EAF1FF", color: "#0d3cfc", border: "#D4E2FF" },
  pro:     { bg: colors.platform.accentLighter, color: colors.platform.accent, border: "#A7F3D0" },
  elite:   { bg: colors.status.warningLight, color: mkt.warning, border: "#FDE68A" },
};

export type Feature =
  | "remove_branding"
  | "csv_export"
  | "email_followups"
  | "booking_deposits"
  | "sms_whatsapp"
  | "custom_domain"
  | "ai_employee_full"
  | "api_webhooks"
  | "white_label";

export const FEATURE_REQUIRES: Record<Feature, PlanTier> = {
  remove_branding:  "starter",
  csv_export:       "starter",
  email_followups:  "starter",
  booking_deposits: "pro",
  sms_whatsapp:     "pro",
  custom_domain:    "pro",
  ai_employee_full: "pro",
  api_webhooks:     "elite",
  white_label:      "elite",
};

export const FEATURE_LABELS: Record<Feature, string> = {
  remove_branding:  "Remove QuoteQuick branding",
  csv_export:       "CSV lead export",
  email_followups:  "Automated email follow-ups",
  booking_deposits: "Booking + Stripe deposits",
  sms_whatsapp:     "SMS & WhatsApp messaging",
  custom_domain:    "Custom domain",
  ai_employee_full: "AI Employee (full access)",
  api_webhooks:     "API & Webhooks",
  white_label:      "White-label & agency",
};

export function canAccess(currentPlan: string, feature: Feature): boolean {
  const required = PLAN_ORDER[FEATURE_REQUIRES[feature]] ?? 0;
  const current = PLAN_ORDER[currentPlan as PlanTier] ?? 0;
  return current >= required;
}

export function requiredPlanLabel(feature: Feature): string {
  return PLAN_LABELS[FEATURE_REQUIRES[feature]];
}

export function nextPlan(current: string): PlanTier | null {
  const tier = current as PlanTier;
  const order = PLAN_ORDER[tier] ?? 0;
  const next = Object.entries(PLAN_ORDER).find(([, v]) => v === order + 1);
  return next ? (next[0] as PlanTier) : null;
}

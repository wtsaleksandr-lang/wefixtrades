/**
 * Per-client notification preferences.
 *
 * Stored as a JSON object inside `clients.metadata.notification_preferences`
 * (no schema migration required — `metadata` is already a flexible
 * jsonb column). Workers and notification dispatch code should read
 * via `parseNotificationPreferences(client.metadata)`, which fills in
 * defaults so callers never have to handle missing fields.
 *
 * Defaults are tuned for early-stage SaaS:
 *   - email + SMS channels both ON
 *   - transactional categories (billing, service updates, leads) ON
 *   - non-transactional categories (digest, marketing) OFF — CAN-SPAM
 *     and CASL friendly until the user opts in.
 */

import { z } from "zod";

export const NOTIFICATION_CATEGORY_KEYS = [
  "billing",
  "service_updates",
  "leads",
  "weekly_digest",
  "marketing",
] as const;
export type NotificationCategoryKey = (typeof NOTIFICATION_CATEGORY_KEYS)[number];

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategoryKey, { label: string; description: string }> = {
  billing: {
    label: "Billing",
    description: "Receipts, failed payments, refunds, plan changes.",
  },
  service_updates: {
    label: "Service updates",
    description: "Task progress, new deliverables, status changes for your services.",
  },
  leads: {
    label: "Lead notifications",
    description: "New leads from QuoteQuick, TradeLine, MapGuard, and your booking widget.",
  },
  weekly_digest: {
    label: "Weekly digest",
    description: "Friday recap with calls, leads, reviews, and rankings from the week.",
  },
  marketing: {
    label: "Product updates",
    description: "Occasional updates about new features and trades-business tips. No spam.",
  },
};

export const notificationPreferencesSchema = z.object({
  channels: z.object({
    email: z.boolean(),
    sms: z.boolean(),
  }),
  categories: z.object({
    billing: z.boolean(),
    service_updates: z.boolean(),
    leads: z.boolean(),
    weekly_digest: z.boolean(),
    marketing: z.boolean(),
  }),
});

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  channels: { email: true, sms: true },
  categories: {
    billing: true,
    service_updates: true,
    leads: true,
    weekly_digest: false,
    marketing: false,
  },
};

/**
 * Parse a `clients.metadata` blob into a fully-populated preferences
 * object. Always returns valid prefs — missing keys fall back to
 * DEFAULTS, malformed values fall back to DEFAULTS, and unrecognised
 * keys are dropped.
 */
export function parseNotificationPreferences(metadata: unknown): NotificationPreferences {
  const md = (metadata ?? {}) as Record<string, unknown>;
  const raw = md.notification_preferences;
  const parsed = notificationPreferencesSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return DEFAULT_NOTIFICATION_PREFERENCES;
}

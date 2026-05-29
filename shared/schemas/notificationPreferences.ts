/**
 * Per-client notification preferences.
 *
 * Stored as a JSON object inside `clients.metadata.notification_preferences`
 * (no schema migration required — `metadata` is already a flexible
 * jsonb column). Workers and notification dispatch code should read
 * via `parseNotificationPreferences(client.metadata)`, which fills in
 * defaults so callers never have to handle missing fields.
 *
 * Wave P expands this into a per-category × per-channel matrix:
 *   - channels: email · sms · concierge (AI assistant in-portal ping)
 *   - 11 categories spanning billing, leads, reviews, content, calls,
 *     messages, bookings, ranking reports, service updates, digest, and
 *     product updates.
 *
 * Defaults are tuned for early-stage SaaS:
 *   - email + SMS channels ON, concierge OFF (opt-in)
 *   - transactional-ish categories (billing, leads, new_review,
 *     content_ready, missed_call, new_message, booking, ranking_report,
 *     service_updates) ON
 *   - non-transactional categories (weekly_digest, marketing) OFF —
 *     CAN-SPAM and CASL friendly until the user opts in.
 *
 * MIGRATION SAFETY: `parseNotificationPreferences` deep-merges the stored
 * object over DEFAULTS key-by-key. Existing customers who saved prefs with
 * only the old 5 categories + {email,sms} keep every value they chose;
 * the 6 new categories + the concierge channel fill from DEFAULTS. No
 * existing customer is silently reset.
 */

import { z } from "zod";

export const NOTIFICATION_CATEGORY_KEYS = [
  "billing",
  "leads",
  "new_review",
  "content_ready",
  "missed_call",
  "new_message",
  "booking",
  "ranking_report",
  "service_updates",
  "weekly_digest",
  "marketing",
] as const;
export type NotificationCategoryKey = (typeof NOTIFICATION_CATEGORY_KEYS)[number];

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategoryKey, { label: string; description: string }> = {
  billing: {
    label: "Billing",
    description: "Receipts, failed payments, refunds, plan changes.",
  },
  leads: {
    label: "Lead notifications",
    description: "New leads from QuoteQuick, TradeLine, MapGuard, and your booking widget.",
  },
  new_review: {
    label: "New reviews",
    description: "When a customer leaves you a new Google or Facebook review.",
  },
  content_ready: {
    label: "Content ready to approve",
    description: "Articles, social posts, and ad creative waiting for your sign-off.",
  },
  missed_call: {
    label: "Missed & answered calls",
    description: "TradeLine call summaries — who called, what they wanted, and the recording.",
  },
  new_message: {
    label: "New messages",
    description: "When a customer sends a new message through your chat widget or inbox.",
  },
  booking: {
    label: "Bookings",
    description: "New and changed appointments from your booking widget.",
  },
  ranking_report: {
    label: "Ranking reports",
    description: "RankFlow updates on where your business shows up in local search.",
  },
  service_updates: {
    label: "Service updates",
    description: "Task progress, new deliverables, status changes for your services.",
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
    concierge: z.boolean(),
  }),
  categories: z.object({
    billing: z.boolean(),
    leads: z.boolean(),
    new_review: z.boolean(),
    content_ready: z.boolean(),
    missed_call: z.boolean(),
    new_message: z.boolean(),
    booking: z.boolean(),
    ranking_report: z.boolean(),
    service_updates: z.boolean(),
    weekly_digest: z.boolean(),
    marketing: z.boolean(),
  }),
});

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  channels: { email: true, sms: true, concierge: false },
  categories: {
    billing: true,
    leads: true,
    new_review: true,
    content_ready: true,
    missed_call: true,
    new_message: true,
    booking: true,
    ranking_report: true,
    service_updates: true,
    weekly_digest: false,
    marketing: false,
  },
};

/**
 * Parse a `clients.metadata` blob into a fully-populated preferences
 * object. Always returns valid prefs.
 *
 * MIGRATION-SAFE deep merge: rather than `safeParse`-or-reset (which would
 * wipe every existing customer whose stored blob lacks the Wave-P keys),
 * we merge the stored object over DEFAULTS key-by-key. For each channel
 * and each category we keep the saved boolean when it is a valid boolean,
 * otherwise we fall back to the default. Unknown keys are dropped (we only
 * ever read the canonical key lists below).
 */
export function parseNotificationPreferences(metadata: unknown): NotificationPreferences {
  const md = (metadata ?? {}) as Record<string, unknown>;
  const raw = (md.notification_preferences ?? {}) as Record<string, unknown>;

  const rawChannels = (raw.channels ?? {}) as Record<string, unknown>;
  const rawCategories = (raw.categories ?? {}) as Record<string, unknown>;

  const pick = (source: Record<string, unknown>, key: string, fallback: boolean): boolean =>
    typeof source[key] === "boolean" ? (source[key] as boolean) : fallback;

  const channels = {
    email: pick(rawChannels, "email", DEFAULT_NOTIFICATION_PREFERENCES.channels.email),
    sms: pick(rawChannels, "sms", DEFAULT_NOTIFICATION_PREFERENCES.channels.sms),
    concierge: pick(rawChannels, "concierge", DEFAULT_NOTIFICATION_PREFERENCES.channels.concierge),
  };

  const categories = {} as NotificationPreferences["categories"];
  for (const key of NOTIFICATION_CATEGORY_KEYS) {
    categories[key] = pick(rawCategories, key, DEFAULT_NOTIFICATION_PREFERENCES.categories[key]);
  }

  return { channels, categories };
}

/**
 * Per-client notification preferences.
 *
 * Stored as a JSON object inside `clients.metadata.notification_preferences`
 * (no schema migration required — `metadata` is already a flexible
 * jsonb column). Workers and notification dispatch code should read
 * via `parseNotificationPreferences(client.metadata)`, which fills in
 * defaults so callers never have to handle missing fields.
 *
 * Wave P (per-cell) makes this a TRUE per-category × per-channel matrix:
 * every category carries its own { email, sms, concierge } booleans, so
 * "new reviews via AI assistant but NOT email" is expressible. There is no
 * separate top-level `channels` mask any more — the per-cell booleans ARE
 * the channels.
 *   - channels: email · sms · concierge (AI assistant in-portal ping)
 *   - 11 categories spanning billing, leads, reviews, content, calls,
 *     messages, bookings, ranking reports, service updates, digest, and
 *     product updates.
 *
 * Defaults are tuned for early-stage SaaS (applied per cell):
 *   - email + sms ON for all categories EXCEPT weekly_digest + marketing
 *     (those OFF — CAN-SPAM / CASL friendly until the user opts in).
 *   - concierge OFF for every category (opt-in).
 *
 * MIGRATION SAFETY: `parseNotificationPreferences` handles BOTH the old
 * shape ({ channels:{email,sms}, categories:{k:bool} }) and the new per-cell
 * shape, always returning a fully-populated per-cell object. Old data is
 * mapped forward (a category's email cell = oldChannels.email && oldCat[k]),
 * new data keeps every saved cell, and any missing cell/category fills from
 * DEFAULTS. No existing customer is silently reset.
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

export const NOTIFICATION_CHANNEL_KEYS = ["email", "sms", "concierge"] as const;
export type NotificationChannelKey = (typeof NOTIFICATION_CHANNEL_KEYS)[number];

/** A single category's per-channel switches. */
const categoryChannelsSchema = z.object({
  email: z.boolean(),
  sms: z.boolean(),
  concierge: z.boolean(),
});

export type CategoryChannelPrefs = z.infer<typeof categoryChannelsSchema>;

export const notificationPreferencesSchema = z.object({
  categories: z.object({
    billing: categoryChannelsSchema,
    leads: categoryChannelsSchema,
    new_review: categoryChannelsSchema,
    content_ready: categoryChannelsSchema,
    missed_call: categoryChannelsSchema,
    new_message: categoryChannelsSchema,
    booking: categoryChannelsSchema,
    ranking_report: categoryChannelsSchema,
    service_updates: categoryChannelsSchema,
    weekly_digest: categoryChannelsSchema,
    marketing: categoryChannelsSchema,
  }),
});

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

/**
 * Per-cell defaults: email + sms ON for every category EXCEPT weekly_digest
 * and marketing (those OFF). concierge OFF for all (opt-in).
 */
const cell = (email: boolean, sms: boolean, concierge: boolean): CategoryChannelPrefs => ({
  email,
  sms,
  concierge,
});

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  categories: {
    billing: cell(true, true, false),
    leads: cell(true, true, false),
    new_review: cell(true, true, false),
    content_ready: cell(true, true, false),
    missed_call: cell(true, true, false),
    new_message: cell(true, true, false),
    booking: cell(true, true, false),
    ranking_report: cell(true, true, false),
    service_updates: cell(true, true, false),
    weekly_digest: cell(false, false, false),
    marketing: cell(false, false, false),
  },
};

/**
 * Parse a `clients.metadata` blob into a fully-populated per-cell
 * preferences object. Always returns valid prefs — never rejects/resets.
 *
 * Handles BOTH stored shapes:
 *
 *   OLD: { channels: { email, sms, concierge? }, categories: { k: boolean } }
 *     The old model stored one boolean per category plus a global channel
 *     mask. We map it forward per category k:
 *       email     = (oldChannels.email !== false) && (oldCategories[k] === true)
 *       sms       = (oldChannels.sms   !== false) && (oldCategories[k] === true)
 *       concierge = false
 *     A category absent from the old blob falls back to per-cell DEFAULTS.
 *     (The `!== false` keeps an undefined old channel mask treated as ON,
 *     matching the old fail-toward-default behaviour; an explicit false
 *     mutes that channel for every category, exactly as before.)
 *
 *   NEW (per-cell): { categories: { k: { email, sms, concierge } } }
 *     Each saved cell boolean is kept; any missing cell or category fills
 *     from DEFAULTS.
 *
 * Shape detection: a blob is treated as NEW when its first present category
 * value is an object (per-cell), and OLD when it is a boolean. An empty /
 * missing blob yields pure DEFAULTS.
 */
export function parseNotificationPreferences(metadata: unknown): NotificationPreferences {
  const md = (metadata ?? {}) as Record<string, unknown>;
  const raw = (md.notification_preferences ?? {}) as Record<string, unknown>;

  const rawCategories = (raw.categories ?? {}) as Record<string, unknown>;
  const rawChannels = (raw.channels ?? {}) as Record<string, unknown>;

  const asBool = (v: unknown, fallback: boolean): boolean =>
    typeof v === "boolean" ? v : fallback;

  // Detect old shape: any category value that is a plain boolean.
  const isOldShape = NOTIFICATION_CATEGORY_KEYS.some(
    (k) => typeof rawCategories[k] === "boolean",
  );

  const categories = {} as NotificationPreferences["categories"];

  if (isOldShape) {
    // Old global channel mask: undefined → treated as ON (!== false).
    const oldEmailOn = rawChannels.email !== false;
    const oldSmsOn = rawChannels.sms !== false;

    for (const key of NOTIFICATION_CATEGORY_KEYS) {
      const stored = rawCategories[key];
      if (typeof stored === "boolean") {
        categories[key] = {
          email: oldEmailOn && stored === true,
          sms: oldSmsOn && stored === true,
          concierge: false,
        };
      } else {
        // Category absent from old blob → per-cell defaults.
        categories[key] = { ...DEFAULT_NOTIFICATION_PREFERENCES.categories[key] };
      }
    }
  } else {
    // New per-cell shape (or empty): keep each saved cell, default the rest.
    for (const key of NOTIFICATION_CATEGORY_KEYS) {
      const def = DEFAULT_NOTIFICATION_PREFERENCES.categories[key];
      const storedCell = (rawCategories[key] ?? {}) as Record<string, unknown>;
      categories[key] = {
        email: asBool(storedCell.email, def.email),
        sms: asBool(storedCell.sms, def.sms),
        concierge: asBool(storedCell.concierge, def.concierge),
      };
    }
  }

  return { categories };
}

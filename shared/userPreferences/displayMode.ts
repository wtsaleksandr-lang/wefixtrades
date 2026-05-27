/**
 * Wave 36 — Tesla Simplification.
 *
 * Display Mode preferences. Controls whether the customer portal renders
 * the slim Simple view (essential KPIs + pipeline + action stack) or
 * unlocks the per-product advanced sections.
 *
 * Storage
 * ───────
 *   • Per-client JSONB blob at `clients.metadata.display_preferences`.
 *   • Matches the per-product `*_notifications` precedent (Wave 32).
 *
 * Defaults
 * ────────
 *   • mode: "simple"
 *   • all per-product advanced toggles: false
 *   • admin-only verbose toggles: false
 *
 * The `<AdvancedOnly>` client component reads these via
 * `useDisplayPreferences()` and renders children only when both the
 * global mode is "advanced" AND the product-specific toggle is true.
 */

import { z } from "zod";

export type DisplayMode = "simple" | "advanced";

export const DISPLAY_MODES: DisplayMode[] = ["simple", "advanced"];

/** Product keys for per-product advanced toggles. Matches NOTIFICATION_PRODUCTS plus internal "portal" for the home dashboard. */
export const ADVANCED_PRODUCT_KEYS = [
  "portal",
  "contentflow",
  "rankflow",
  "socialsync",
  "tradeline",
  "mapguard",
  "reputationshield",
  "quotequick",
  "adflow",
  "webcare",
] as const;
export type AdvancedProductKey = (typeof ADVANCED_PRODUCT_KEYS)[number];

export type DisplayPreferences = {
  mode: DisplayMode;
  portal_show_advanced: boolean;
  contentflow_show_advanced: boolean;
  rankflow_show_advanced: boolean;
  socialsync_show_advanced: boolean;
  tradeline_show_advanced: boolean;
  mapguard_show_advanced: boolean;
  reputationshield_show_advanced: boolean;
  quotequick_show_advanced: boolean;
  adflow_show_advanced: boolean;
  webcare_show_advanced: boolean;
  /** Admin-only: surface raw IDs / timestamps to the second / engineering labels in admin tables. */
  admin_show_debug: boolean;
  /** Admin-only: surface raw external IDs (e.g. GBP IDs, Stripe IDs) on customer-facing surfaces during impersonation. */
  admin_show_raw_ids: boolean;
};

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  mode: "simple",
  portal_show_advanced: false,
  contentflow_show_advanced: false,
  rankflow_show_advanced: false,
  socialsync_show_advanced: false,
  tradeline_show_advanced: false,
  mapguard_show_advanced: false,
  reputationshield_show_advanced: false,
  quotequick_show_advanced: false,
  adflow_show_advanced: false,
  webcare_show_advanced: false,
  admin_show_debug: false,
  admin_show_raw_ids: false,
};

export const displayPreferencesSchema = z.object({
  mode: z.enum(["simple", "advanced"]),
  portal_show_advanced: z.boolean(),
  contentflow_show_advanced: z.boolean(),
  rankflow_show_advanced: z.boolean(),
  socialsync_show_advanced: z.boolean(),
  tradeline_show_advanced: z.boolean(),
  mapguard_show_advanced: z.boolean(),
  reputationshield_show_advanced: z.boolean(),
  quotequick_show_advanced: z.boolean(),
  adflow_show_advanced: z.boolean(),
  webcare_show_advanced: z.boolean(),
  admin_show_debug: z.boolean(),
  admin_show_raw_ids: z.boolean(),
});

/** PATCH body schema — every field optional. */
export const displayPreferencesPatchSchema = displayPreferencesSchema.partial();

export type DisplayPreferencesPatch = z.infer<typeof displayPreferencesPatchSchema>;

/**
 * Tolerant parser: accept whatever shape lives in `clients.metadata.display_preferences`,
 * merge over DEFAULT_DISPLAY_PREFERENCES, drop unknown keys. Never throws —
 * a malformed blob should never crash the dashboard render.
 */
export function parseDisplayPreferences(raw: unknown): DisplayPreferences {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_DISPLAY_PREFERENCES };
  const r = raw as Record<string, unknown>;
  const out: DisplayPreferences = { ...DEFAULT_DISPLAY_PREFERENCES };
  if (r.mode === "simple" || r.mode === "advanced") out.mode = r.mode;
  for (const key of Object.keys(DEFAULT_DISPLAY_PREFERENCES) as (keyof DisplayPreferences)[]) {
    if (key === "mode") continue;
    if (typeof r[key] === "boolean") (out as any)[key] = r[key];
  }
  return out;
}

/**
 * The canonical "is this advanced section visible?" predicate. Both the
 * global mode AND the per-product toggle must be true. Defaults to false
 * if prefs are missing — the AdvancedOnly wrapper must never crash.
 */
export function isAdvancedVisible(
  prefs: DisplayPreferences | null | undefined,
  product: AdvancedProductKey,
): boolean {
  if (!prefs) return false;
  if (prefs.mode !== "advanced") return false;
  const key = `${product}_show_advanced` as keyof DisplayPreferences;
  return Boolean(prefs[key]);
}

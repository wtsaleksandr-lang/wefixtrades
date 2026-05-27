/**
 * Wave 36 — Tesla Simplification.  Wave 36.5 — per-element granular toggles.
 *
 * Display Mode preferences. Controls whether the customer portal renders
 * the slim Simple view (essential KPIs + pipeline + action stack) or
 * unlocks the per-product / per-element advanced sections.
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
 *   • element_overrides: {} (no element-level opt-ins by default)
 *
 * Resolution order (highest → lowest precedence)
 * ──────────────────────────────────────────────
 *   1. `element_overrides[id]` if explicitly set (true → show, false → hide).
 *   2. Else `<product>_show_advanced` toggle, gated by `mode === "advanced"`.
 *
 * The `<AdvancedOnly>` client component reads these via
 * `useDisplayPreferences()` and falls through the resolver.
 */

import { z } from "zod";
import { DISPLAY_ELEMENT_IDS } from "./elementRegistry";

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
  /**
   * Wave 36.5 — per-element overrides. Keyed by `DisplayElementId`
   * (kebab-case, e.g. "contentflow.ai-detection-tile"). Three states per
   * key: explicit `true` (always show), explicit `false` (always hide),
   * or absent (fall back to product/mode logic).
   */
  element_overrides: Record<string, boolean>;
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
  element_overrides: {},
};

/**
 * Zod refinement: every key in `element_overrides` must be a known
 * `DisplayElementId`. Rejects unknown / stale ids so a drifted client can't
 * smuggle arbitrary JSONB keys through the PATCH endpoint.
 */
const elementOverridesSchema = z
  .record(z.string(), z.boolean())
  .superRefine((obj, ctx) => {
    for (const key of Object.keys(obj)) {
      if (!DISPLAY_ELEMENT_IDS.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown display element id: ${key}`,
          path: [key],
        });
      }
    }
  });

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
  element_overrides: elementOverridesSchema,
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
  if (!raw || typeof raw !== "object") return { ...DEFAULT_DISPLAY_PREFERENCES, element_overrides: {} };
  const r = raw as Record<string, unknown>;
  const out: DisplayPreferences = { ...DEFAULT_DISPLAY_PREFERENCES, element_overrides: {} };
  if (r.mode === "simple" || r.mode === "advanced") out.mode = r.mode;
  for (const key of Object.keys(DEFAULT_DISPLAY_PREFERENCES) as (keyof DisplayPreferences)[]) {
    if (key === "mode" || key === "element_overrides") continue;
    if (typeof r[key] === "boolean") (out as any)[key] = r[key];
  }
  // Element overrides — keep only known ids with boolean values. Stale ids
  // are silently dropped so a renamed element doesn't crash older blobs.
  if (r.element_overrides && typeof r.element_overrides === "object") {
    const eo = r.element_overrides as Record<string, unknown>;
    const cleaned: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(eo)) {
      if (typeof v === "boolean" && DISPLAY_ELEMENT_IDS.has(k)) cleaned[k] = v;
    }
    out.element_overrides = cleaned;
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

/**
 * Wave 36.5 — full resolution predicate including per-element overrides.
 *
 *   • If `elementId` is set AND the user has an explicit boolean for it,
 *     that wins (true → show, false → hide).
 *   • Otherwise fall back to `isAdvancedVisible(prefs, product)`.
 *
 * Crash-safe: returns false if prefs are missing. The `<AdvancedOnly>`
 * wrapper must never throw on a malformed blob.
 */
export function isElementVisible(
  prefs: DisplayPreferences | null | undefined,
  product: AdvancedProductKey,
  elementId?: string,
): boolean {
  if (!prefs) return false;
  if (elementId) {
    const override = prefs.element_overrides?.[elementId];
    if (typeof override === "boolean") return override;
  }
  return isAdvancedVisible(prefs, product);
}

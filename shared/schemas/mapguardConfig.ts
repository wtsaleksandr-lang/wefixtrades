/**
 * Customer-overridable MapGuard configuration.
 *
 * Stored in `clients.metadata.mapguard_config`. Empty / missing fields
 * mean "use platform defaults" — the monitoring worker reads via
 * `parseMapguardConfig(metadata)` which guarantees a fully populated
 * shape.
 *
 * The defaults (null custom_keywords, auto-derived city) preserve the
 * current behaviour where keywords are built from trade type + city
 * automatically. Setting either explicitly overrides the worker.
 */

import { z } from "zod";

export const mapguardConfigSchema = z.object({
  /** Display city / region for ranking searches. `null` = derive from
   * metadata or business profile (current behaviour). */
  city: z.string().trim().min(0).max(120).nullable(),
  /** Customer-supplied keyword list. `null` = use auto-built keywords
   * from trade type + city. Empty array means "track nothing" — we
   * treat that as a falsy signal and fall back to defaults too, since
   * a zero-keyword config is never useful. */
  custom_keywords: z.array(z.string().trim().min(1).max(120)).max(50).nullable(),
  /** Alerting + notification preferences specific to MapGuard. */
  alerts: z.object({
    /** Notify when rank drops by at least this many positions
     * vs the previous snapshot. 0 disables drop alerts. */
    rank_drop_threshold: z.number().int().min(0).max(20),
    /** Send a Friday recap email summarising the week's snapshots. */
    weekly_summary: z.boolean(),
  }),
});

export type MapguardConfig = z.infer<typeof mapguardConfigSchema>;

export const DEFAULT_MAPGUARD_CONFIG: MapguardConfig = {
  city: null,
  custom_keywords: null,
  alerts: {
    rank_drop_threshold: 3,
    weekly_summary: true,
  },
};

export function parseMapguardConfig(metadata: unknown): MapguardConfig {
  const md = (metadata ?? {}) as Record<string, unknown>;
  const raw = md.mapguard_config;
  const parsed = mapguardConfigSchema.safeParse(raw);
  if (!parsed.success) return DEFAULT_MAPGUARD_CONFIG;
  // Empty array = fall back to defaults (a zero-keyword config is
  // never useful — see comment on the schema).
  if (parsed.data.custom_keywords && parsed.data.custom_keywords.length === 0) {
    return { ...parsed.data, custom_keywords: null };
  }
  return parsed.data;
}

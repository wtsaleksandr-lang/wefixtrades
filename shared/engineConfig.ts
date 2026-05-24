/**
 * Per-product engine config (operational toggles)
 *
 * Stored in serviceCatalog.engine_config as jsonb. Distinct from
 * automation_config (which seeds per-subscriber AI defaults) and from
 * the draft → publish copy flow (which gates customer-visible name /
 * tagline / description). engine_config holds admin operational levers
 * that take effect immediately on save.
 *
 * Generic keys live at the top level. Product-specific config (e.g.
 * AdFlow audience + spend cap) is namespaced under a product-id key so
 * one column serves every product without per-product schema growth.
 */

import { z } from "zod";

export const adflowEngineConfigSchema = z.object({
  default_audience: z.enum(["all", "active_only", "new_leads_only"]).optional(),
  auto_pause_low_conversion: z.boolean().optional(),
  auto_pause_threshold_pct: z.number().min(0).max(100).optional(),
  spend_cap_per_client_per_week_cents: z.number().int().min(0).max(100_000_00).optional(),
});
export type AdflowEngineConfig = z.infer<typeof adflowEngineConfigSchema>;

export const engineConfigSchema = z.object({
  // Generic, applies to every product.
  delivery_enabled: z.boolean().optional(),
  auto_handle_inbound: z.boolean().optional(),
  visibility_scope: z.enum(["internal", "customer_facing", "both"]).optional(),
  default_fulfillment_sla_hours: z.number().int().min(1).max(720).optional(),
  // Product-namespaced extras. AdFlow uses .adflow; other products can
  // add their own key without a migration.
  adflow: adflowEngineConfigSchema.optional(),
}).passthrough();

export type EngineConfig = z.infer<typeof engineConfigSchema>;

export function emptyEngineConfig(): EngineConfig {
  return {
    delivery_enabled: true,
    auto_handle_inbound: false,
    visibility_scope: "both",
    default_fulfillment_sla_hours: 48,
  };
}

export function emptyAdflowEngineConfig(): AdflowEngineConfig {
  return {
    default_audience: "all",
    auto_pause_low_conversion: false,
    auto_pause_threshold_pct: 1.0,
    spend_cap_per_client_per_week_cents: 50_000, // $500/week default
  };
}

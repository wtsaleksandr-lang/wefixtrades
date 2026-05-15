import { pgTable, integer, varchar, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ─── ContentFlow product-level settings ──────────────────────────────────
   A single-row (singleton, id=1) table holding global admin config for the
   ContentFlow product: emergency kill switch, generation model tier,
   per-channel publish toggles, and a monthly AI spend cap.

   Read/written via storage.getContentflowSettings / updateContentflowSettings;
   enforced by services/contentflow/contentflowGate.ts.
*/

/** Every publish channel ContentFlow's queue drains. Keep in sync with
 *  wordpressQueue's SocialChannel union + GBP/WordPress channels. */
export const CONTENTFLOW_CHANNELS = [
  "wordpress",
  "facebook",
  "instagram",
  "gbp",
  "gbp_post",
  "email",
  "linkedin",
  "pinterest",
  "youtube",
] as const;
export type ContentflowChannel = (typeof CONTENTFLOW_CHANNELS)[number];

/** Generation quality tier — maps to the AI rotator's model tiers. */
export const CONTENTFLOW_TEXT_TIERS = ["standard", "premium"] as const;
export type ContentflowTextTier = (typeof CONTENTFLOW_TEXT_TIERS)[number];

export const contentflowSettings = pgTable("contentflow_settings", {
  // Singleton — there is always exactly one row, id = 1.
  id: integer("id").primaryKey(),
  // Emergency stop — when true, ALL generation and publishing is paused.
  kill_switch: boolean("kill_switch").notNull().default(false),
  // Text generation model tier: "standard" = Claude Haiku, "premium" = Claude Sonnet.
  text_tier: varchar("text_tier", { length: 20 }).notNull().default("standard"),
  // Channels that are turned OFF. Empty = every channel enabled (so a
  // newly-added channel is on by default).
  disabled_channels: jsonb("disabled_channels").$type<string[]>().notNull().default([]),
  // Monthly AI spend cap in whole USD. null = no cap.
  monthly_spend_cap_usd: integer("monthly_spend_cap_usd"),
  updated_at: timestamp("updated_at").defaultNow(),
  updated_by: integer("updated_by"),
});

export const insertContentflowSettingsSchema = createInsertSchema(contentflowSettings).omit({
  updated_at: true,
});
export type InsertContentflowSettings = z.infer<typeof insertContentflowSettingsSchema>;
export type ContentflowSettings = typeof contentflowSettings.$inferSelect;

/** Validation schema for the admin config PUT endpoint. */
export const contentflowSettingsPatchSchema = z.object({
  kill_switch: z.boolean().optional(),
  text_tier: z.enum(CONTENTFLOW_TEXT_TIERS).optional(),
  disabled_channels: z.array(z.enum(CONTENTFLOW_CHANNELS)).optional(),
  monthly_spend_cap_usd: z.number().int().min(0).max(1_000_000).nullable().optional(),
});
export type ContentflowSettingsPatch = z.infer<typeof contentflowSettingsPatchSchema>;

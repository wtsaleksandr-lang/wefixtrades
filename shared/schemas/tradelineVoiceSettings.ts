/**
 * Wave W-AW-1 — TradeLine voice catalog + per-client assistant settings.
 *
 * Replaces the static 4-entry registry in `shared/tradelineVoices.ts` with a
 * DB-backed catalog so admins can add / edit / archive voices without a code
 * change. The static file is kept as a runtime fallback when the DB is
 * unreachable or empty.
 *
 * Per-client `tradeline_assistant_settings` carries the chosen voice, greeting
 * overrides, response-style hint, and a monthly voice-minute budget cap so
 * admins can ring-fence runaway spend without yanking the assistant offline.
 */

import {
  pgTable,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  serial,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./adminCrm";

/* ────────── Voice catalog ────────── */

export const tradelineVoices = pgTable(
  "tradeline_voices",
  {
    /** Stable string id, e.g. 'professional-female' or 'sarah_warm'. */
    id: text("id").primaryKey(),
    elevenlabs_voice_id: text("elevenlabs_voice_id").notNull(),
    display_name: text("display_name").notNull(),
    description: text("description"),
    /** 'female' | 'male' | 'neutral' — soft enum, validated at API layer. */
    gender: text("gender"),
    /** 'us-en' | 'uk-en' | etc. — soft enum, validated at API layer. */
    accent: text("accent"),
    /** Free-form descriptor tags ('warm', 'professional', etc.). */
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    sample_audio_url: text("sample_audio_url"),
    /** 'active' | 'archived'. */
    status: text("status").notNull().default("active"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index("tradeline_voices_status_idx").on(t.status),
  }),
);

export const insertTradelineVoiceSchema = createInsertSchema(tradelineVoices).omit({
  created_at: true,
  updated_at: true,
});
export type InsertTradelineVoice = z.infer<typeof insertTradelineVoiceSchema>;
export type TradelineVoice = typeof tradelineVoices.$inferSelect;

/* ────────── Per-client assistant settings ────────── */

export const tradelineAssistantSettings = pgTable(
  "tradeline_assistant_settings",
  {
    id: serial("id").primaryKey(),
    client_id: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    voice_id: text("voice_id").references(() => tradelineVoices.id),
    /** Optional greeting override — replaces the templated first message. */
    greeting: text("greeting"),
    /** 'concise' | 'detailed' | 'friendly' — soft enum. */
    response_style: text("response_style"),
    /** Hard cap (minutes) per calendar month — null = no cap. */
    monthly_minute_budget: integer("monthly_minute_budget"),
    monthly_minute_used: integer("monthly_minute_used").notNull().default(0),
    budget_reset_at: timestamp("budget_reset_at"),
    auto_disable_on_cap: boolean("auto_disable_on_cap").notNull().default(true),
    fallback_voice_id: text("fallback_voice_id").references(() => tradelineVoices.id),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    clientUniq: uniqueIndex("tradeline_assistant_settings_client_uniq").on(t.client_id),
  }),
);

export const insertTradelineAssistantSettingsSchema = createInsertSchema(
  tradelineAssistantSettings,
).omit({ id: true, created_at: true, updated_at: true });
export type InsertTradelineAssistantSettings = z.infer<
  typeof insertTradelineAssistantSettingsSchema
>;
export type TradelineAssistantSettings = typeof tradelineAssistantSettings.$inferSelect;

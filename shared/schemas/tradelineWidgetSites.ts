/**
 * tradeline_widget_sites
 *
 * Per-client embeddable chat-widget configuration. Each WeFixTrades trade
 * gets a unique site_key they can embed via a one-line <script> snippet
 * on their own website. The widget on their site talks to the same AI
 * brain that powers TradeLine voice/SMS, with the trade's niche template
 * and customization applied at runtime.
 *
 * One row per client (unique on client_id). Widget enable/disable + theme
 * customization happens via /portal/tradeline/chat-widget.
 */

import { pgTable, serial, integer, varchar, text, timestamp, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./adminCrm";

export const tradelineWidgetSites = pgTable(
  "tradeline_widget_sites",
  {
    id: serial("id").primaryKey(),
    client_id: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** URL-safe random token; embedded in the <script> snippet on the trade's site */
    site_key: varchar("site_key", { length: 48 }).notNull().unique(),
    /** Whether the widget actively serves chats. Trade can disable without losing config. */
    enabled: boolean("enabled").notNull().default(true),
    /** Display name in the widget header (defaults to trade's business_name) */
    display_name: text("display_name"),
    /** Greeting bubble copy shown when widget opens */
    greeting: text("greeting"),
    /** Hex color for accents — default fall-back to WeFixTrades cyan */
    accent_color: varchar("accent_color", { length: 16 }),
    /** 'bottom-right' | 'bottom-left' | 'floating' */
    position: varchar("position", { length: 30 }).notNull().default("bottom-right"),
    /** Domains the snippet is allowed to embed on — when set, server cross-checks Origin */
    allowed_origins: text("allowed_origins"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqClient: unique("tradeline_widget_sites_client_id_key").on(table.client_id),
  }),
);

export const insertTradelineWidgetSiteSchema = createInsertSchema(tradelineWidgetSites).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type TradelineWidgetSite = typeof tradelineWidgetSites.$inferSelect;
export type InsertTradelineWidgetSite = z.infer<typeof insertTradelineWidgetSiteSchema>;

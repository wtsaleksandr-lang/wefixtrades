import { pgTable, text, serial, integer, timestamp, jsonb, boolean, numeric, date, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./adminCrm";

/**
 * Per-client list of competitor place_ids to track. Premium tier feature.
 * Soft-cap of 5 enforced at the service layer (no DB constraint).
 */
export const reputationCompetitors = pgTable(
  "reputation_competitors",
  {
    id: serial("id").primaryKey(),
    client_id: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    place_id: text("place_id").notNull(),
    display_name: text("display_name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    metadata: jsonb("metadata"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    clientPlaceUq: uniqueIndex("idx_competitors_client_place").on(t.client_id, t.place_id),
  }),
);

export const insertCompetitorSchema = createInsertSchema(reputationCompetitors).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertCompetitor = z.infer<typeof insertCompetitorSchema>;
export type Competitor = typeof reputationCompetitors.$inferSelect;

/**
 * Daily snapshots of competitor stats — drives trend graphs in the
 * Premium dashboard. One row per (competitor, snapshot_date).
 */
export const reputationCompetitorSnapshots = pgTable(
  "reputation_competitor_snapshots",
  {
    id: serial("id").primaryKey(),
    competitor_id: integer("competitor_id").notNull().references(() => reputationCompetitors.id, { onDelete: "cascade" }),
    client_id: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    snapshot_date: date("snapshot_date").notNull(),
    total_reviews: integer("total_reviews").notNull().default(0),
    average_rating: numeric("average_rating", { precision: 3, scale: 2 }),
    reviews_30d: integer("reviews_30d"),
    metadata: jsonb("metadata"),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    dailyUq: uniqueIndex("idx_competitor_snapshot_daily").on(t.competitor_id, t.snapshot_date),
  }),
);

export type CompetitorSnapshot = typeof reputationCompetitorSnapshots.$inferSelect;

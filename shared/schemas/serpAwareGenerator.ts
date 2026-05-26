/**
 * SerpAwareGenerator — schema for cached SERP briefs + topical maps (Wave 21).
 *
 * Both tables are write-rarely / read-often caches with a 1-week TTL. They
 * exist so that ContentFlow's SEO-aware generator can reuse SERP analysis
 * across articles targeting the same keyword without re-fetching top-10
 * competitor pages every time (expensive and slow).
 *
 * See migrations/0064_serp_aware_generator.sql.
 */

import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const serpBriefs = pgTable(
  "serp_briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    keyword: text("keyword").notNull(),
    location: text("location"),
    brief_json: jsonb("brief_json").notNull(),
    built_at: timestamp("built_at").notNull().defaultNow(),
    expires_at: timestamp("expires_at").notNull(),
  },
  (table) => ({
    keywordIdx: index("idx_serp_briefs_keyword").on(table.keyword),
    expiresIdx: index("idx_serp_briefs_expires_at").on(table.expires_at),
  }),
);

export const insertSerpBriefSchema = createInsertSchema(serpBriefs).omit({
  id: true,
  built_at: true,
});
export type InsertSerpBrief = z.infer<typeof insertSerpBriefSchema>;
export type SerpBriefRow = typeof serpBriefs.$inferSelect;

export const topicalMaps = pgTable(
  "topical_maps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seed_keyword: text("seed_keyword").notNull(),
    location: text("location"),
    industry_niche: text("industry_niche"),
    map_json: jsonb("map_json").notNull(),
    built_at: timestamp("built_at").notNull().defaultNow(),
    expires_at: timestamp("expires_at").notNull(),
  },
  (table) => ({
    seedIdx: index("idx_topical_maps_seed_keyword").on(table.seed_keyword),
    expiresIdx: index("idx_topical_maps_expires_at").on(table.expires_at),
  }),
);

export const insertTopicalMapSchema = createInsertSchema(topicalMaps).omit({
  id: true,
  built_at: true,
});
export type InsertTopicalMap = z.infer<typeof insertTopicalMapSchema>;
export type TopicalMapRow = typeof topicalMaps.$inferSelect;

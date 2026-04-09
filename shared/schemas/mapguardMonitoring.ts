import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients, clientServices } from "./adminCrm";

/* ═══════════════════════════════════════════
   MapGuard Monitoring — Historical Snapshots
   ═══════════════════════════════════════════
   Stores periodic scan results for each client
   to enable trend tracking, change detection,
   and automated task creation.
   ═══════════════════════════════════════════ */

export const mapguardSnapshots = pgTable("mapguard_snapshots", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id),
  client_service_id: integer("client_service_id").references(() => clientServices.id),
  captured_at: timestamp("captured_at").notNull().defaultNow(),

  /* ─── Business Profile Metrics ─── */
  place_id: text("place_id"),
  business_name: text("business_name"),
  rating: real("rating"),                          // e.g. 4.6
  review_count: integer("review_count"),           // e.g. 47
  photo_count: integer("photo_count"),
  has_website: boolean("has_website"),
  has_description: boolean("has_description"),
  has_hours: boolean("has_hours"),

  /* ─── Visibility / Rankings ─── */
  keywords_tracked: integer("keywords_tracked"),    // how many keywords checked
  keywords_in_local_pack: integer("keywords_in_local_pack"),
  best_local_pack_position: integer("best_local_pack_position"),  // best LP position (1=best)
  avg_organic_rank: real("avg_organic_rank"),       // avg rank of ranked keywords
  keywords_in_top_10: integer("keywords_in_top_10"),

  /* ─── Scores (from scoring engine) ─── */
  score_total: integer("score_total"),             // 0-100
  score_grade: varchar("score_grade", { length: 2 }),   // A/B/C/D
  score_google_maps: integer("score_google_maps"),      // 0-25
  score_search_visibility: integer("score_search_visibility"),  // 0-20
  score_competitor: integer("score_competitor"),    // 0-15

  /* ─── Competitor Summary ─── */
  top_competitor_name: text("top_competitor_name"),
  top_competitor_rating: real("top_competitor_rating"),
  top_competitor_reviews: integer("top_competitor_reviews"),

  /* ─── Raw Data ─── */
  keywords_data: jsonb("keywords_data"),           // [{keyword, organicRank, localPackPosition, isInLocalPack}]
  detected_issues: jsonb("detected_issues"),       // string[]
  scan_metadata: jsonb("scan_metadata"),           // {duration_ms, apis_called, errors}

  /* ─── Change Detection (computed vs previous snapshot) ─── */
  changes: jsonb("changes"),                       // {rating_delta, reviews_delta, score_delta, rank_changes[], new_issues[], resolved_issues[]}

  created_at: timestamp("created_at").defaultNow(),
});

export const insertMapguardSnapshotSchema = createInsertSchema(mapguardSnapshots).omit({
  id: true, created_at: true,
});
export type InsertMapguardSnapshot = z.infer<typeof insertMapguardSnapshotSchema>;
export type MapguardSnapshot = typeof mapguardSnapshots.$inferSelect;

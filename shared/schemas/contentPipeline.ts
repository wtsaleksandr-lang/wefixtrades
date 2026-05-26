import {
  pgTable,
  serial,
  varchar,
  integer,
  jsonb,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ─── Wave 20: Unified content pipeline ──────────────────────────────────
   ContentFlow is the only content generator. RankFlow + SocialSync call
   into the unified `requestContent()` API; everything is tracked here so
   admin + customer surfaces can see in-flight state and errors.

   Both tables are additive — existing `content_drafts`, `content_approvals`,
   `content_assets` are unchanged. Wave-20 callers populate these as a
   parallel observability + dispatch layer.
*/

export const contentRequests = pgTable(
  "content_requests",
  {
    id: serial("id").primaryKey(),
    request_id: varchar("request_id", { length: 64 }).notNull().unique(),
    source: varchar("source", { length: 20 }).notNull(),
    // 'rankflow' | 'socialsync' | 'contentflow' | 'manual'
    type: varchar("type", { length: 20 }).notNull(),
    // 'article' | 'social_post' | 'image' | 'video'
    client_id: integer("client_id"),
    topic: text("topic").notNull(),
    request_payload: jsonb("request_payload").notNull(),
    current_stage: varchar("current_stage", { length: 30 })
      .notNull()
      .default("requested"),
    // 'requested' | 'generating' | 'quality_check' | 'approved' | 'failed'
    result_payload: jsonb("result_payload"),
    quality_score: integer("quality_score"),
    error_count: integer("error_count").notNull().default(0),
    draft_id: integer("draft_id"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    clientIdx: index("idx_content_requests_client_id").on(table.client_id),
    sourceIdx: index("idx_content_requests_source").on(table.source),
    stageIdx: index("idx_content_requests_current_stage").on(table.current_stage),
    createdIdx: index("idx_content_requests_created_at").on(table.created_at),
  }),
);

export const insertContentRequestSchema = createInsertSchema(contentRequests).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertContentRequest = z.infer<typeof insertContentRequestSchema>;
export type ContentRequest = typeof contentRequests.$inferSelect;

export const contentPipelineLog = pgTable(
  "content_pipeline_log",
  {
    id: serial("id").primaryKey(),
    request_id: varchar("request_id", { length: 64 }).notNull(),
    source: varchar("source", { length: 20 }).notNull(),
    stage: varchar("stage", { length: 30 }).notNull(),
    // 'requested' | 'generating' | 'quality_check' | 'approved' | 'failed' | 'retry'
    payload: jsonb("payload"),
    errors: jsonb("errors"),
    recorded_at: timestamp("recorded_at").notNull().defaultNow(),
  },
  (table) => ({
    requestIdx: index("idx_content_pipeline_log_request_id").on(table.request_id),
    sourceIdx: index("idx_content_pipeline_log_source").on(table.source),
    stageIdx: index("idx_content_pipeline_log_stage").on(table.stage),
    recordedIdx: index("idx_content_pipeline_log_recorded_at").on(table.recorded_at),
  }),
);

export const insertContentPipelineLogSchema = createInsertSchema(
  contentPipelineLog,
).omit({ id: true, recorded_at: true });
export type InsertContentPipelineLog = z.infer<typeof insertContentPipelineLogSchema>;
export type ContentPipelineLog = typeof contentPipelineLog.$inferSelect;

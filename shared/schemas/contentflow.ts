import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients, clientServices } from "./adminCrm";
import { users } from "./db";

/* ─── ContentFlow Drafts ───────────────────────────────────────────────
   Unified draft record across surfaces (socialsync, rankflow).
   Forward-linked to the surface artefact via linked_social_post_id
   / linked_task_id. The reverse link (content_draft_id on the surface
   table) is declared as a plain integer column to avoid circular
   imports and is enforced at DB level by the migration.
*/
export const contentDrafts = pgTable("content_drafts", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id),
  // Nullable for Sprint 1 — SocialSync orchestrator does not resolve a
  // specific clientService today. Will be populated once a resolver exists.
  client_service_id: integer("client_service_id").references(() => clientServices.id),
  kind: varchar("kind", { length: 30 }).notNull(),
  // 'social_post' | 'article' | 'caption'
  surface: varchar("surface", { length: 30 }).notNull(),
  // 'socialsync' | 'rankflow' | 'wfx_seo'
  // 'wfx_seo' = the owned-domain SEO content engine (shared/schemas/seoContent.ts):
  // attributed, E-E-A-T, human-reviewed pages published on wefixtrades.com.
  // It reuses this draft + content_approvals plumbing but NOT the rankflow
  // detection-evasion machinery. On publish, the approved draft is copied
  // into seo_content_pages (the durable, sitemap-feeding read path).
  title: text("title"),
  body: text("body"),                                 // post text or article body (markdown for articles)
  excerpt: text("excerpt"),                           // short summary for cards/previews
  target_platform: varchar("target_platform", { length: 30 }),
  // 'facebook' | 'instagram' | 'google_business' | 'linkedin' | 'website' | null
  target_url: text("target_url"),                     // intended publish URL for articles
  metadata: jsonb("metadata"),                         // hashtags, keywords, slug, seo fields, media_plan, etc.
  quality_score: integer("quality_score"),            // 0-100
  quality_notes: jsonb("quality_notes"),              // verdict + flags from qualityGate
  status: varchar("status", { length: 30 }).notNull().default("draft"),
  // 'draft' | 'awaiting_admin' | 'awaiting_client' | 'approved'
  // | 'rejected' | 'published' | 'delivered' | 'failed'
  auto_approved: boolean("auto_approved").notNull().default(false),
  requires_admin_review: boolean("requires_admin_review").notNull().default(false),
  requires_client_review: boolean("requires_client_review").notNull().default(false),
  admin_approved_at: timestamp("admin_approved_at"),
  admin_approved_by: integer("admin_approved_by").references(() => users.id),
  client_approved_at: timestamp("client_approved_at"),
  rejected_at: timestamp("rejected_at"),
  rejection_reason: text("rejection_reason"),
  // Cross-surface linkage. Plain integer columns — FK enforced by migration
  // to avoid circular TS imports between schema files.
  linked_social_post_id: integer("linked_social_post_id"),
  linked_task_id: integer("linked_task_id"),
  generation_cost_micro_usd: integer("generation_cost_micro_usd"),
  created_by: varchar("created_by", { length: 20 }).notNull().default("system"),
  // 'system' | 'human'
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => ({
  clientStatusIdx: index("content_drafts_client_status_idx").on(table.client_id, table.status),
  surfaceStatusIdx: index("content_drafts_surface_status_idx").on(table.surface, table.status),
  linkedSocialIdx: uniqueIndex("content_drafts_linked_social_uidx").on(table.linked_social_post_id),
  linkedTaskIdx: uniqueIndex("content_drafts_linked_task_uidx").on(table.linked_task_id),
}));
export const insertContentDraftSchema = createInsertSchema(contentDrafts).omit({ id: true, created_at: true, updated_at: true });
export type InsertContentDraft = z.infer<typeof insertContentDraftSchema>;
export type ContentDraft = typeof contentDrafts.$inferSelect;

/* ─── ContentFlow Approvals (append-only audit) ───────────────────────── */
export const contentApprovals = pgTable("content_approvals", {
  id: serial("id").primaryKey(),
  draft_id: integer("draft_id").notNull().references(() => contentDrafts.id),
  actor_type: varchar("actor_type", { length: 20 }).notNull(),
  // 'admin' | 'client' | 'system'
  actor_id: integer("actor_id"),                      // users.id (admin) or clients.id (client); null for system
  action: varchar("action", { length: 30 }).notNull(),
  // 'submitted' | 'approved' | 'rejected' | 'auto_approved' | 'edited'
  notes: text("notes"),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
}, (table) => ({
  draftIdx: index("content_approvals_draft_idx").on(table.draft_id, table.created_at),
}));
export const insertContentApprovalSchema = createInsertSchema(contentApprovals).omit({ id: true, created_at: true });
export type InsertContentApproval = z.infer<typeof insertContentApprovalSchema>;
export type ContentApproval = typeof contentApprovals.$inferSelect;

/* ─── ContentFlow Assets (media library) ─────────────────────────────── */
export const contentAssets = pgTable("content_assets", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id),
  source: varchar("source", { length: 30 }).notNull(),
  // 'upload' | 'stock_unsplash' | 'ai_generated'
  url: text("url").notNull(),
  public_url: text("public_url"),                      // public/CDN URL (required for Instagram)
  mime_type: varchar("mime_type", { length: 50 }),
  width: integer("width"),
  height: integer("height"),
  alt_text: text("alt_text"),
  metadata: jsonb("metadata"),                          // attribution, prompt, original size, etc.
  created_by: integer("created_by").references(() => users.id),
  created_at: timestamp("created_at").defaultNow(),
}, (table) => ({
  clientSourceIdx: index("content_assets_client_source_idx").on(table.client_id, table.source),
}));
export const insertContentAssetSchema = createInsertSchema(contentAssets).omit({ id: true, created_at: true });
export type InsertContentAsset = z.infer<typeof insertContentAssetSchema>;
export type ContentAsset = typeof contentAssets.$inferSelect;

/* ─── ContentFlow Video Pipeline (Phase 2) ────────────────────────────
   One video_projects row per user-requested video (Director scene plan,
   lifecycle, stitch state, cost accounting) + one video_scenes row per
   Director scene (provider render lifecycle, operation refs persisted
   between worker ticks — no in-process awaiting of multi-minute renders).

   Linked forward to the content_drafts row (kind='video') via draft_id;
   the draft carries metadata.video_project_id back. DDL lives in
   migrations/0085_contentflow_video_pipeline.sql; storage helpers in
   server/storage/contentflowVideo.ts.

   COST INVARIANT: every stage cost is written twice — to
   video_projects.actual_cost_micro_usd / cost_breakdown AND to the draft's
   generation_cost_micro_usd (addDraftGenerationCost) so the existing
   monthly spend cap counts video spend unchanged.
*/

export const VIDEO_PROJECT_STATUSES = [
  "planned", "rendering", "stitching", "ready", "needs_attention", "failed", "canceled",
] as const;
export type VideoProjectStatus = (typeof VIDEO_PROJECT_STATUSES)[number];

export const VIDEO_STITCH_STATUSES = ["pending", "stitching", "done", "failed"] as const;
export type VideoStitchStatus = (typeof VIDEO_STITCH_STATUSES)[number];

export const VIDEO_SCENE_STATUSES = ["planned", "rendering", "rendered", "failed"] as const;
export type VideoSceneStatus = (typeof VIDEO_SCENE_STATUSES)[number];

export const videoProjects = pgTable("video_projects", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id),
  draft_id: integer("draft_id").notNull().references(() => contentDrafts.id),
  // sha256(client|prompt|day|nonce) — dedupes UI double-submit; the route
  // returns the existing project on conflict.
  idempotency_key: varchar("idempotency_key", { length: 100 }).notNull(),
  title: text("title"),
  source_prompt: text("source_prompt").notNull(),
  prompt_source: jsonb("prompt_source"),              // 3-source snapshot (template/custom-prompt/free-form)
  scene_plan: jsonb("scene_plan"),                     // Director output (audit copy; scenes normalized below)
  aspect_ratio: varchar("aspect_ratio", { length: 10 }).notNull().default("16:9"),
  // '16:9' | '9:16' | '1:1'
  narration_enabled: boolean("narration_enabled").notNull().default(true),
  audio_mode: varchar("audio_mode", { length: 10 }),   // 'native' | 'tts' | 'silent'
  status: varchar("status", { length: 20 }).notNull().default("planned"),
  // 'planned' | 'rendering' | 'stitching' | 'ready' | 'needs_attention' | 'failed' | 'canceled'
  stitch_status: varchar("stitch_status", { length: 20 }).notNull().default("pending"),
  // 'pending' | 'stitching' | 'done' | 'failed'
  stitch_operation_ref: text("stitch_operation_ref"),
  estimated_cost_micro_usd: integer("estimated_cost_micro_usd"),
  actual_cost_micro_usd: integer("actual_cost_micro_usd").notNull().default(0),
  cost_breakdown: jsonb("cost_breakdown").$type<Record<string, number>>().notNull().default({}),
  // { director?, scenes?, tts?, stitch? } — micro-USD per stage
  video_url: text("video_url"),                        // final stitched R2 asset
  error: text("error"),
  locked_at: timestamp("locked_at"),
  locked_by: varchar("locked_by", { length: 80 }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => ({
  idempotencyIdx: uniqueIndex("video_projects_idempotency_uidx").on(table.idempotency_key),
  statusClientIdx: index("video_projects_status_client_idx").on(table.status, table.client_id),
}));
export const insertVideoProjectSchema = createInsertSchema(videoProjects).omit({ id: true, created_at: true, updated_at: true });
export type InsertVideoProject = z.infer<typeof insertVideoProjectSchema>;
export type VideoProject = typeof videoProjects.$inferSelect;

export const videoScenes = pgTable("video_scenes", {
  id: serial("id").primaryKey(),
  project_id: integer("project_id").notNull().references(() => videoProjects.id, { onDelete: "cascade" }),
  scene_index: integer("scene_index").notNull(),
  prompt: text("prompt").notNull(),                    // styleBible-injected visual prompt
  narration: text("narration"),
  duration_sec: integer("duration_sec").notNull(),     // clamped 4-8s by the Director
  status: varchar("status", { length: 20 }).notNull().default("planned"),
  // 'planned' | 'rendering' | 'rendered' | 'failed'
  provider: varchar("provider", { length: 20 }),       // 'veo_31' | 'kling_30'
  provider_operation_ref: text("provider_operation_ref"),   // LRO name / queue id, persisted between ticks
  provider_request_id: varchar("provider_request_id", { length: 100 }),
  // idempotency token to the provider — persisted BEFORE submit
  video_url: text("video_url"),                        // per-scene R2 asset (resumability + retry)
  cost_micro_usd: integer("cost_micro_usd").notNull().default(0),
  attempts: integer("attempts").notNull().default(0),
  last_error: text("last_error"),
  next_attempt_at: timestamp("next_attempt_at"),       // retry backoff gate
  locked_at: timestamp("locked_at"),
  locked_by: varchar("locked_by", { length: 80 }),
  rendered_at: timestamp("rendered_at"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => ({
  projectSceneIdx: uniqueIndex("video_scenes_project_scene_uidx").on(table.project_id, table.scene_index),
  statusNextAttemptIdx: index("video_scenes_status_next_attempt_idx").on(table.status, table.next_attempt_at),
}));
export const insertVideoSceneSchema = createInsertSchema(videoScenes).omit({ id: true, created_at: true, updated_at: true });
export type InsertVideoScene = z.infer<typeof insertVideoSceneSchema>;
export type VideoScene = typeof videoScenes.$inferSelect;

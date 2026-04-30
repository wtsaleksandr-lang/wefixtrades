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
  // 'socialsync' | 'rankflow'
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

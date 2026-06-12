import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ════════════════════════════════════════════════════════════════════════
   WeFixTrades OWNED-DOMAIN SEO content engine — foundational schema.

   This is the OPPOSITE of the customer-facing ContentFlow / RankFlow article
   engine: pages here publish on wefixtrades.com under a REAL author entity
   with full E-E-A-T attribution. We WANT Google to attribute this content to
   us — there is NO detection-evasion machinery in this path (no
   humanizationOrchestrator / detectorGate / cadenceVerifier / ZeroGPT). See
   plans/seo-content-channel-design.md §0.

   Pre-publish drafting reuses content_drafts (surface='wfx_seo') +
   content_approvals (see contentflow.ts). These two durable tables are the
   indexable, sitemap-feeding read path — kept separate from the busy
   multi-tenant content_drafts table.

   The whole engine is INERT by default: gated behind the SEO_ENGINE_ENABLED
   env flag AND the seo_engine_settings.kill_switch DB row (see
   server/services/seoContent/seoEngineGate.ts). Nothing renders or generates
   until the flag is on AND published rows exist.
   ════════════════════════════════════════════════════════════════════════ */

/* ─── Page status state-machine ──────────────────────────────────────────
   draft → in_review → published → archived. Only 'published' pages are
   publicly rendered + fed to the sitemap; everything else is 404/noindex. */
export const SEO_PAGE_STATUSES = ["draft", "in_review", "published", "archived"] as const;
export type SeoPageStatus = (typeof SEO_PAGE_STATUSES)[number];

/* ─── seo_content_pages — durable published-page store ───────────────────
   The single-purpose, indexable record of what is (or was) LIVE. surface is
   always 'wfx_seo' so the sitemap query stays trivial and unambiguous. */
export const seoContentPages = pgTable("seo_content_pages", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 200 }).notNull(),
  title: text("title").notNull(),
  meta_description: text("meta_description"),
  excerpt: text("excerpt"),
  // Article body in markdown.
  content: text("content").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  // 'draft' | 'in_review' | 'published' | 'archived'
  // schema.org @type for the primary JSON-LD block (Article by default).
  jsonld_type: varchar("jsonld_type", { length: 40 }).notNull().default("Article"),
  // Real author entity (E-E-A-T). Name of a WFX Person/Organization with an
  // /about/authors/... page — what makes the entity real to Google.
  author_entity: varchar("author_entity", { length: 120 }).notNull().default("WeFixTrades Editorial"),
  // Self-canonical by default; may point at a collapse target for near-dupes.
  canonical: text("canonical"),
  // OriginalDataService snapshot frozen at publish (ranges, sample size,
  // computed_at) — the moat. Nullable for data-light editorial angles.
  original_data: jsonb("original_data"),
  // Anti-thin audit value: count of page-specific real data points.
  unique_data_score: integer("unique_data_score"),
  // Always 'wfx_seo' — the sitemap discriminator.
  surface: varchar("surface", { length: 20 }).notNull().default("wfx_seo"),
  // Forward link to the content_drafts row this was published from (plain
  // integer to avoid a cross-file circular import; FK enforced in migration).
  source_draft_id: integer("source_draft_id"),
  published_at: timestamp("published_at"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => ({
  slugUidx: uniqueIndex("seo_content_pages_slug_uidx").on(table.slug),
  statusSurfaceIdx: index("seo_content_pages_status_surface_idx").on(table.status, table.surface),
}));
export const insertSeoContentPageSchema = createInsertSchema(seoContentPages).omit({ id: true, created_at: true, updated_at: true });
export type InsertSeoContentPage = z.infer<typeof insertSeoContentPageSchema>;
export type SeoContentPage = typeof seoContentPages.$inferSelect;

/* ─── seo_keyword_plan — editorial + programmatic topic/matrix queue ─────
   Unique(target_keyword, job_type, city) is the dedup key — first line of
   defence against duplicate programmatic pages. assigned_page_id links a
   planned row to the seo_content_pages row it produced. */
export const SEO_PLAN_STATUSES = ["planned", "generating", "drafted", "published", "skipped", "blocked"] as const;
export type SeoPlanStatus = (typeof SEO_PLAN_STATUSES)[number];

export const SEO_SEARCH_INTENTS = ["bottom", "mid", "top"] as const;
export type SeoSearchIntent = (typeof SEO_SEARCH_INTENTS)[number];

export const seoKeywordPlan = pgTable("seo_keyword_plan", {
  id: serial("id").primaryKey(),
  target_keyword: text("target_keyword").notNull(),
  // bottom (transactional) | mid | top (informational).
  search_intent: varchar("search_intent", { length: 10 }).notNull().default("mid"),
  // Empty-string sentinels (not NULL) so the unique index treats "no
  // job/city" as a single comparable value — Postgres unique indexes do NOT
  // dedupe NULLs.
  job_type: varchar("job_type", { length: 80 }).notNull().default(""),
  city: varchar("city", { length: 80 }).notNull().default(""),
  status: varchar("status", { length: 20 }).notNull().default("planned"),
  // 'planned' | 'generating' | 'drafted' | 'published' | 'skipped' | 'blocked'
  skip_reason: text("skip_reason"),
  assigned_page_id: integer("assigned_page_id"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Dedup key: one plan row per (keyword, job, city) triple.
  keywordJobCityUidx: uniqueIndex("seo_keyword_plan_keyword_job_city_uidx").on(
    table.target_keyword, table.job_type, table.city,
  ),
  statusIdx: index("seo_keyword_plan_status_idx").on(table.status),
}));
export const insertSeoKeywordPlanSchema = createInsertSchema(seoKeywordPlan).omit({ id: true, created_at: true, updated_at: true });
export type InsertSeoKeywordPlan = z.infer<typeof insertSeoKeywordPlanSchema>;
export type SeoKeywordPlan = typeof seoKeywordPlan.$inferSelect;

/* ─── seo_engine_settings — DB-level kill switch (singleton, id=1) ────────
   Mirrors contentflow_settings: a single admin row that, with kill_switch
   ON, halts the whole engine regardless of the SEO_ENGINE_ENABLED env flag.
   Read/enforced by server/services/seoContent/seoEngineGate.ts. */
export const seoEngineSettings = pgTable("seo_engine_settings", {
  // Singleton — there is always exactly one row, id = 1.
  id: integer("id").primaryKey(),
  // Emergency stop — when true, ALL SEO-engine generation + publishing is
  // paused even if SEO_ENGINE_ENABLED is set.
  kill_switch: boolean("kill_switch").notNull().default(false),
  updated_at: timestamp("updated_at").defaultNow(),
  updated_by: integer("updated_by"),
});
export const insertSeoEngineSettingsSchema = createInsertSchema(seoEngineSettings).omit({ updated_at: true });
export type InsertSeoEngineSettings = z.infer<typeof insertSeoEngineSettingsSchema>;
export type SeoEngineSettings = typeof seoEngineSettings.$inferSelect;

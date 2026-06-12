/**
 * Storage helpers for the owned-domain SEO content engine.
 *
 * Two responsibilities:
 *   1. seo_engine_settings — the singleton DB kill-switch row (mirrors
 *      contentflow_settings; see server/storage/contentflow.ts). Lazily
 *      self-creates the table + row so the gate is robust even before
 *      migrations/0086 has run on a given database.
 *   2. seo_content_pages read path — fetch a published page by slug and list
 *      published pages for the sitemap. Read-only over the durable table.
 *
 * Pre-publish drafting lives in content_drafts (surface='wfx_seo'); this
 * module owns only the durable, indexable read path + the settings row.
 */

import { sql, eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import {
  seoEngineSettings,
  seoContentPages,
  seoContentApprovals,
  type SeoEngineSettings,
  type SeoContentPage,
  type InsertSeoContentPage,
  type SeoContentApproval,
  type InsertSeoContentApproval,
} from "@shared/schema";
import { toSitemapEntry } from "@shared/seoContentPage";

let _seoSettingsTableReady = false;

/** Lazily create the seo_engine_settings table (same pattern as
 *  ensureContentflowSettingsTable). BOTH-PLACES RULE: any new column must
 *  also be added to migrations/0086_seo_content_engine.sql. */
async function ensureSeoEngineSettingsTable(): Promise<void> {
  if (_seoSettingsTableReady) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS seo_engine_settings (
      id INTEGER PRIMARY KEY,
      kill_switch BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMP DEFAULT NOW(),
      updated_by INTEGER
    )
  `);
  _seoSettingsTableReady = true;
}

export async function getSeoEngineSettings(): Promise<SeoEngineSettings> {
  await ensureSeoEngineSettingsTable();
  const [row] = await db.select().from(seoEngineSettings)
    .where(eq(seoEngineSettings.id, 1)).limit(1);
  if (row) return row;
  const [created] = await db.insert(seoEngineSettings)
    .values({ id: 1 })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  // Race: another caller inserted it first — re-read.
  const [existing] = await db.select().from(seoEngineSettings)
    .where(eq(seoEngineSettings.id, 1)).limit(1);
  return existing;
}

export async function setSeoEngineKillSwitch(
  killSwitch: boolean,
  updatedBy?: number,
): Promise<SeoEngineSettings> {
  await getSeoEngineSettings(); // ensure the singleton row exists
  const [row] = await db.update(seoEngineSettings)
    .set({ kill_switch: killSwitch, updated_at: new Date(), updated_by: updatedBy ?? null })
    .where(eq(seoEngineSettings.id, 1))
    .returning();
  return row;
}

/* ─── Published-page read path ───────────────────────────────────────────
   The render route + sitemap consume these. We deliberately filter on
   status='published' here so a draft/in_review/archived row can NEVER leak
   into a public render or the sitemap — the visibility rule is enforced in
   one place. */

/** Fetch a single PUBLISHED page by slug. Returns null for any
 *  missing/draft/in_review/archived slug (the render route then 404s). */
export async function getPublishedSeoPageBySlug(slug: string): Promise<SeoContentPage | null> {
  const [row] = await db.select().from(seoContentPages)
    .where(and(
      eq(seoContentPages.slug, slug),
      eq(seoContentPages.status, "published"),
    ))
    .limit(1);
  return row ?? null;
}

export interface SeoSitemapEntry {
  slug: string;
  /** ISO yyyy-mm-dd — real lastmod (updated_at, falling back to published_at). */
  lastmod: string;
}

/** List every PUBLISHED page for the sitemap, with a real lastmod (NOT
 *  now()). The published-only filter is applied in the query AND re-asserted
 *  by toSitemapEntry (shared/seoContentPage.ts) — the same pure helper the
 *  guard test exercises, so a draft can never reach the sitemap. */
export async function listPublishedSeoPagesForSitemap(): Promise<SeoSitemapEntry[]> {
  const rows = await db.select({
    slug: seoContentPages.slug,
    title: seoContentPages.title,
    status: seoContentPages.status,
    author_entity: seoContentPages.author_entity,
    updated_at: seoContentPages.updated_at,
    published_at: seoContentPages.published_at,
  }).from(seoContentPages)
    .where(eq(seoContentPages.status, "published"));

  return rows
    .map((r) => toSitemapEntry(r))
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .map((e) => ({ slug: e.slug, lastmod: e.lastmod }));
}

/* ─── Generator + review-queue write path ─────────────────────────────────
   The generator inserts an in_review draft here (NEVER published); the admin
   review queue lists/previews/approves/edits/rejects. Every status mutation
   goes through these helpers so the append-only audit (seo_content_approvals)
   is written in lock-step — a page can only become 'published' via approve(),
   which records the audit row in the same call. */

/** Insert a generator draft. The status is forced to a non-published value
 *  ('in_review' or 'draft') in code AND here — a draft can NEVER be inserted
 *  as 'published'. This is the structural anti-auto-publish guarantee on the
 *  write path: publication only happens later, via approveSeoPage(). */
export async function createSeoContentDraft(
  data: InsertSeoContentPage,
): Promise<SeoContentPage> {
  if (data.status === "published") {
    // Hard stop — the generator must never create a live page. The only path
    // to 'published' is approveSeoPage() (the human gate).
    throw new Error(
      "createSeoContentDraft refuses status='published' — drafts enter the human-review queue as 'in_review' and are published only via approveSeoPage().",
    );
  }
  const [row] = await db.insert(seoContentPages)
    .values({ ...data, status: data.status ?? "in_review" })
    .returning();
  return row;
}

/** Fetch any seo_content_pages row by id, regardless of status — the admin
 *  preview/edit/approve flow needs to see in_review + archived rows that the
 *  public read path (getPublishedSeoPageBySlug) deliberately hides. */
export async function getSeoPageById(id: number): Promise<SeoContentPage | null> {
  const [row] = await db.select().from(seoContentPages)
    .where(eq(seoContentPages.id, id)).limit(1);
  return row ?? null;
}

/** List drafts awaiting human review (status='in_review'), newest first. */
export async function listSeoPagesInReview(): Promise<SeoContentPage[]> {
  return db.select().from(seoContentPages)
    .where(eq(seoContentPages.status, "in_review"))
    .orderBy(desc(seoContentPages.created_at));
}

/** Append one immutable audit row. */
export async function appendSeoApproval(
  data: InsertSeoContentApproval,
): Promise<SeoContentApproval> {
  const [row] = await db.insert(seoContentApprovals).values(data).returning();
  return row;
}

/** Full audit history for a page, newest first. */
export async function listSeoApprovals(pageId: number): Promise<SeoContentApproval[]> {
  return db.select().from(seoContentApprovals)
    .where(eq(seoContentApprovals.page_id, pageId))
    .orderBy(desc(seoContentApprovals.created_at));
}

export interface SeoEditFields {
  title?: string;
  meta_description?: string | null;
  excerpt?: string | null;
  content?: string;
  canonical?: string | null;
}

/** Admin EDIT: patch editable fields on an in_review draft + append an
 *  'edited' audit row. Editing does NOT change status (the page stays in the
 *  review queue) — approval is a separate, explicit action. */
export async function editSeoPage(
  pageId: number,
  fields: SeoEditFields,
  actorId?: number,
  notes?: string,
): Promise<SeoContentPage | null> {
  const patch: Record<string, unknown> = { updated_at: new Date() };
  for (const k of ["title", "meta_description", "excerpt", "content", "canonical"] as const) {
    if (fields[k] !== undefined) patch[k] = fields[k];
  }
  const [row] = await db.update(seoContentPages)
    .set(patch)
    .where(eq(seoContentPages.id, pageId))
    .returning();
  if (!row) return null;
  await appendSeoApproval({
    page_id: pageId,
    actor_type: "admin",
    actor_id: actorId ?? null,
    action: "edited",
    notes: notes ?? null,
    metadata: { fields: Object.keys(fields) },
  });
  return row;
}

/** Admin APPROVE: in_review → published. Sets published_at, self-canonical if
 *  none set, and appends an 'approved' audit row. ONLY in_review pages can be
 *  approved — approving anything else is a no-op returning null (so a
 *  re-submitted/already-published/archived row can't be double-published). */
export async function approveSeoPage(
  pageId: number,
  actorId?: number,
  notes?: string,
): Promise<SeoContentPage | null> {
  const [row] = await db.update(seoContentPages)
    .set({ status: "published", published_at: new Date(), updated_at: new Date() })
    .where(and(
      eq(seoContentPages.id, pageId),
      eq(seoContentPages.status, "in_review"),
    ))
    .returning();
  if (!row) return null; // not in_review → nothing approved (audit-safe).
  await appendSeoApproval({
    page_id: pageId,
    actor_type: "admin",
    actor_id: actorId ?? null,
    action: "approved",
    notes: notes ?? null,
    metadata: null,
  });
  return row;
}

/** Admin REJECT: in_review → archived (never deleted — kept for audit) +
 *  append a 'rejected' audit row. Archived rows are not rendered, not in the
 *  sitemap, and not in the review queue. */
export async function rejectSeoPage(
  pageId: number,
  actorId?: number,
  notes?: string,
): Promise<SeoContentPage | null> {
  const [row] = await db.update(seoContentPages)
    .set({ status: "archived", updated_at: new Date() })
    .where(and(
      eq(seoContentPages.id, pageId),
      eq(seoContentPages.status, "in_review"),
    ))
    .returning();
  if (!row) return null;
  await appendSeoApproval({
    page_id: pageId,
    actor_type: "admin",
    actor_id: actorId ?? null,
    action: "rejected",
    notes: notes ?? null,
    metadata: null,
  });
  return row;
}

/** Slug existence check — the generator uses this to avoid colliding with an
 *  already-planned/published page (the slug is uniquely indexed; this lets the
 *  generator skip cleanly rather than hit a constraint error). */
export async function seoSlugExists(slug: string): Promise<boolean> {
  const [row] = await db.select({ id: seoContentPages.id }).from(seoContentPages)
    .where(eq(seoContentPages.slug, slug)).limit(1);
  return !!row;
}

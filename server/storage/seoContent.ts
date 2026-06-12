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

import { sql, eq, and } from "drizzle-orm";
import { db } from "../db";
import {
  seoEngineSettings,
  seoContentPages,
  type SeoEngineSettings,
  type SeoContentPage,
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

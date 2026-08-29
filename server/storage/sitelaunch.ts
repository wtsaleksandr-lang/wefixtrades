/**
 * SiteLaunch — storage.
 *
 * Owns the round-trip between the two tables (sitelaunch_sites +
 * sitelaunch_pages) and the `SiteDocument` the renderer consumes:
 *
 *     site row + page rows  --assembleDocument-->  SiteDocument
 *     SiteDocument          --saveDocument----->   site row + page rows
 *
 * The split is deliberate (see shared/schemas/sitelaunch.ts): the public
 * render path fetches one page row, not a whole-site blob.
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "../db";
import {
  sitelaunchSites,
  sitelaunchPages,
  type SitelaunchSite,
  type SitelaunchPage,
  type SiteLaunchSiteStatus,
  type SiteLaunchHostingMode,
  type SiteLaunchDomainStatus,
} from "@shared/schema";
import {
  SITE_DOCUMENT_VERSION,
  isSiteLaunchThemeId,
  safeParseSiteDocument,
  siteBrandSchema,
  siteBusinessSchema,
  type SiteDocument,
  type SitePage,
} from "@shared/sitelaunch/document";

export interface SiteWithPages {
  site: SitelaunchSite;
  pages: SitelaunchPage[];
}

/* ────────────────────────────────────────────────────────────────────────
 * Document assembly
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Join a site row + its page rows back into a `SiteDocument`.
 *
 * Returns a discriminated result rather than throwing: the render route must
 * be able to answer 500-with-a-reason instead of crashing, and the admin UI
 * needs the validation message to tell an operator what is wrong with a
 * hand-edited document.
 */
export function assembleDocument(
  site: SitelaunchSite,
  pages: SitelaunchPage[],
): { ok: true; doc: SiteDocument } | { ok: false; error: string } {
  const settings = (site.settings ?? {}) as Record<string, unknown>;
  const brand = siteBrandSchema.safeParse(settings.brand ?? {});
  const business = siteBusinessSchema.safeParse({
    name: site.business_name,
    ...((settings.business as Record<string, unknown>) ?? {}),
  });

  if (!brand.success) return { ok: false, error: "Stored brand settings are invalid" };
  if (!business.success) return { ok: false, error: "Stored business settings are invalid" };

  const docPages = [...pages]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({
      id: String(p.id),
      slug: p.slug,
      title: p.title,
      nav_label: p.nav_label,
      show_in_nav: p.show_in_nav,
      meta_title: p.meta_title,
      meta_description: p.meta_description,
      sections: p.sections ?? [],
    }));

  return safeParseSiteDocument({
    version: SITE_DOCUMENT_VERSION,
    theme_id: isSiteLaunchThemeId(site.theme_id) ? site.theme_id : "trade-classic",
    brand: brand.data,
    business: business.data,
    pages: docPages,
    footer_note: typeof settings.footer_note === "string" ? settings.footer_note : "",
    show_powered_by: settings.show_powered_by !== false,
  });
}

/* ────────────────────────────────────────────────────────────────────────
 * Reads
 * ──────────────────────────────────────────────────────────────────────── */

export async function getSiteById(id: number): Promise<SitelaunchSite | null> {
  const [row] = await db.select().from(sitelaunchSites).where(eq(sitelaunchSites.id, id)).limit(1);
  return row ?? null;
}

export async function getSiteBySlug(slug: string): Promise<SitelaunchSite | null> {
  const [row] = await db.select().from(sitelaunchSites).where(eq(sitelaunchSites.slug, slug)).limit(1);
  return row ?? null;
}

export async function getSiteByPreviewToken(token: string): Promise<SitelaunchSite | null> {
  const [row] = await db
    .select()
    .from(sitelaunchSites)
    .where(eq(sitelaunchSites.preview_token, token))
    .limit(1);
  return row ?? null;
}

export async function getPages(siteId: number): Promise<SitelaunchPage[]> {
  return db
    .select()
    .from(sitelaunchPages)
    .where(eq(sitelaunchPages.site_id, siteId))
    .orderBy(asc(sitelaunchPages.sort_order), asc(sitelaunchPages.id));
}

export async function getSiteWithPages(id: number): Promise<SiteWithPages | null> {
  const site = await getSiteById(id);
  if (!site) return null;
  return { site, pages: await getPages(id) };
}

export interface ListSitesFilter {
  status?: SiteLaunchSiteStatus;
  clientId?: number;
  limit?: number;
}

export async function listSites(filter: ListSitesFilter = {}): Promise<SitelaunchSite[]> {
  const conditions = [];
  if (filter.status) conditions.push(eq(sitelaunchSites.status, filter.status));
  if (filter.clientId) conditions.push(eq(sitelaunchSites.client_id, filter.clientId));
  const base = db.select().from(sitelaunchSites);
  const scoped = conditions.length ? base.where(and(...conditions)) : base;
  return scoped.orderBy(desc(sitelaunchSites.updated_at)).limit(Math.min(filter.limit ?? 100, 500));
}

/* ────────────────────────────────────────────────────────────────────────
 * Writes
 * ──────────────────────────────────────────────────────────────────────── */

/** 32 bytes of entropy — the preview URL is the only thing protecting an
 *  unpublished draft, so it must not be guessable. */
export function newPreviewToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Reserve a unique hosted slug, appending -2, -3 … on collision. */
export async function reserveSlug(desired: string): Promise<string> {
  const base =
    desired
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "site";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const existing = await getSiteBySlug(candidate);
    if (!existing) return candidate;
  }
  return `${base}-${randomBytes(3).toString("hex")}`;
}

export interface CreateSiteInput {
  clientId?: number | null;
  clientServiceId?: number | null;
  slug: string;
  document: SiteDocument;
}

/** Create a site and all its pages. Always lands as status 'draft'. */
export async function createSite(input: CreateSiteInput): Promise<SiteWithPages> {
  const doc = input.document;
  const [site] = await db
    .insert(sitelaunchSites)
    .values({
      client_id: input.clientId ?? null,
      client_service_id: input.clientServiceId ?? null,
      slug: input.slug,
      business_name: doc.business.name,
      theme_id: doc.theme_id,
      status: "draft",
      settings: {
        brand: doc.brand,
        business: doc.business,
        footer_note: doc.footer_note,
        show_powered_by: doc.show_powered_by,
      },
      preview_token: newPreviewToken(),
      hosting_mode: "not_provisioned",
      domain_status: "not_started",
      last_generated_at: new Date(),
    })
    .returning();

  const pages = await writePages(site.id, doc.pages);
  return { site, pages };
}

/** Replace every page row for a site with the document's pages. */
async function writePages(siteId: number, pages: SitePage[]): Promise<SitelaunchPage[]> {
  const keptIds: number[] = [];
  const written: SitelaunchPage[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const numericId = /^\d+$/.test(page.id) ? Number(page.id) : null;
    const values = {
      site_id: siteId,
      slug: page.slug,
      title: page.title,
      nav_label: page.nav_label,
      sort_order: i,
      show_in_nav: page.show_in_nav,
      meta_title: page.meta_title,
      meta_description: page.meta_description,
      sections: page.sections,
      updated_at: new Date(),
    };

    if (numericId) {
      const [updated] = await db
        .update(sitelaunchPages)
        .set(values)
        .where(and(eq(sitelaunchPages.id, numericId), eq(sitelaunchPages.site_id, siteId)))
        .returning();
      if (updated) {
        keptIds.push(updated.id);
        written.push(updated);
        continue;
      }
    }
    const [created] = await db.insert(sitelaunchPages).values(values).returning();
    keptIds.push(created.id);
    written.push(created);
  }

  // Drop pages the operator removed from the document.
  if (keptIds.length) {
    await db
      .delete(sitelaunchPages)
      .where(
        and(eq(sitelaunchPages.site_id, siteId), sql`${sitelaunchPages.id} NOT IN ${keptIds}`),
      );
  } else {
    await db.delete(sitelaunchPages).where(eq(sitelaunchPages.site_id, siteId));
  }

  return written;
}

/** Persist a whole document over an existing site. */
export async function saveDocument(siteId: number, doc: SiteDocument): Promise<SiteWithPages | null> {
  const [site] = await db
    .update(sitelaunchSites)
    .set({
      business_name: doc.business.name,
      theme_id: doc.theme_id,
      settings: {
        brand: doc.brand,
        business: doc.business,
        footer_note: doc.footer_note,
        show_powered_by: doc.show_powered_by,
      },
      updated_at: new Date(),
    })
    .where(eq(sitelaunchSites.id, siteId))
    .returning();
  if (!site) return null;
  const pages = await writePages(siteId, doc.pages);
  return { site, pages };
}

export async function setStatus(
  siteId: number,
  status: SiteLaunchSiteStatus,
  actorUserId?: number | null,
): Promise<SitelaunchSite | null> {
  const patch: Record<string, unknown> = { status, updated_at: new Date() };
  if (status === "approved") {
    patch.approved_at = new Date();
    patch.approved_by = actorUserId ?? null;
  }
  if (status === "published") patch.published_at = new Date();
  const [row] = await db
    .update(sitelaunchSites)
    .set(patch)
    .where(eq(sitelaunchSites.id, siteId))
    .returning();
  return row ?? null;
}

export async function recordGeneration(
  siteId: number,
  error: string | null,
): Promise<void> {
  await db
    .update(sitelaunchSites)
    .set({ last_generated_at: new Date(), last_generation_error: error, updated_at: new Date() })
    .where(eq(sitelaunchSites.id, siteId));
}

export interface DomainPatch {
  hosting_mode?: SiteLaunchHostingMode;
  custom_domain?: string | null;
  domain_status?: SiteLaunchDomainStatus;
  domain_status_note?: string | null;
}

/**
 * Record what an operator DID about hosting/DNS. Nothing in phase 1
 * provisions anything, so this is an operator-authored log — which is why
 * `domain_status_note` is free text rather than a machine-set field.
 */
export async function updateDomain(siteId: number, patch: DomainPatch): Promise<SitelaunchSite | null> {
  const [row] = await db
    .update(sitelaunchSites)
    .set({ ...patch, updated_at: new Date() })
    .where(eq(sitelaunchSites.id, siteId))
    .returning();
  return row ?? null;
}

/** Fetch one page by site + slug — the public render path. */
export async function getPageBySlug(siteId: number, slug: string): Promise<SitelaunchPage | null> {
  const [row] = await db
    .select()
    .from(sitelaunchPages)
    .where(and(eq(sitelaunchPages.site_id, siteId), eq(sitelaunchPages.slug, slug)))
    .limit(1);
  return row ?? null;
}

/** Used by the admin list view to show page counts without loading sections. */
export async function pageCounts(siteIds: number[]): Promise<Record<number, number>> {
  if (!siteIds.length) return {};
  const rows = await db
    .select({ site_id: sitelaunchPages.site_id, count: sql<number>`count(*)::int` })
    .from(sitelaunchPages)
    .where(inArray(sitelaunchPages.site_id, siteIds))
    .groupBy(sitelaunchPages.site_id);
  const out: Record<number, number> = {};
  for (const r of rows) out[r.site_id] = Number(r.count);
  return out;
}

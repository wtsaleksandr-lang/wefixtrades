/**
 * Pure, dependency-free helpers for the owned-domain SEO content engine.
 *
 * These encode the THREE invariants the engine's foundation must guarantee,
 * in one testable place shared by the server (storage/sitemap/route) and the
 * client (/blog/:slug render):
 *
 *   1. Visibility — ONLY status='published' rows are publicly visible. Draft,
 *      in_review, and archived rows are never rendered and never reach the
 *      sitemap (isPubliclyVisible).
 *   2. Sitemap source — a published row maps to a /blog/<slug> entry with a
 *      REAL lastmod (updated_at → published_at; never now()) (toSitemapEntry).
 *   3. JSON-LD — a published page emits Article JSON-LD carrying the real
 *      author entity for E-E-A-T (buildArticleJsonLd).
 *
 * No DB, no React, no I/O — so the guard test exercises the exact logic the
 * runtime uses.
 */

export const SEO_SITE_URL = "https://wefixtrades.com";
export const SEO_SITE_NAME = "WeFixTrades";

export type SeoVisibilityStatus = "draft" | "in_review" | "published" | "archived";

/** The minimal shape the visibility/sitemap/JSON-LD helpers need. */
export interface SeoPageView {
  slug: string;
  title: string;
  status: SeoVisibilityStatus | string;
  author_entity: string;
  meta_description?: string | null;
  excerpt?: string | null;
  jsonld_type?: string | null;
  canonical?: string | null;
  published_at?: Date | string | null;
  updated_at?: Date | string | null;
}

/** A page is publicly visible (renderable + indexable + sitemap-eligible)
 *  IFF its status is exactly 'published'. Everything else is hidden. */
export function isPubliclyVisible(page: Pick<SeoPageView, "status">): boolean {
  return page.status === "published";
}

export interface SeoSitemapEntry {
  slug: string;
  loc: string;
  /** ISO yyyy-mm-dd — a real signal, never now(). */
  lastmod: string;
}

function toIsoDate(ts: Date | string | null | undefined, fallback: string): string {
  if (!ts) return fallback;
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toISOString().slice(0, 10);
}

/** Map a published page to its sitemap entry. Returns null for any
 *  non-published page so a draft can NEVER be advertised in the sitemap. */
export function toSitemapEntry(
  page: SeoPageView,
  fallbackLastmod = "2026-06-11",
): SeoSitemapEntry | null {
  if (!isPubliclyVisible(page)) return null;
  const lastmod = toIsoDate(page.updated_at ?? page.published_at, fallbackLastmod);
  return { slug: page.slug, loc: `/blog/${page.slug}`, lastmod };
}

/** Build the Article JSON-LD block for a published page. The author entity
 *  is always present (E-E-A-T) — this is what makes the content attributable
 *  to us, the opposite of the anonymous client-facing engine. */
export function buildArticleJsonLd(page: SeoPageView): Record<string, unknown> {
  const absUrl = `${SEO_SITE_URL}/blog/${page.slug}`;
  const published = toIsoOrUndefined(page.published_at);
  const modified = toIsoOrUndefined(page.updated_at) ?? published;
  return {
    "@context": "https://schema.org",
    "@type": page.jsonld_type || "Article",
    headline: page.title,
    description: page.meta_description || page.excerpt || undefined,
    mainEntityOfPage: { "@type": "WebPage", "@id": absUrl },
    url: absUrl,
    author: { "@type": "Organization", name: page.author_entity },
    publisher: { "@type": "Organization", name: SEO_SITE_NAME, url: SEO_SITE_URL },
    datePublished: published,
    dateModified: modified,
  };
}

function toIsoOrUndefined(ts: Date | string | null | undefined): string | undefined {
  if (!ts) return undefined;
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

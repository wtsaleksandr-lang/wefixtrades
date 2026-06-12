/**
 * Public read API for the owned-domain SEO content engine (WP-6 render).
 *
 * Consumed by the client /blog index + /blog/:slug article page.
 *
 *   GET /api/blog/articles        → list of PUBLISHED articles (cards)
 *   GET /api/blog/articles/:slug  → one PUBLISHED article (full body + JSON-LD inputs)
 *
 * No auth — same posture as the public sitemap/marketing endpoints. The
 * read path is intentionally NOT behind the SEO_ENGINE_ENABLED flag: once an
 * admin has reviewed + published a row it is live SEO content and must keep
 * serving. Visibility is governed solely by status='published' (enforced in
 * server/storage/seoContent.ts), so a draft/in_review/archived slug returns
 * 404 here and never renders publicly.
 */

import type { Express, Request, Response } from "express";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { seoContentPages } from "@shared/schema";
import { getPublishedSeoPageBySlug } from "../storage/seoContent";
import { createLogger } from "../lib/logger";

const log = createLogger("SeoBlog");

// Cards can tolerate brief staleness; full article matches.
const CACHE_HEADER = "public, max-age=300, stale-while-revalidate=3600";

export function registerSeoBlogRoutes(app: Express): void {
  /* ─── Published article list (index cards) ─── */
  app.get("/api/blog/articles", async (_req: Request, res: Response) => {
    try {
      const rows = await db.select({
        slug: seoContentPages.slug,
        title: seoContentPages.title,
        excerpt: seoContentPages.excerpt,
        meta_description: seoContentPages.meta_description,
        author_entity: seoContentPages.author_entity,
        published_at: seoContentPages.published_at,
      }).from(seoContentPages)
        .where(eq(seoContentPages.status, "published"));

      res.setHeader("Cache-Control", CACHE_HEADER);
      return res.json({
        articles: rows.map((r) => ({
          slug: r.slug,
          title: r.title,
          excerpt: r.excerpt ?? r.meta_description ?? "",
          author: r.author_entity,
          publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
        })),
      });
    } catch (err) {
      log.error("article list failed", { err: (err as Error).message });
      return res.status(500).json({ error: "Failed to load articles" });
    }
  });

  /* ─── Single published article ─── */
  app.get("/api/blog/articles/:slug", async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    try {
      const page = await getPublishedSeoPageBySlug(slug);
      if (!page) {
        // Draft / in_review / archived / missing all collapse to 404 — no
        // unpublished content is ever served.
        return res.status(404).json({ error: "Article not found" });
      }
      res.setHeader("Cache-Control", CACHE_HEADER);
      return res.json({
        article: {
          slug: page.slug,
          title: page.title,
          metaDescription: page.meta_description ?? "",
          excerpt: page.excerpt ?? "",
          content: page.content,
          jsonldType: page.jsonld_type,
          author: page.author_entity,
          canonical: page.canonical ?? null,
          publishedAt: page.published_at ? new Date(page.published_at).toISOString() : null,
          updatedAt: page.updated_at ? new Date(page.updated_at).toISOString() : null,
        },
      });
    } catch (err) {
      log.error("article fetch failed", { slug, err: (err as Error).message });
      return res.status(500).json({ error: "Failed to load article" });
    }
  });
}

/**
 * Admin SEO review queue — the human-review gate for the owned-domain SEO
 * content engine (generator wave, WP-5).
 *
 * The generator (server/services/seoContent/seoArticleGenerator.ts) files
 * drafts into seo_content_pages with status='in_review'. These admin-only
 * routes let a reviewer LIST those drafts, PREVIEW one (full body + frozen
 * data block + JSON-LD inputs), EDIT it, then APPROVE (→ published, feeds the
 * sitemap), or REJECT (→ archived). Every mutation appends a row to
 * seo_content_approvals (the append-only audit) inside the storage helper.
 *
 *   GET   /api/admin/seo/review/queue          → in_review drafts (cards)
 *   GET   /api/admin/seo/review/:id            → one draft (full body + audit)
 *   PATCH /api/admin/seo/review/:id            → edit title/meta/excerpt/body/canonical
 *   POST  /api/admin/seo/review/:id/approve    → publish
 *   POST  /api/admin/seo/review/:id/reject     → archive
 *
 * NEVER auto-publishes — there is no route that publishes without an explicit
 * admin approve action, and approveSeoPage only promotes an in_review row.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAdmin } from "../auth";
import { createLogger } from "../lib/logger";
import { buildArticleJsonLd } from "@shared/seoContentPage";
import {
  listSeoPagesInReview,
  getSeoPageById,
  listSeoApprovals,
  editSeoPage,
  approveSeoPage,
  rejectSeoPage,
} from "../storage/seoContent";

const log = createLogger("AdminSeoReview");

function adminUserId(req: Request): number | undefined {
  const id = (req as any)?.user?.id;
  return typeof id === "number" ? id : undefined;
}

export function registerAdminSeoReviewRoutes(app: Express): void {
  /* ─── List in_review drafts ─── */
  app.get("/api/admin/seo/review/queue", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const rows = await listSeoPagesInReview();
      res.json({
        drafts: rows.map((r) => ({
          id: r.id,
          slug: r.slug,
          title: r.title,
          excerpt: r.excerpt ?? r.meta_description ?? "",
          status: r.status,
          author: r.author_entity,
          uniqueDataScore: r.unique_data_score ?? null,
          sampleSize:
            (r.original_data as Record<string, unknown> | null)?.sampleSize ?? null,
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        })),
        count: rows.length,
      });
    } catch (err) {
      log.error("review queue list failed", { err: (err as Error).message });
      res.status(500).json({ error: "queue_list_failed" });
    }
  });

  /* ─── Preview one draft (full body + frozen data + JSON-LD + audit) ─── */
  app.get("/api/admin/seo/review/:id", requireAdmin, async (req: Request, res: Response) => {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "invalid_id" });
    try {
      const page = await getSeoPageById(id);
      if (!page) return res.status(404).json({ error: "not_found" });
      const approvals = await listSeoApprovals(id);
      res.json({
        page: {
          id: page.id,
          slug: page.slug,
          title: page.title,
          metaDescription: page.meta_description ?? "",
          excerpt: page.excerpt ?? "",
          content: page.content,
          status: page.status,
          jsonldType: page.jsonld_type,
          author: page.author_entity,
          canonical: page.canonical ?? null,
          originalData: page.original_data ?? null,
          uniqueDataScore: page.unique_data_score ?? null,
          publishedAt: page.published_at ? new Date(page.published_at).toISOString() : null,
          createdAt: page.created_at ? new Date(page.created_at).toISOString() : null,
        },
        // Pre-rendered JSON-LD so the reviewer sees exactly what will ship.
        jsonld: buildArticleJsonLd({
          slug: page.slug,
          title: page.title,
          status: page.status,
          author_entity: page.author_entity,
          meta_description: page.meta_description,
          excerpt: page.excerpt,
          jsonld_type: page.jsonld_type,
          canonical: page.canonical,
          published_at: page.published_at,
          updated_at: page.updated_at,
        }),
        audit: approvals.map((a) => ({
          action: a.action,
          actorType: a.actor_type,
          notes: a.notes ?? null,
          createdAt: a.created_at ? new Date(a.created_at).toISOString() : null,
        })),
      });
    } catch (err) {
      log.error("review preview failed", { id, err: (err as Error).message });
      res.status(500).json({ error: "preview_failed" });
    }
  });

  /* ─── Edit a draft (does not change status) ─── */
  const editSchema = z.object({
    title: z.string().trim().min(1).max(200).optional(),
    meta_description: z.string().max(320).nullable().optional(),
    excerpt: z.string().max(600).nullable().optional(),
    content: z.string().min(1).optional(),
    canonical: z.string().url().max(2048).nullable().optional(),
    notes: z.string().max(2000).optional(),
  });

  app.patch("/api/admin/seo/review/:id", requireAdmin, async (req: Request, res: Response) => {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "invalid_id" });
    const parsed = editSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    }
    const { notes, ...fields } = parsed.data;
    try {
      const updated = await editSeoPage(id, fields, adminUserId(req), notes);
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true, page: { id: updated.id, status: updated.status } });
    } catch (err) {
      log.error("review edit failed", { id, err: (err as Error).message });
      res.status(500).json({ error: "edit_failed" });
    }
  });

  /* ─── Approve → publish ─── */
  const actionSchema = z.object({ notes: z.string().max(2000).optional() });

  app.post("/api/admin/seo/review/:id/approve", requireAdmin, async (req: Request, res: Response) => {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "invalid_id" });
    const parsed = actionSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    try {
      const published = await approveSeoPage(id, adminUserId(req), parsed.data.notes);
      if (!published) {
        // Either missing, or not in_review (already published/archived) — the
        // store only promotes an in_review row, so this is a safe 409.
        return res.status(409).json({ error: "not_in_review", message: "Only in_review drafts can be approved." });
      }
      res.json({ ok: true, page: { id: published.id, slug: published.slug, status: published.status } });
    } catch (err) {
      log.error("review approve failed", { id, err: (err as Error).message });
      res.status(500).json({ error: "approve_failed" });
    }
  });

  /* ─── Reject → archive ─── */
  app.post("/api/admin/seo/review/:id/reject", requireAdmin, async (req: Request, res: Response) => {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "invalid_id" });
    const parsed = actionSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    try {
      const archived = await rejectSeoPage(id, adminUserId(req), parsed.data.notes);
      if (!archived) return res.status(409).json({ error: "not_in_review", message: "Only in_review drafts can be rejected." });
      res.json({ ok: true, page: { id: archived.id, status: archived.status } });
    } catch (err) {
      log.error("review reject failed", { id, err: (err as Error).message });
      res.status(500).json({ error: "reject_failed" });
    }
  });
}

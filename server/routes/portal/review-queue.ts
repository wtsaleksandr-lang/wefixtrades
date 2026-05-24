/**
 * Portal Review-Queue routes.
 *
 * Mounted under /api/portal/articles/* and /api/portal/review-replies/*.
 * Auth: requireClient / requireClientStrict + portalReviewLimit on writes.
 *
 * Extracted from portalRoutes.ts as the next step of the portal sub-registrar
 * refactor (PR #711 plan; PRs #713/#718/#721/#722/#727 established the
 * pattern). Pure code move — zero behaviour change. The parent registrar
 * (registerPortalRoutes) invokes registerPortalReviewQueueRoutes(app) so the
 * wiring in routes/index.ts is unchanged.
 *
 * Articles + review-replies share three local helpers
 * (projectArticleForPortal / projectReviewReplyForPortal /
 * reviewActionErrorResponse) plus the rate-limit middleware
 * portalReviewLimit, so they're kept in one module rather than split.
 *
 * Endpoints
 *   GET    /api/portal/articles
 *   GET    /api/portal/articles/:id
 *   POST   /api/portal/articles/:id/approve
 *   POST   /api/portal/articles/:id/request-changes
 *   POST   /api/portal/articles/:id/reject
 *   GET    /api/portal/review-replies
 *   GET    /api/portal/review-replies/pending
 *   GET    /api/portal/review-replies/:id
 *   POST   /api/portal/review-replies/:id/approve
 *   POST   /api/portal/review-replies/:id/request-changes
 *   POST   /api/portal/review-replies/:id/reject
 */

import type { Express, Request, Response, NextFunction } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireClient, requireClientStrict } from "../../auth";
import { storage } from "../../storage";
import { db } from "../../db";
import { clients, contentDrafts } from "@shared/schema";
import {
  clientApproveDraft,
  clientRequestChanges,
  clientRejectDraft,
} from "../../services/contentflow/approvalService";
import { portalReviewRateLimiter } from "../../services/rateLimiter";
import { createLogger } from "../../lib/logger";

const log = createLogger("PortalReviewQueue");

/** Resolve client_id from the authenticated user's id. Returns null if no client record linked. */
async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

/** Middleware-style helper: resolve client_id or return 403. */
async function withClientId(req: Request, res: Response): Promise<number | null> {
  const clientId = await resolveClientId(req.user!.id);
  if (!clientId) {
    res.status(403).json({ error: "No client record linked to this account", code: "no_client_linked" });
    return null;
  }
  return clientId;
}

export function registerPortalReviewQueueRoutes(app: Express) {
  /**
   * Sprint 8: project an article record for portal consumption — strips
   * admin-only metadata keys (admin_emailed_*, raw WP errors, lock fields)
   * before returning to the client. Keeps the client_review state/note
   * decided_at and the wordpress.post_url that the client legitimately
   * needs to see.
   */
  const projectArticleForPortal = (raw: any) => {
    if (!raw) return raw;
    const meta = (raw.metadata || {}) as Record<string, any>;
    const cr = (meta.client_review || {}) as Record<string, any>;
    const wp = (meta.wordpress || {}) as Record<string, any>;
    const cleanCr = {
      state: cr.state ?? null,
      note: cr.note ?? null,
      decided_at: cr.decided_at ?? null,
    };
    const cleanWp = wp.post_url
      ? { post_url: wp.post_url, published_at: wp.published_at ?? null }
      : undefined;
    const safeMeta: Record<string, any> = {
      ...(cr.state ? { client_review: cleanCr } : {}),
      ...(cleanWp ? { wordpress: cleanWp } : {}),
    };
    return { ...raw, metadata: safeMeta };
  };

  /**
   * Sprint 8 — rate-limit middleware for portal review action endpoints.
   * Per-clientId, 30 actions / 60s. Falls back to user.id if the clients
   * row hasn't been resolved yet (defensive — handler also guards).
   */
  async function portalReviewLimit(req: Request, res: Response, next: NextFunction) {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    const ok = await portalReviewRateLimiter.check(`portal-review:${userId}`);
    if (!ok) {
      return res.status(429).json({ error: "Too many review actions. Please slow down and try again shortly." });
    }
    next();
  }

  /**
   * GET /api/portal/articles
   *
   * Returns the authenticated client's RankFlow article drafts that are
   * ready for or past client review. Filter:
   *   client_id = THIS client AND kind='article' AND surface='rankflow'
   *   AND status IN ('approved','published','rejected')
   * Drafts in 'draft' status (admin still working) are intentionally
   * hidden so clients don't see half-baked work.
   */
  app.get("/api/portal/articles", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const drafts = await db.select({
        id: contentDrafts.id,
        title: contentDrafts.title,
        excerpt: contentDrafts.excerpt,
        status: contentDrafts.status,
        target_url: contentDrafts.target_url,
        metadata: contentDrafts.metadata,
        client_approved_at: contentDrafts.client_approved_at,
        created_at: contentDrafts.created_at,
        updated_at: contentDrafts.updated_at,
      })
        .from(contentDrafts)
        .where(and(
          eq(contentDrafts.client_id, clientId),
          eq(contentDrafts.kind, "article"),
          eq(contentDrafts.surface, "rankflow"),
          sql`${contentDrafts.status} IN ('approved', 'published', 'rejected')`,
        ))
        .orderBy(desc(contentDrafts.created_at))
        .limit(50);

      res.json({ articles: drafts.map(projectArticleForPortal), count: drafts.length });
    } catch (err: any) {
      log.error("[portal/articles] list error:", err.message);
      res.status(500).json({ error: "Failed to load articles" });
    }
  });

  /**
   * GET /api/portal/articles/:id
   *
   * Detail for a single article. Returns 404 if the draft doesn't exist
   * or doesn't belong to this client (deliberately conflated to avoid
   * leaking existence of other clients' drafts).
   */
  app.get("/api/portal/articles/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const draftId = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(draftId)) {
        return res.status(400).json({ error: "id must be a number" });
      }

      const draft = await storage.getContentDraftById(draftId);
      if (!draft || draft.client_id !== clientId || draft.kind !== "article" || draft.surface !== "rankflow") {
        return res.status(404).json({ error: "Article not found" });
      }
      res.json({ article: projectArticleForPortal(draft) });
    } catch (err: any) {
      log.error("[portal/articles] detail error:", err.message);
      res.status(500).json({ error: "Failed to load article" });
    }
  });

  /**
   * Sprint 8: shared error mapper for review actions. Returns generic
   * messages to the client (never raw err.message — that may include
   * PG constraint names or internal state). Audit detail goes to logs.
   */
  function reviewActionErrorResponse(action: string, err: any, res: Response) {
    const code: string | undefined = err?.code;
    if (code === "not_found" || code === "forbidden") {
      return res.status(404).json({ error: "Article not found" });
    }
    if (code === "wrong_kind") {
      return res.status(409).json({ error: "Article does not support client review" });
    }
    log.error(`[portal/articles] ${action} error:`, err?.message || err);
    return res.status(500).json({ error: "Action failed. Please try again." });
  }

  /**
   * POST /api/portal/articles/:id/approve
   * Body: { note?: string }
   * Sprint 8: requireClientStrict (admin role rejected) + per-client rate
   * limit + projected response + generic error messages.
   */
  app.post("/api/portal/articles/:id/approve", requireClientStrict, portalReviewLimit, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const draftId = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(draftId)) return res.status(400).json({ error: "id must be a number" });
      const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 1000) : undefined;

      const updated = await clientApproveDraft({ draftId, clientId, note });
      res.json({ ok: true, article: projectArticleForPortal(updated) });
    } catch (err: any) {
      return reviewActionErrorResponse("approve", err, res);
    }
  });

  /**
   * POST /api/portal/articles/:id/request-changes
   * Body: { note?: string }
   */
  app.post("/api/portal/articles/:id/request-changes", requireClientStrict, portalReviewLimit, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const draftId = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(draftId)) return res.status(400).json({ error: "id must be a number" });
      const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 1000) : undefined;

      const updated = await clientRequestChanges({ draftId, clientId, note });
      res.json({ ok: true, article: projectArticleForPortal(updated) });
    } catch (err: any) {
      return reviewActionErrorResponse("request-changes", err, res);
    }
  });

  /**
   * POST /api/portal/articles/:id/reject
   * Body: { note?: string }
   */
  app.post("/api/portal/articles/:id/reject", requireClientStrict, portalReviewLimit, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const draftId = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(draftId)) return res.status(400).json({ error: "id must be a number" });
      const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 1000) : undefined;

      const updated = await clientRejectDraft({ draftId, clientId, note });
      res.json({ ok: true, article: projectArticleForPortal(updated) });
    } catch (err: any) {
      return reviewActionErrorResponse("reject", err, res);
    }
  });

  /* ═══════════════════════════════════════════════════════════════════
     Sprint 9 — REVIEW-REPLY PORTAL
     Authenticated client views + acts on AI-drafted replies to their
     Google Business reviews. Uses the same approvalService helpers as
     article review so the audit trail stays uniform.
     ═══════════════════════════════════════════════════════════════════ */

  /** Sprint 9: project a review-reply for portal — strip admin email
   *  flags and any raw GBP error strings; expose only what a client
   *  needs to see. */
  const projectReviewReplyForPortal = (raw: any) => {
    if (!raw) return raw;
    const meta = (raw.metadata || {}) as Record<string, any>;
    const cr = (meta.client_review || {}) as Record<string, any>;
    const gbp = (meta.gbp || {}) as Record<string, any>;
    const cleanCr = cr.state
      ? { state: cr.state ?? null, note: cr.note ?? null, decided_at: cr.decided_at ?? null }
      : undefined;
    const cleanGbp = {
      external_review_id: gbp.external_review_id ?? null,
      star_rating: gbp.star_rating ?? null,
      posted_at: gbp.posted_at ?? null,
      queue_status: gbp.queue_status ?? null,
    };
    return {
      id: raw.id,
      title: raw.title,
      body: raw.body,
      status: raw.status,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
      metadata: {
        gbp: cleanGbp,
        ...(cleanCr ? { client_review: cleanCr } : {}),
      },
    };
  };

  /**
   * GET /api/portal/review-replies
   * List drafted/approved/published/rejected review replies for this client.
   */
  app.get("/api/portal/review-replies", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const drafts = await db.select({
        id: contentDrafts.id,
        title: contentDrafts.title,
        body: contentDrafts.body,
        status: contentDrafts.status,
        metadata: contentDrafts.metadata,
        created_at: contentDrafts.created_at,
        updated_at: contentDrafts.updated_at,
      })
        .from(contentDrafts)
        .where(and(
          eq(contentDrafts.client_id, clientId),
          eq(contentDrafts.kind, "review_reply"),
          eq(contentDrafts.surface, "reputationshield"),
          sql`${contentDrafts.status} IN ('draft', 'approved', 'published', 'rejected')`,
        ))
        .orderBy(desc(contentDrafts.created_at))
        .limit(50);

      res.json({ replies: drafts.map(projectReviewReplyForPortal), count: drafts.length });
    } catch (err: any) {
      log.error("[portal/review-replies] list error:", err.message);
      res.status(500).json({ error: "Failed to load review replies" });
    }
  });

  /**
   * GET /api/portal/review-replies/pending
   * Returns review replies awaiting client approval (status='draft').
   * Must be registered before the /:id route to avoid param capture.
   */
  app.get("/api/portal/review-replies/pending", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const drafts = await db.select({
        id: contentDrafts.id,
        title: contentDrafts.title,
        body: contentDrafts.body,
        status: contentDrafts.status,
        metadata: contentDrafts.metadata,
        created_at: contentDrafts.created_at,
        updated_at: contentDrafts.updated_at,
      })
        .from(contentDrafts)
        .where(and(
          eq(contentDrafts.client_id, clientId),
          eq(contentDrafts.kind, "review_reply"),
          eq(contentDrafts.surface, "reputationshield"),
          eq(contentDrafts.status, "draft"),
        ))
        .orderBy(desc(contentDrafts.created_at))
        .limit(50);

      res.json({ replies: drafts.map(projectReviewReplyForPortal), count: drafts.length });
    } catch (err: any) {
      log.error("[portal/review-replies/pending] Error:", { error: err.message });
      res.status(500).json({ error: "Failed to load pending review replies" });
    }
  });

  /**
   * GET /api/portal/review-replies/:id
   * Detail for a single review reply. 404 if missing or cross-client.
   */
  app.get("/api/portal/review-replies/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const draftId = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(draftId)) return res.status(400).json({ error: "id must be a number" });
      const draft = await storage.getContentDraftById(draftId);
      if (!draft || draft.client_id !== clientId || draft.kind !== "review_reply" || draft.surface !== "reputationshield") {
        return res.status(404).json({ error: "Review reply not found" });
      }
      res.json({ reply: projectReviewReplyForPortal(draft) });
    } catch (err: any) {
      log.error("[portal/review-replies] detail error:", err.message);
      res.status(500).json({ error: "Failed to load review reply" });
    }
  });

  /**
   * POST /api/portal/review-replies/:id/approve
   * Reuses clientApproveDraft (kind-aware after Sprint 9 extension).
   */
  app.post("/api/portal/review-replies/:id/approve", requireClientStrict, portalReviewLimit, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const draftId = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(draftId)) return res.status(400).json({ error: "id must be a number" });
      const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 1000) : undefined;
      const updated = await clientApproveDraft({ draftId, clientId, note });
      res.json({ ok: true, reply: projectReviewReplyForPortal(updated) });
    } catch (err: any) {
      return reviewActionErrorResponse("approve", err, res);
    }
  });

  app.post("/api/portal/review-replies/:id/request-changes", requireClientStrict, portalReviewLimit, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const draftId = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(draftId)) return res.status(400).json({ error: "id must be a number" });
      const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 1000) : undefined;
      const updated = await clientRequestChanges({ draftId, clientId, note });
      res.json({ ok: true, reply: projectReviewReplyForPortal(updated) });
    } catch (err: any) {
      return reviewActionErrorResponse("request-changes", err, res);
    }
  });

  app.post("/api/portal/review-replies/:id/reject", requireClientStrict, portalReviewLimit, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const draftId = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(draftId)) return res.status(400).json({ error: "id must be a number" });
      const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 1000) : undefined;
      const updated = await clientRejectDraft({ draftId, clientId, note });
      res.json({ ok: true, reply: projectReviewReplyForPortal(updated) });
    } catch (err: any) {
      return reviewActionErrorResponse("reject", err, res);
    }
  });
}

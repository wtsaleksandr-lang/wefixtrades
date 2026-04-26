/**
 * ContentFlow routes — Sprint 1.
 *
 * Read-only queue endpoint for admins. Returns the most recent drafts so
 * the new pipeline can be inspected without any UI yet. No mutations; no
 * publish-path endpoints yet (those land with Sprint 2+).
 *
 * Also exposes a narrow set of dev-only endpoints (gated by
 * NODE_ENV !== "production") that the Sprint 1 Playwright verification
 * uses to exercise the kernel without invoking the real Anthropic-backed
 * SocialSync generator. DO NOT enable NODE_ENV=development on a
 * customer-facing deployment.
 */
import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { storage } from "../storage";
import { createDraftFromSocialPost } from "../services/contentflow/draftService";
import { generateArticleBody } from "../services/contentflow/articleService";
import {
  autoApproveDraft,
  adminApproveDraft,
  adminRejectDraft,
} from "../services/contentflow/approvalService";

/* ─── Local markdown → HTML helpers (no dep) ──────────────────────────── */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Convert article markdown to a minimal HTML body. Handles ATX headings
 * (## / ###) and blank-line-separated paragraphs. Everything else is
 * HTML-escaped and emitted as plain text — by design, since we have not
 * pulled in a markdown library yet.
 */
function renderArticleHtml(input: { title: string | null; excerpt: string | null; bodyMd: string }): string {
  const blocks = input.bodyMd.split(/\n\s*\n/);
  const rendered: string[] = [];
  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;
    if (block.startsWith("### ")) {
      rendered.push(`<h3>${escapeHtml(block.slice(4).trim())}</h3>`);
    } else if (block.startsWith("## ")) {
      rendered.push(`<h2>${escapeHtml(block.slice(3).trim())}</h2>`);
    } else if (block.startsWith("# ")) {
      rendered.push(`<h2>${escapeHtml(block.slice(2).trim())}</h2>`);
    } else {
      rendered.push(`<p>${escapeHtml(block)}</p>`);
    }
  }
  const body = rendered.join("\n");
  const titleHtml = input.title ? `<h1>${escapeHtml(input.title)}</h1>\n` : "";
  const excerptHtml = input.excerpt ? `<p class="excerpt"><em>${escapeHtml(input.excerpt)}</em></p>\n` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(input.title || "Article")}</title>
</head>
<body>
<article>
${titleHtml}${excerptHtml}${body}
</article>
</body>
</html>
`;
}

export function registerContentFlowRoutes(app: Express): void {
  /**
   * GET /api/admin/contentflow/queue
   *
   * Query params (all optional):
   *   - client_id   number   filter to a single client
   *   - status      string   filter by ContentDraftStatus
   *   - surface     string   'socialsync' | 'rankflow'
   *   - kind        string   'social_post' | 'article' | 'caption'
   *   - limit       number   default 50, max 200
   *   - offset      number   default 0
   */
  app.get("/api/admin/contentflow/queue", requireAdmin, async (req: Request, res: Response) => {
    try {
      const client_id = req.query.client_id !== undefined
        ? parseInt(String(req.query.client_id), 10)
        : undefined;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const surface = typeof req.query.surface === "string" ? req.query.surface : undefined;
      const kind = typeof req.query.kind === "string" ? req.query.kind : undefined;

      const limit = Math.min(
        200,
        Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50),
      );
      const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10) || 0);

      const drafts = await storage.listContentDrafts({
        client_id: Number.isFinite(client_id as number) ? (client_id as number) : undefined,
        status,
        surface,
        kind,
        limit,
        offset,
      });

      res.json({
        drafts,
        count: drafts.length,
        limit,
        offset,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/admin/contentflow/drafts/:id
   *
   * Returns the full picture for a single draft: the draft row itself,
   * the append-only content_approvals trail, and the linked SocialSyncPost
   * (when surface='socialsync'). RankFlow article support lands in a
   * later sprint; for now linked_task is returned as null.
   */
  app.get(
    "/api/admin/contentflow/drafts/:id",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const draftId = parseInt(String(req.params.id), 10);
        if (!Number.isFinite(draftId)) {
          return res.status(400).json({ error: "id must be a number" });
        }
        const draft = await storage.getContentDraftById(draftId);
        if (!draft) return res.status(404).json({ error: "draft not found" });
        const approvals = await storage.listContentApprovals(draftId);
        const linkedSocialPost = draft.linked_social_post_id
          ? await storage.getSocialSyncPostById(draft.linked_social_post_id)
          : null;
        const linkedTask = draft.linked_task_id
          ? await storage.getRankFlowTaskById(draft.linked_task_id)
          : null;
        res.json({ draft, approvals, linkedSocialPost, linkedTask });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  /**
   * POST /api/admin/contentflow/drafts/:id/approve
   * Body: { notes?: string }
   * Admin marks a draft as approved. Records the action in content_approvals
   * with actor_type='admin'.
   */
  app.post(
    "/api/admin/contentflow/drafts/:id/approve",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const draftId = parseInt(String(req.params.id), 10);
        if (!Number.isFinite(draftId)) {
          return res.status(400).json({ error: "id must be a number" });
        }
        const adminUserId = (req.user as any)?.id;
        if (!Number.isFinite(adminUserId)) {
          return res.status(401).json({ error: "missing admin user id" });
        }
        const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;
        const draft = await adminApproveDraft({ draftId, adminUserId, notes });
        res.json({ ok: true, draft });
      } catch (err: any) {
        const status = /not found/i.test(err.message) ? 404
          : /terminal/i.test(err.message) ? 409
          : 500;
        res.status(status).json({ error: err.message });
      }
    },
  );

  /**
   * POST /api/admin/contentflow/drafts/:id/reject
   * Body: { reason?: string }
   * Admin marks a draft as rejected. Records the action in content_approvals
   * with actor_type='admin'.
   */
  app.post(
    "/api/admin/contentflow/drafts/:id/reject",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const draftId = parseInt(String(req.params.id), 10);
        if (!Number.isFinite(draftId)) {
          return res.status(400).json({ error: "id must be a number" });
        }
        const adminUserId = (req.user as any)?.id;
        if (!Number.isFinite(adminUserId)) {
          return res.status(401).json({ error: "missing admin user id" });
        }
        const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;
        const draft = await adminRejectDraft({ draftId, adminUserId, reason });
        res.json({ ok: true, draft });
      } catch (err: any) {
        const status = /not found/i.test(err.message) ? 404
          : /terminal/i.test(err.message) ? 409
          : 500;
        res.status(status).json({ error: err.message });
      }
    },
  );

  /**
   * POST /api/admin/contentflow/drafts/:id/regenerate-article
   *
   * Synchronously runs the AI generation step for an existing RankFlow
   * article draft. Useful when (a) the original background generation
   * failed, or (b) an admin wants a higher-quality re-roll. Replaces
   * title/excerpt/body atomically. Never throws — wraps the service
   * result and returns 422 on generation failure.
   */
  app.post(
    "/api/admin/contentflow/drafts/:id/regenerate-article",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const draftId = parseInt(String(req.params.id), 10);
        if (!Number.isFinite(draftId)) {
          return res.status(400).json({ error: "id must be a number" });
        }
        const result = await generateArticleBody(draftId);
        if (!result.ok) {
          return res.status(422).json({ error: result.error || "generation failed" });
        }
        res.json({ ok: true, draft: result.draft });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  /**
   * GET /api/admin/contentflow/drafts/:id/export.md
   *
   * Returns a markdown document for a RankFlow article draft. Includes a
   * minimal YAML front-matter block (title, excerpt) so the file can be
   * fed straight into a static-site generator or copy-pasted into a CMS.
   * Returns 404 if the draft is not an article or has no body yet.
   */
  app.get(
    "/api/admin/contentflow/drafts/:id/export.md",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const draftId = parseInt(String(req.params.id), 10);
        if (!Number.isFinite(draftId)) {
          return res.status(400).json({ error: "id must be a number" });
        }
        const draft = await storage.getContentDraftById(draftId);
        if (!draft) return res.status(404).json({ error: "draft not found" });
        if (draft.kind !== "article") {
          return res.status(400).json({ error: "draft is not an article" });
        }
        if (!draft.body) {
          return res.status(409).json({ error: "draft has no body yet — generate first" });
        }
        const lines: string[] = [];
        lines.push("---");
        if (draft.title) lines.push(`title: ${JSON.stringify(draft.title)}`);
        if (draft.excerpt) lines.push(`excerpt: ${JSON.stringify(draft.excerpt)}`);
        lines.push(`draft_id: ${draft.id}`);
        lines.push("---");
        lines.push("");
        lines.push(draft.body);
        const out = lines.join("\n");
        res.setHeader("Content-Type", "text/markdown; charset=utf-8");
        res.setHeader("Content-Disposition", `inline; filename="article-${draft.id}.md"`);
        res.send(out);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  /**
   * GET /api/admin/contentflow/drafts/:id/export.html
   *
   * Returns a minimal copy-ready HTML document. Renders the markdown body
   * via a small inline converter (no markdown dependency yet — the user
   * deferred that to a later sprint). Headings (## / ###) become h2/h3,
   * blank-line-separated paragraphs become <p>, everything else is
   * HTML-escaped and wrapped in <pre> for fidelity. Good enough for
   * copy/paste into a CMS; not a fully-featured renderer.
   */
  app.get(
    "/api/admin/contentflow/drafts/:id/export.html",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const draftId = parseInt(String(req.params.id), 10);
        if (!Number.isFinite(draftId)) {
          return res.status(400).json({ error: "id must be a number" });
        }
        const draft = await storage.getContentDraftById(draftId);
        if (!draft) return res.status(404).json({ error: "draft not found" });
        if (draft.kind !== "article") {
          return res.status(400).json({ error: "draft is not an article" });
        }
        if (!draft.body) {
          return res.status(409).json({ error: "draft has no body yet — generate first" });
        }
        const html = renderArticleHtml({
          title: draft.title,
          excerpt: draft.excerpt,
          bodyMd: draft.body,
        });
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Content-Disposition", `inline; filename="article-${draft.id}.html"`);
        res.send(html);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  /* ═══════════════════════════════════════════════════════════════════
     DEV-ONLY endpoints for Sprint 1 verification.
     Gated by NODE_ENV !== "production". Require admin auth.
     Never ship these to a prod deployment — they mutate/delete data.
     ═══════════════════════════════════════════════════════════════════ */
  if (process.env.NODE_ENV !== "production") {
    /**
     * POST /api/admin/contentflow/__dev/simulate-generation
     *
     * Simulates what the SocialSync orchestrator does after a post is
     * successfully generated: persists a realistic SocialSyncPost row
     * (status='ready', quality_score populated) and then runs the
     * ContentFlow kernel hooks — exactly the same function calls the
     * orchestrator makes in its isolated try/catch block.
     *
     * Does NOT call Anthropic. Does NOT enqueue to the publish queue.
     * Does NOT publish to any social platform.
     *
     * Body: { client_id: number, platform?: string, quality_score?: number }
     * Returns: { post_id, draft_id, post_status, draft_status }
     */
    app.post(
      "/api/admin/contentflow/__dev/simulate-generation",
      requireAdmin,
      async (req: Request, res: Response) => {
        try {
          const client_id = parseInt(String(req.body?.client_id), 10);
          if (!Number.isFinite(client_id)) {
            return res.status(400).json({ error: "client_id (number) required in body" });
          }
          const platform = typeof req.body?.platform === "string" ? req.body.platform : "facebook";
          const quality_score = Number.isFinite(req.body?.quality_score)
            ? parseInt(String(req.body.quality_score), 10)
            : 85;
          // Default true to preserve Sprint 1 spec semantics. Sprint 2 tests
          // pass false so the draft lands in 'draft' status — required for
          // exercising the admin Approve / Reject UI buttons.
          const auto_approve = req.body?.auto_approve !== false;

          // 1. Insert a realistic SocialSyncPost (matches what contentGenerator.ts emits).
          const post = await storage.createSocialSyncPost({
            client_id,
            topic_id: null,
            platform,
            post_text:
              "[DEV SIMULATION] Sprint 1 verification post. If you see this in production, something is wrong.",
            caption: null,
            hashtags: null,
            media_plan: null,
            status: "ready",
            quality_score,
            duplicate_hash: null,
            scheduled_for: null,
            created_by_system: true,
          } as any);

          // 2. Run the ContentFlow kernel hooks the orchestrator calls.
          const draft = await createDraftFromSocialPost({ post });
          const final = auto_approve
            ? await autoApproveDraft({
                draftId: draft.id,
                notes: `[DEV SIMULATION] auto-approved — quality score ${quality_score}`,
              })
            : draft;

          // 3. Read back the post to confirm back-ref column was populated.
          const refreshedPost = await storage.getSocialSyncPostById(post.id);

          res.json({
            post_id: post.id,
            draft_id: draft.id,
            post_status: refreshedPost?.status ?? null,
            post_content_draft_id: (refreshedPost as any)?.content_draft_id ?? null,
            draft_status: final.status,
            auto_approved: final.auto_approved,
          });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      },
    );

    /**
     * GET /api/admin/contentflow/__dev/inspect/:draftId
     *
     * Returns the full joined picture for a draft: the draft row, all of
     * its content_approvals rows, and the linked SocialSyncPost (if any).
     * Used by the Playwright spec to assert cross-table invariants.
     */
    app.get(
      "/api/admin/contentflow/__dev/inspect/:draftId",
      requireAdmin,
      async (req: Request, res: Response) => {
        try {
          const draftId = parseInt(String(req.params.draftId), 10);
          if (!Number.isFinite(draftId)) {
            return res.status(400).json({ error: "draftId must be a number" });
          }
          const draft = await storage.getContentDraftById(draftId);
          if (!draft) return res.status(404).json({ error: "draft not found" });
          const approvals = await storage.listContentApprovals(draftId);
          const post = draft.linked_social_post_id
            ? await storage.getSocialSyncPostById(draft.linked_social_post_id)
            : null;
          res.json({ draft, approvals, post });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      },
    );

    /**
     * POST /api/admin/contentflow/__dev/cleanup
     *
     * Deletes a test draft, its approvals, and its linked post. Safe to
     * call with IDs that no longer exist (returns { ok: true, already_gone }).
     *
     * Body: { draft_id: number, post_id?: number }
     */
    app.post(
      "/api/admin/contentflow/__dev/cleanup",
      requireAdmin,
      async (req: Request, res: Response) => {
        try {
          const draft_id = parseInt(String(req.body?.draft_id), 10);
          const post_id_raw = req.body?.post_id;
          const post_id = Number.isFinite(post_id_raw) ? parseInt(String(post_id_raw), 10) : undefined;
          if (!Number.isFinite(draft_id)) {
            return res.status(400).json({ error: "draft_id (number) required in body" });
          }
          const result = await storage.deleteContentDraftCascade(draft_id, post_id);
          res.json({ ok: true, ...result });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      },
    );
  }
}

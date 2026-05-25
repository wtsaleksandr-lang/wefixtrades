/**
 * Portal SocialSync routes.
 *
 * Mounted under /api/portal/socialsync* (plus the legacy
 * /api/portal/socialsync-profile, /api/portal/socialsync-setup, and
 * /api/portal/socialsync-connections/:platform endpoints).
 * Auth: requireClient / requireClientStrict.
 *
 * Extracted from portalRoutes.ts as wave 11 of the portal sub-registrar
 * refactor. Pure code move — zero behaviour change. The parent registrar
 * (registerPortalRoutes) invokes registerPortalSocialsyncRoutes(app) so the
 * wiring in routes/index.ts is unchanged.
 *
 * Endpoints
 *   GET    /api/portal/socialsync-profile
 *   POST   /api/portal/socialsync-setup
 *   GET    /api/portal/socialsync/posts
 *   GET    /api/portal/socialsync/pending
 *   POST   /api/portal/socialsync/posts/:id/approve
 *   POST   /api/portal/socialsync/posts/:id/reject
 *   PATCH  /api/portal/socialsync/posts/:id
 *   GET    /api/portal/socialsync-connections/:platform
 *   GET    /api/portal/socialsync                       (client-facing summary)
 *   PATCH  /api/portal/socialsync/settings
 *   GET    /api/portal/socialsync/facebook-page/:pageId/metadata
 *   PATCH  /api/portal/socialsync/facebook-page/:pageId/metadata
 */

import type { Express, Request, Response, NextFunction } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { requireClient, requireClientStrict } from "../../auth";
import { storage } from "../../storage";
import { db } from "../../db";
import {
  clients,
  clientServices,
  socialsyncPosts,
  socialsyncPublishQueue,
} from "@shared/schema";
import { portalReviewRateLimiter } from "../../services/rateLimiter";
import { createLogger } from "../../lib/logger";
import { writeAudit } from "../../lib/auditLog";
import {
  fetchFacebookPageMetadata,
  updateFacebookPageMetadata,
  type UpdateFacebookPageMetadataInput,
} from "../../services/socialSync/facebookService";

const log = createLogger("PortalSocialsync");

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

/**
 * Sprint 8 — rate-limit middleware for portal review action endpoints.
 * Per-clientId, 30 actions / 60s. Falls back to user.id if the clients
 * row hasn't been resolved yet (defensive — handler also guards).
 *
 * Used by socialsync post approve/reject/patch routes.
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

export function registerPortalSocialsyncRoutes(app: Express) {
  /**
   * GET /api/portal/socialsync-profile
   * Get the client's SocialSync profile.
   */
  app.get("/api/portal/socialsync-profile", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const profile = await storage.getSocialSyncProfile(clientId);
      if (!profile) return res.json({ exists: false });
      res.json(profile);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to load profile" });
    }
  });

  /**
   * POST /api/portal/socialsync-setup
   * Create or update SocialSync profile from onboarding wizard.
   */
  app.post("/api/portal/socialsync-setup", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { niche, location, services, service_focus, tone, frequency, platform_preferences, enabled, autopilot } = req.body;

      const profile = await storage.upsertSocialSyncProfile({
        client_id: clientId,
        enabled: enabled ?? true,
        niche: niche || null,
        location: location || null,
        services: services || null,
        service_focus: service_focus || null,
        tone: tone || "professional",
        frequency: frequency || "3_per_week",
        // Default to autopilot ON — customer expects content to flow after
        // onboarding. They can review each post via the approval queue before
        // it publishes; if they do nothing, posts auto-approve at scheduled time.
        autopilot: autopilot ?? true,
        platform_preferences: platform_preferences || ["facebook", "instagram"],
      } as any);

      await storage.createSocialSyncLog({
        client_id: clientId,
        entity_type: "profile",
        entity_id: profile.id,
        action: "profile.onboarding_completed",
        status: "success",
        details: { source: "portal_setup" },
      });

      res.status(201).json(profile);
    } catch (err: any) {
      log.error("Portal SocialSync setup error:", err);
      res.status(500).json({ error: "Failed to save profile" });
    }
  });

  /**
   * GET /api/portal/socialsync/posts
   * List all social posts (pending + published) for the authenticated
   * client, ordered by most recent first. Used by the portal Social Posts
   * tab to show what's going out on their channels.
   */
  app.get("/api/portal/socialsync/posts", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const rows = await db.select({
        id: socialsyncPosts.id,
        platform: socialsyncPosts.platform,
        post_text: socialsyncPosts.post_text,
        status: socialsyncPosts.status,
        media_plan: socialsyncPosts.media_plan,
        scheduled_at: socialsyncPosts.scheduled_for,
        published_at: socialsyncPosts.published_at,
        created_at: socialsyncPosts.created_at,
      })
        .from(socialsyncPosts)
        .where(eq(socialsyncPosts.client_id, clientId))
        .orderBy(desc(socialsyncPosts.created_at))
        .limit(50);

      res.json({ posts: rows });
    } catch (err) {
      log.error("Portal socialsync posts error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load social posts" });
    }
  });

  /**
   * GET /api/portal/socialsync/pending
   * List posts awaiting customer approval (status=pending_approval),
   * scoped to the authenticated client. Used by the portal approval queue UI.
   */
  app.get("/api/portal/socialsync/pending", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const rows = await db.select({
        id: socialsyncPosts.id,
        platform: socialsyncPosts.platform,
        post_text: socialsyncPosts.post_text,
        hashtags: socialsyncPosts.hashtags,
        media_plan: socialsyncPosts.media_plan,
        scheduled_for: socialsyncPosts.scheduled_for,
        created_at: socialsyncPosts.created_at,
      })
        .from(socialsyncPosts)
        .where(and(
          eq(socialsyncPosts.client_id, clientId),
          eq(socialsyncPosts.status, "pending_approval"),
        ))
        .orderBy(asc(socialsyncPosts.scheduled_for));

      res.json({ posts: rows });
    } catch (err) {
      log.error("Portal socialsync pending error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load pending posts" });
    }
  });

  /**
   * POST /api/portal/socialsync/posts/:id/approve
   * Customer explicitly approves a pending post — flips status to "queued"
   * so the worker will publish at scheduled_for.
   */
  app.post("/api/portal/socialsync/posts/:id/approve", requireClientStrict, portalReviewLimit, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const postId = parseInt(req.params.id as string);
      if (isNaN(postId)) return res.status(400).json({ error: "Invalid post id" });

      const post = await storage.getSocialSyncPostById(postId);
      if (!post || post.client_id !== clientId) return res.status(404).json({ error: "Post not found" });
      if (post.status !== "pending_approval") {
        return res.status(400).json({ error: `Post is "${post.status}" — only pending_approval posts can be approved` });
      }

      const updated = await storage.updateSocialSyncPost(postId, { status: "queued" } as any);
      await storage.createSocialSyncLog({
        client_id: clientId,
        entity_type: "post",
        entity_id: postId,
        action: "post.customer_approved",
        status: "success",
        details: { approved_via: "portal" },
      });

      res.json({ ok: true, post: updated });
    } catch (err) {
      log.error("Portal socialsync approve error:", { error: String(err) });
      res.status(500).json({ error: "Failed to approve post" });
    }
  });

  /**
   * POST /api/portal/socialsync/posts/:id/reject
   * Customer rejects a pending post — cancels the queue item and marks rejected.
   */
  app.post("/api/portal/socialsync/posts/:id/reject", requireClientStrict, portalReviewLimit, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const postId = parseInt(req.params.id as string);
      if (isNaN(postId)) return res.status(400).json({ error: "Invalid post id" });

      const post = await storage.getSocialSyncPostById(postId);
      if (!post || post.client_id !== clientId) return res.status(404).json({ error: "Post not found" });
      if (post.status !== "pending_approval") {
        return res.status(400).json({ error: `Post is "${post.status}" — only pending_approval posts can be rejected` });
      }

      // Mark post rejected. Worker validation will skip it on queue pickup.
      await storage.updateSocialSyncPost(postId, {
        status: "rejected",
        failure_reason: (req.body?.reason as string) || "Rejected by customer",
      } as any);

      // Cancel any pending queue items for this post
      await db.update(socialsyncPublishQueue)
        .set({ status: "cancelled", updated_at: new Date() })
        .where(and(
          eq(socialsyncPublishQueue.post_id, postId),
          sql`${socialsyncPublishQueue.status} IN ('pending', 'locked')`,
        ));

      await storage.createSocialSyncLog({
        client_id: clientId,
        entity_type: "post",
        entity_id: postId,
        action: "post.customer_rejected",
        status: "info",
        details: { rejected_via: "portal", reason: req.body?.reason },
      });

      res.json({ ok: true });
    } catch (err) {
      log.error("Portal socialsync reject error:", { error: String(err) });
      res.status(500).json({ error: "Failed to reject post" });
    }
  });

  /**
   * PATCH /api/portal/socialsync/posts/:id
   * Customer edits a pending post's text/hashtags. After edit the post is
   * considered approved and moves to "queued".
   * Body: { post_text?: string, hashtags?: string[] }
   */
  app.patch("/api/portal/socialsync/posts/:id", requireClientStrict, portalReviewLimit, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const postId = parseInt(req.params.id as string);
      if (isNaN(postId)) return res.status(400).json({ error: "Invalid post id" });

      const post = await storage.getSocialSyncPostById(postId);
      if (!post || post.client_id !== clientId) return res.status(404).json({ error: "Post not found" });
      if (post.status !== "pending_approval") {
        return res.status(400).json({ error: `Post is "${post.status}" — only pending_approval posts can be edited` });
      }

      const { post_text, hashtags } = req.body || {};
      const updates: any = { status: "queued" };
      if (typeof post_text === "string") {
        if (post_text.trim().length < 10) return res.status(400).json({ error: "post_text must be at least 10 characters" });
        if (post_text.length > 3000) return res.status(400).json({ error: "post_text too long" });
        updates.post_text = post_text.trim();
      }
      if (Array.isArray(hashtags)) {
        updates.hashtags = hashtags.slice(0, 30).map((h: any) => String(h));
      }

      const updated = await storage.updateSocialSyncPost(postId, updates);
      await storage.createSocialSyncLog({
        client_id: clientId,
        entity_type: "post",
        entity_id: postId,
        action: "post.customer_edited",
        status: "success",
        details: { edited_fields: Object.keys(updates).filter(k => k !== "status") },
      });

      res.json({ ok: true, post: updated });
    } catch (err) {
      log.error("Portal socialsync edit error:", { error: String(err) });
      res.status(500).json({ error: "Failed to edit post" });
    }
  });

  /**
   * GET /api/portal/socialsync-connections/:platform
   * Check if a platform is connected for the client.
   */
  app.get("/api/portal/socialsync-connections/:platform", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const connections = await storage.listSocialSyncConnections(clientId);
      const conn = connections.find(c => c.platform === req.params.platform);

      res.json({
        connected: conn?.connection_status === "connected" || conn?.connection_status === "expiring_soon",
        status: conn?.connection_status || "not_connected",
        external_page_id: conn?.external_page_id ?? null,
        external_account_id: conn?.external_account_id ?? null,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to check connection" });
    }
  });

  /**
   * GET /api/portal/socialsync
   * Client-facing SocialSync activity report.
   */
  app.get("/api/portal/socialsync", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const profile = await storage.getSocialSyncProfile(clientId);
      const posts = await storage.listSocialSyncPosts(clientId, { limit: 100 });
      const connections = await storage.listSocialSyncConnections(clientId);

      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const thirtyDays = 30 * day;

      // Metrics
      const publishedPosts = posts.filter(p => p.status === "published");
      const publishedThisMonth = publishedPosts.filter(p => p.published_at && (now - new Date(p.published_at).getTime()) < thirtyDays);
      const queuedPosts = posts.filter(p => p.status === "queued" && p.scheduled_for);

      // Next scheduled
      const nextPost = queuedPosts
        .filter(p => p.scheduled_for && new Date(p.scheduled_for).getTime() > now)
        .sort((a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime())[0];

      // Platforms
      const platforms = ["facebook", "instagram", "google_business"].map(p => {
        const conn = connections.find(c => c.platform === p);
        return {
          platform: p === "google_business" ? "Google Business" : p.charAt(0).toUpperCase() + p.slice(1),
          connected: conn?.connection_status === "connected" || conn?.connection_status === "expiring_soon",
        };
      });

      // Client-safe status
      let status: "setup_in_progress" | "needs_connection" | "ready" | "active";
      if (!profile?.niche || !profile?.location) {
        status = "setup_in_progress";
      } else if (!platforms.some(p => p.connected)) {
        status = "needs_connection";
      } else if (publishedPosts.length === 0) {
        status = "ready";
      } else {
        status = "active";
      }

      // Frequency label
      const freqLabels: Record<string, string> = {
        daily: "Daily", "3_per_week": "3x per week", "2_per_week": "2x per week", weekly: "Weekly",
      };

      // Recent published posts (client-safe)
      const recentPosts = publishedPosts.slice(0, 8).map(p => ({
        id: p.id,
        platform: p.platform === "google_business" ? "Google Business" : p.platform.charAt(0).toUpperCase() + p.platform.slice(1),
        caption: (p.caption || p.post_text).slice(0, 120) + ((p.caption || p.post_text).length > 120 ? "..." : ""),
        full_text: p.post_text,
        hashtags: p.hashtags as string[] | null,
        published_at: p.published_at ? new Date(p.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null,
        has_image: !!(p.media_plan as any)?.image_url,
        image_url: (p.media_plan as any)?.image_url || null,
      }));

      // Upcoming scheduled posts
      const upcomingPosts = queuedPosts
        .filter(p => p.scheduled_for && new Date(p.scheduled_for).getTime() > now)
        .sort((a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime())
        .slice(0, 12)
        .map(p => ({
          id: p.id,
          platform: p.platform === "google_business" ? "Google Business" : p.platform.charAt(0).toUpperCase() + p.platform.slice(1),
          caption: (p.caption || p.post_text).slice(0, 120) + ((p.caption || p.post_text).length > 120 ? "..." : ""),
          full_text: p.post_text,
          hashtags: p.hashtags as string[] | null,
          scheduled_for: new Date(p.scheduled_for!).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
          scheduled_date: new Date(p.scheduled_for!).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }),
          has_image: !!(p.media_plan as any)?.image_url,
          image_url: (p.media_plan as any)?.image_url || null,
        }));

      res.json({
        status,
        summary: {
          posts_this_month: publishedThisMonth.length,
          total_published: publishedPosts.length,
          active_platforms: platforms.filter(p => p.connected).length,
          posting_frequency: freqLabels[profile?.frequency || "3_per_week"] || "3x per week",
          autopilot: profile?.autopilot || false,
        },
        next_scheduled: nextPost ? {
          platform: nextPost.platform === "google_business" ? "Google Business" : nextPost.platform.charAt(0).toUpperCase() + nextPost.platform.slice(1),
          scheduled_for: new Date(nextPost.scheduled_for!).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
        } : null,
        platforms,
        recent_posts: recentPosts,
        upcoming_posts: upcomingPosts,
      });
    } catch (err: any) {
      log.error("Portal SocialSync report error:", err);
      res.status(500).json({ error: "Failed to load SocialSync report" });
    }
  });

  /**
   * PATCH /api/portal/socialsync/settings
   * Body: { auto_post_paused: boolean }
   * Stores in the socialsync client_service metadata.
   */
  app.patch("/api/portal/socialsync/settings", requireClientStrict, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { auto_post_paused } = req.body;
      if (typeof auto_post_paused !== "boolean") {
        return res.status(400).json({ error: "auto_post_paused must be a boolean" });
      }

      const services = await db.select({
        id: clientServices.id,
        metadata: clientServices.metadata,
      })
        .from(clientServices)
        .where(and(
          eq(clientServices.client_id, clientId),
          sql`${clientServices.service_id} LIKE '%socialsync%'`,
          eq(clientServices.status, "active"),
        ))
        .limit(1);

      if (services.length === 0) {
        return res.status(404).json({ error: "No active SocialSync service found" });
      }

      const svc = services[0];
      const existing = (svc.metadata as Record<string, any>) ?? {};
      await db.update(clientServices)
        .set({ metadata: { ...existing, auto_post_paused }, updated_at: new Date() })
        .where(eq(clientServices.id, svc.id));

      log.info("[portal/socialsync/settings] auto_post_paused toggled", { clientId, auto_post_paused });
      res.json({ ok: true, auto_post_paused });
    } catch (err: any) {
      log.error("[portal/socialsync/settings] Error:", { error: err.message });
      res.status(500).json({ error: "Failed to update SocialSync settings" });
    }
  });

  /**
   * GET /api/portal/socialsync/facebook-page/:pageId/metadata
   * Returns the editable Facebook Page fields (name, about, category +
   * available category_list) by reading from Meta's Graph API using the
   * page-level token we stored at OAuth time.
   *
   * Ownership: the page must already be the one this client connected.
   * `fetchFacebookPageMetadata` enforces this; we additionally pre-check so
   * we can return a clean 404 instead of a generic 500.
   */
  app.get("/api/portal/socialsync/facebook-page/:pageId/metadata", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const pageId = String(req.params.pageId || "").trim();
      if (!pageId) return res.status(400).json({ error: "pageId required" });

      // Pre-check ownership for a friendlier error than the generic
      // "Page not connected" thrown inside the service.
      const connections = await storage.listSocialSyncConnections(clientId);
      const owns = connections.some(
        (c) => c.platform === "facebook" && c.external_page_id === pageId,
      );
      if (!owns) return res.status(404).json({ error: "Page not connected to this account" });

      const metadata = await fetchFacebookPageMetadata(clientId, pageId);
      res.json(metadata);
    } catch (err: any) {
      log.error("[portal/socialsync/facebook-page metadata GET] Error", { error: err.message });
      res.status(502).json({ error: err.message || "Failed to load page metadata" });
    }
  });

  /**
   * PATCH /api/portal/socialsync/facebook-page/:pageId/metadata
   * Body: { name?: string; about?: string; category?: string }
   *
   * Updates the editable Facebook Page metadata fields. Returns the
   * post-update snapshot so the UI can echo what Meta accepted (e.g. name
   * changes silently no-op when the Page owner hasn't enabled name-change).
   *
   * Audited via writeAudit so the admin reader and Meta App Review
   * auditors can see who changed what and when.
   */
  app.patch("/api/portal/socialsync/facebook-page/:pageId/metadata", requireClientStrict, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const pageId = String(req.params.pageId || "").trim();
      if (!pageId) return res.status(400).json({ error: "pageId required" });

      // Pre-check ownership.
      const connections = await storage.listSocialSyncConnections(clientId);
      const owns = connections.some(
        (c) => c.platform === "facebook" && c.external_page_id === pageId,
      );
      if (!owns) return res.status(404).json({ error: "Page not connected to this account" });

      // Whitelist + light validation. Anything else is silently dropped.
      const body = (req.body ?? {}) as Record<string, unknown>;
      const update: UpdateFacebookPageMetadataInput = {};
      if (typeof body.name === "string") {
        const v = body.name.trim();
        if (v.length < 2 || v.length > 75) {
          return res.status(400).json({ error: "name must be 2–75 characters" });
        }
        update.name = v;
      }
      if (typeof body.about === "string") {
        const v = body.about.trim();
        if (v.length > 255) {
          return res.status(400).json({ error: "about must be 255 characters or fewer" });
        }
        update.about = v;
      }
      if (typeof body.category === "string") {
        const v = body.category.trim();
        if (v.length < 2 || v.length > 64) {
          return res.status(400).json({ error: "category must be 2–64 characters" });
        }
        update.category = v;
      }
      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: "No editable fields supplied" });
      }

      // Capture the before-state for the audit row.
      let before: Record<string, unknown> | null = null;
      try {
        before = await fetchFacebookPageMetadata(clientId, pageId);
      } catch {
        // If the read fails we still attempt the write so the customer
        // isn't blocked by a transient Meta read error.
        before = null;
      }

      const after = await updateFacebookPageMetadata(clientId, pageId, update);

      void writeAudit({
        actorId: req.user?.id ?? null,
        actorType: "user",
        action: "socialsync.facebook_page.metadata_update",
        entityType: "facebook_page",
        entityId: pageId,
        before: before ?? undefined,
        after,
        metadata: { client_id: clientId, fields_changed: Object.keys(update) },
        req,
      });

      res.json(after);
    } catch (err: any) {
      log.error("[portal/socialsync/facebook-page metadata PATCH] Error", { error: err.message });
      res.status(502).json({ error: err.message || "Failed to update page metadata" });
    }
  });
}

/**
 * Portal Reputation routes.
 *
 * Mounted under /api/portal/reputation/* (plus the legacy /api/portal/reputation
 * summary endpoint). Auth: requireClient / requireClientStrict.
 *
 * Extracted from portalRoutes.ts as the second step of the portal sub-registrar
 * refactor (PR #711 plan; PR #713 established the pattern with quotequick.ts).
 * Pure code move — zero behaviour change. The parent registrar
 * (registerPortalRoutes) invokes registerPortalReputationRoutes(app) so the
 * wiring in routes/index.ts is unchanged.
 *
 * Endpoints
 *   GET    /api/portal/reputation                       (client-facing summary)
 *   GET    /api/portal/reputation/overview
 *   GET    /api/portal/reputation/reviews
 *   GET    /api/portal/reputation/feedback
 *   GET    /api/portal/reputation/config
 *   PATCH  /api/portal/reputation/settings
 *   GET    /api/portal/reputation/widget
 *   PATCH  /api/portal/reputation/widget
 *   POST   /api/portal/reputation/request-review
 *   GET    /api/portal/reputation/qr
 *   GET    /api/portal/reputation/request-stats
 *   GET    /api/portal/reputation/google-status
 *   GET    /api/portal/reputation/google-connect
 *   POST   /api/portal/reputation/google-disconnect
 *   GET    /api/portal/reputation/competitors
 *   GET    /api/portal/reputation/competitors/trend
 *   POST   /api/portal/reputation/competitors
 *   DELETE /api/portal/reputation/competitors/:id
 *   PATCH  /api/portal/reputation/auto-reply-settings
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireClient, requireClientStrict } from "../../auth";
import { storage } from "../../storage";
import { db } from "../../db";
import {
  clients,
  clientServices,
  reviewRequests,
  monitoredReviews,
} from "@shared/schema";
import { createLogger } from "../../lib/logger";

const log = createLogger("PortalReputation");

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

export function registerPortalReputationRoutes(app: Express) {
  /**
   * GET /api/portal/reputation
   * Client-facing reputation report — clean, positive-framed metrics.
   * No internal noise (errors, queue states, system details).
   */
  app.get("/api/portal/reputation", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const allReviews = await storage.listReviews(clientId, { limit: 200 });
      const requests = await storage.listReviewRequests(clientId, 200);

      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const thirtyDays = 30 * day;

      // Review metrics
      const recentReviews = allReviews.filter(r => r.review_time && (now - new Date(r.review_time).getTime()) < thirtyDays);
      const prevMonthReviews = allReviews.filter(r => r.review_time && (now - new Date(r.review_time).getTime()) >= thirtyDays && (now - new Date(r.review_time).getTime()) < 2 * thirtyDays);
      const ratings = allReviews.filter(r => r.star_rating).map(r => r.star_rating!);
      const recentRatings = recentReviews.filter(r => r.star_rating).map(r => r.star_rating!);
      const prevRatings = prevMonthReviews.filter(r => r.star_rating).map(r => r.star_rating!);
      const avgRating = ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;
      const avgRatingRecent = recentRatings.length > 0 ? Math.round((recentRatings.reduce((a, b) => a + b, 0) / recentRatings.length) * 10) / 10 : null;
      const avgRatingPrev = prevRatings.length > 0 ? Math.round((prevRatings.reduce((a, b) => a + b, 0) / prevRatings.length) * 10) / 10 : null;

      // Replies — client-friendly language
      const repliedCount = allReviews.filter(r => r.reply_status === "auto_replied" || r.reply_status === "manually_replied" || r.has_existing_owner_reply).length;
      const replyRate = allReviews.length > 0 ? Math.round((repliedCount / allReviews.length) * 100) : null;

      // Requests — client-friendly
      const sentRequests = requests.filter(r => r.status === "sent" || r.status === "delivered");
      const attributed = sentRequests.filter(r => r.attributed_review_id);
      const responseRate = sentRequests.length > 0 ? Math.round((attributed.length / sentRequests.length) * 100) : null;

      // Avg days to review
      const daysList: number[] = [];
      for (const req of attributed) {
        if (req.sent_at) {
          const matchedReview = allReviews.find(r => r.id === req.attributed_review_id);
          if (matchedReview?.review_time) {
            const d = (new Date(matchedReview.review_time).getTime() - new Date(req.sent_at).getTime()) / day;
            if (d >= 0) daysList.push(d);
          }
        }
      }
      const avgDays = daysList.length > 0 ? Math.round((daysList.reduce((a, b) => a + b, 0) / daysList.length) * 10) / 10 : null;

      // Weekly trend (last 8 weeks)
      const weeklyTrend: { week: string; reviews: number }[] = [];
      for (let i = 7; i >= 0; i--) {
        const weekStart = now - (i + 1) * 7 * day;
        const weekEnd = now - i * 7 * day;
        const count = allReviews.filter(r => r.review_time && new Date(r.review_time).getTime() >= weekStart && new Date(r.review_time).getTime() < weekEnd).length;
        weeklyTrend.push({ week: new Date(weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" }), reviews: count });
      }

      // Latest positive reviews (client-safe subset)
      const latestPositive = allReviews
        .filter(r => (r.star_rating || 0) >= 4 && r.review_text)
        .slice(0, 5)
        .map(r => ({
          reviewer: r.reviewer_name || "A customer",
          rating: r.star_rating,
          text: (r.review_text || "").slice(0, 150) + ((r.review_text || "").length > 150 ? "..." : ""),
          date: r.review_time ? new Date(r.review_time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null,
          replied: r.reply_status === "auto_replied" || r.reply_status === "manually_replied" || r.has_existing_owner_reply,
        }));

      // Recent replies we posted
      const recentReplies = allReviews
        .filter(r => (r.reply_status === "auto_replied" || r.reply_status === "manually_replied") && r.reply_posted_at)
        .sort((a, b) => new Date(b.reply_posted_at!).getTime() - new Date(a.reply_posted_at!).getTime())
        .slice(0, 3)
        .map(r => ({
          reviewer: r.reviewer_name || "A customer",
          rating: r.star_rating,
          date: r.reply_posted_at ? new Date(r.reply_posted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null,
        }));

      res.json({
        summary: {
          reviews_this_month: recentReviews.length,
          reviews_last_month: prevMonthReviews.length,
          reviews_change: recentReviews.length - prevMonthReviews.length,
          total_reviews: allReviews.length,
          average_rating: avgRating,
          average_rating_this_month: avgRatingRecent,
          average_rating_last_month: avgRatingPrev,
          reply_rate: replyRate,
        },
        activity: {
          reviews_responded_to: repliedCount,
          review_requests_sent: sentRequests.length,
          reviews_generated: attributed.length,
          estimated_response_rate: responseRate,
          avg_days_to_review: avgDays,
        },
        weekly_trend: weeklyTrend,
        latest_reviews: latestPositive,
        recent_replies: recentReplies,
      });
    } catch (err: any) {
      log.error("Portal reputation error:", err);
      res.status(500).json({ error: "Failed to load reputation report" });
    }
  });

  // ═══════════════════════════════════════════════
  // ReputationShield — Client Portal
  // ═══════════════════════════════════════════════

  /**
   * GET /api/portal/reputation/overview
   * Summary metrics for the client's reputation status.
   */
  app.get("/api/portal/reputation/overview", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Reviews stats
      const [reviewStats] = await db.select({
        total: sql<number>`count(*)::int`,
        averageRating: sql<number>`coalesce(round(avg(${monitoredReviews.rating})::numeric, 2), 0)::float`,
        withResponse: sql<number>`count(*) filter (where ${monitoredReviews.response_text} is not null)::int`,
        last30Days: sql<number>`count(*) filter (where ${monitoredReviews.first_seen_at} >= ${thirtyDaysAgo})::int`,
        last7Days: sql<number>`count(*) filter (where ${monitoredReviews.first_seen_at} >= ${sevenDaysAgo})::int`,
        lowRatingNoResponse: sql<number>`count(*) filter (where ${monitoredReviews.rating} <= 2 and ${monitoredReviews.response_text} is null)::int`,
        withDraft: sql<number>`count(*) filter (where ${monitoredReviews.draft_response} is not null)::int`,
      }).from(monitoredReviews)
        .where(eq(monitoredReviews.client_id, clientId));

      // Review requests stats
      const [requestStats] = await db.select({
        totalSent: sql<number>`count(*) filter (where ${reviewRequests.status} != 'pending')::int`,
        pendingFollowups: sql<number>`count(*) filter (where ${reviewRequests.status} = 'sent' and ${reviewRequests.next_followup_at} is not null)::int`,
        routedPositive: sql<number>`count(*) filter (where ${reviewRequests.status} = 'routed_positive')::int`,
        feedbackCaptured: sql<number>`count(*) filter (where ${reviewRequests.status} = 'feedback_captured')::int`,
      }).from(reviewRequests)
        .where(eq(reviewRequests.client_id, clientId));

      // Private feedback count
      const [feedbackCount] = await db.select({
        total: sql<number>`count(*) filter (where ${reviewRequests.internal_feedback} is not null)::int`,
      }).from(reviewRequests)
        .where(eq(reviewRequests.client_id, clientId));

      const noResponse = (reviewStats?.total ?? 0) - (reviewStats?.withResponse ?? 0);

      res.json({
        reviews: {
          total: reviewStats?.total ?? 0,
          averageRating: reviewStats?.averageRating ?? 0,
          last30Days: reviewStats?.last30Days ?? 0,
          last7Days: reviewStats?.last7Days ?? 0,
          withoutResponse: noResponse,
          lowRatingNoResponse: reviewStats?.lowRatingNoResponse ?? 0,
          withDraft: reviewStats?.withDraft ?? 0,
        },
        requests: {
          totalSent: requestStats?.totalSent ?? 0,
          pendingFollowups: requestStats?.pendingFollowups ?? 0,
          routedPositive: requestStats?.routedPositive ?? 0,
          feedbackCaptured: feedbackCount?.total ?? 0,
        },
      });
    } catch (err: any) {
      log.error("[portal] reputation overview error:", err.message);
      res.status(500).json({ error: "Failed to load reputation data" });
    }
  });

  /**
   * GET /api/portal/reputation/reviews
   * Recent public reviews for the client.
   */
  app.get("/api/portal/reputation/reviews", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

      const rows = await db.select({
        id: monitoredReviews.id,
        reviewer_name: monitoredReviews.reviewer_name,
        rating: monitoredReviews.rating,
        review_text: monitoredReviews.review_text,
        published_at: monitoredReviews.published_at,
        response_text: monitoredReviews.response_text,
        response_date: monitoredReviews.response_date,
        is_new: monitoredReviews.is_new,
        draft_response: monitoredReviews.draft_response,
        platform: monitoredReviews.platform,
        first_seen_at: monitoredReviews.first_seen_at,
      }).from(monitoredReviews)
        .where(eq(monitoredReviews.client_id, clientId))
        .orderBy(desc(monitoredReviews.published_at))
        .limit(limit).offset(offset);

      const [countRow] = await db.select({ total: sql<number>`count(*)::int` })
        .from(monitoredReviews)
        .where(eq(monitoredReviews.client_id, clientId));

      res.json({ data: rows, total: countRow?.total ?? 0 });
    } catch (err: any) {
      log.error("[portal] reputation reviews error:", err.message);
      res.status(500).json({ error: "Failed to load reviews" });
    }
  });

  /**
   * GET /api/portal/reputation/feedback
   * Private feedback captured through the sentiment gate.
   */
  app.get("/api/portal/reputation/feedback", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const rows = await db.select({
        id: reviewRequests.id,
        customer_name: reviewRequests.customer_name,
        internal_feedback: reviewRequests.internal_feedback,
        sentiment: reviewRequests.sentiment,
        trigger_source: reviewRequests.trigger_source,
        created_at: reviewRequests.created_at,
        completed_at: reviewRequests.completed_at,
      }).from(reviewRequests)
        .where(and(
          eq(reviewRequests.client_id, clientId),
          sql`${reviewRequests.internal_feedback} is not null`,
        ))
        .orderBy(desc(reviewRequests.completed_at))
        .limit(20);

      res.json({ data: rows });
    } catch (err: any) {
      log.error("[portal] reputation feedback error:", err.message);
      res.status(500).json({ error: "Failed to load feedback" });
    }
  });

  /**
   * GET /api/portal/reputation/config
   * Returns client's ReputationShield tier, features, and settings.
   */
  app.get("/api/portal/reputation/config", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { extractTier, canAccessFeature, mergeSettings, TIER_LABELS, FEATURE_LABELS, FEATURE_MIN_TIER, TIER_FEATURES } = await import("@shared/reputationConfig");
      const { storage } = await import("../../storage");

      const svc = await storage.getClientReputationService(clientId);
      if (!svc) {
        return res.json({ active: false, tier: null, features: {}, settings: null });
      }

      const tier = extractTier(svc.serviceId);
      const settings = mergeSettings(svc.metadata?.reputation_settings);
      const features = tier ? TIER_FEATURES[tier] : {};

      // Build upgrade hints for locked features
      const upgradeHints: Record<string, string> = {};
      if (tier) {
        for (const [feature, minTier] of Object.entries(FEATURE_MIN_TIER)) {
          if (!canAccessFeature(tier, feature as any)) {
            upgradeHints[feature] = `Available on ${TIER_LABELS[minTier as keyof typeof TIER_LABELS]} plan`;
          }
        }
      }

      res.json({
        active: true,
        tier,
        tierLabel: tier ? TIER_LABELS[tier] : null,
        features,
        settings,
        upgradeHints,
      });
    } catch (err: any) {
      log.error("[portal] reputation config error:", err.message);
      res.status(500).json({ error: "Failed to load config" });
    }
  });

  /**
   * PATCH /api/portal/reputation/settings
   * Update client's ReputationShield settings (channel, reminders, etc).
   */
  app.patch("/api/portal/reputation/settings", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { mergeSettings } = await import("@shared/reputationConfig");
      const { storage } = await import("../../storage");

      const svc = await storage.getClientReputationService(clientId);
      if (!svc) {
        return res.status(404).json({ error: "No ReputationShield service found" });
      }

      const current = svc.metadata?.reputation_settings ?? {};
      const updated = mergeSettings({ ...current, ...req.body });
      const metadata = { ...svc.metadata, reputation_settings: updated };

      await storage.updateClientServiceMetadata(clientId, svc.serviceId, metadata);

      res.json({ ok: true, settings: updated });
    } catch (err: any) {
      log.error("[portal] reputation settings error:", err.message);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  /**
   * GET /api/portal/reputation/widget
   * Returns widget setup info: token, embed code, current settings.
   */
  app.get("/api/portal/reputation/widget", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { extractTier, canAccessFeature, mergeWidgetSettings, mergePlatformConnections } = await import("@shared/reputationConfig");
      const { storage } = await import("../../storage");

      // Check feature access
      const svc = await storage.getClientReputationService(clientId);
      const tier = svc ? extractTier(svc.serviceId) : null;

      // Badge available on all tiers; carousel on Pro+
      const badgeAccess = !!tier;
      const carouselAccess = canAccessFeature(tier, "reviewWidget");

      if (!tier) {
        return res.json({ active: false, widgetAccess: false });
      }

      // Ensure widget token exists
      const widgetToken = await storage.ensureWidgetToken(clientId);

      // Load widget settings
      const ws = mergeWidgetSettings(svc?.metadata?.reputation_settings?.widget);

      /* Build the "connected sources" list so the portal can tell the
         customer which platforms the widget will pull from. Google is
         resolved via clients.google_place_id; Facebook via
         clients.facebook_page_url; Yelp + Trustpilot live on the
         reputation settings.platforms object. */
      const client = await storage.getClientById(clientId);
      const platforms = mergePlatformConnections(svc?.metadata?.reputation_settings?.platforms);
      const connectedSources: string[] = [];
      if (client?.google_place_id) connectedSources.push("google");
      if (client?.facebook_page_url) connectedSources.push("facebook");
      if (platforms.yelp_url) connectedSources.push("yelp");
      if (platforms.trustpilot_domain) connectedSources.push("trustpilot");

      // Build base URL for embed code
      const origin = req.headers.origin || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : `${req.protocol}://${req.get("host")}`);

      res.json({
        active: true,
        widgetToken,
        badgeAccess,
        carouselAccess,
        settings: ws,
        sources: ["google", "facebook", "yelp", "trustpilot"],
        connectedSources,
        embedCode: {
          badge: `<script src="${origin}/widget/embed.js" data-wft-widget="badge" data-wft-token="${widgetToken}"></script>`,
          carousel: carouselAccess
            ? `<script src="${origin}/widget/embed.js" data-wft-widget="carousel" data-wft-token="${widgetToken}"></script>`
            : null,
        },
      });
    } catch (err: any) {
      log.error("[portal] widget info error:", err.message);
      res.status(500).json({ error: "Failed to load widget info" });
    }
  });

  /**
   * PATCH /api/portal/reputation/widget
   * Update widget settings.
   */
  app.patch("/api/portal/reputation/widget", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { mergeSettings, mergeWidgetSettings } = await import("@shared/reputationConfig");
      const { storage } = await import("../../storage");

      const svc = await storage.getClientReputationService(clientId);
      if (!svc) return res.status(404).json({ error: "No ReputationShield service found" });

      const currentSettings = svc.metadata?.reputation_settings ?? {};
      const currentWidget = currentSettings.widget ?? {};
      const updatedWidget = mergeWidgetSettings({ ...currentWidget, ...req.body });
      const updatedSettings = mergeSettings({ ...currentSettings, widget: updatedWidget });
      const metadata = { ...svc.metadata, reputation_settings: updatedSettings };

      await storage.updateClientServiceMetadata(clientId, svc.serviceId, metadata);

      res.json({ ok: true, settings: updatedWidget });
    } catch (err: any) {
      log.error("[portal] widget settings error:", err.message);
      res.status(500).json({ error: "Failed to update widget settings" });
    }
  });

  // ═══════════════════════════════════════════════
  // Manual Review Requests + QR
  // ═══════════════════════════════════════════════

  /** Rate limit: max 20 manual requests per client per day. */
  const manualRequestCounts = new Map<string, { count: number; resets: number }>();
  const MANUAL_DAILY_LIMIT = 20;

  function checkManualRateLimit(clientId: number): boolean {
    const key = `manual:${clientId}`;
    const now = Date.now();
    const entry = manualRequestCounts.get(key);
    if (!entry || now > entry.resets) {
      manualRequestCounts.set(key, { count: 1, resets: now + 24 * 60 * 60 * 1000 });
      return true;
    }
    if (entry.count >= MANUAL_DAILY_LIMIT) return false;
    entry.count++;
    return true;
  }

  /**
   * POST /api/portal/reputation/request-review
   * Client sends a review request to a specific customer.
   */
  app.post("/api/portal/reputation/request-review", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { customer_name, customer_email, customer_phone, job_label } = req.body;

      if (!customer_name || typeof customer_name !== "string" || customer_name.trim().length < 2) {
        return res.status(400).json({ error: "Customer name is required" });
      }
      if (!customer_email && !customer_phone) {
        return res.status(400).json({ error: "Email or phone number is required" });
      }

      // Rate limit
      if (!checkManualRateLimit(clientId)) {
        return res.status(429).json({ error: "Daily limit reached (20 review requests per day). Try again tomorrow." });
      }

      const { createManualReviewRequest, processReviewRequest } = await import("../../services/reviewRequestService");

      const result = await createManualReviewRequest({
        clientId,
        customerName: customer_name.trim(),
        customerEmail: customer_email?.trim() || undefined,
        customerPhone: customer_phone?.trim() || undefined,
        jobLabel: job_label?.trim() || undefined,
        triggerSource: "portal_manual",
      });

      if (!result.created) {
        return res.status(409).json({ error: result.reason });
      }

      // Send immediately
      if (result.reviewRequest) {
        processReviewRequest(result.reviewRequest).catch((err: any) => {
          log.error("[portal] Review request send error:", err.message);
        });
      }

      res.status(201).json({ ok: true, id: result.reviewRequest?.id });
    } catch (err: any) {
      log.error("[portal] request-review error:", err.message);
      res.status(500).json({ error: "Failed to send review request" });
    }
  });

  /**
   * GET /api/portal/reputation/qr
   * Returns the client's QR review collection URL and widget token.
   */
  app.get("/api/portal/reputation/qr", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { storage } = await import("../../storage");
      const widgetToken = await storage.ensureWidgetToken(clientId);

      const origin = req.headers.origin
        || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : `${req.protocol}://${req.get("host")}`);

      const qrUrl = `${origin}/review/qr/${widgetToken}`;

      res.json({ qrUrl, widgetToken });
    } catch (err: any) {
      log.error("[portal] qr config error:", err.message);
      res.status(500).json({ error: "Failed to load QR config" });
    }
  });

  /**
   * GET /api/portal/reputation/request-stats
   * Source breakdown for review requests.
   */
  app.get("/api/portal/reputation/request-stats", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const [row] = await db.select({
        total: sql<number>`count(*)::int`,
        job_complete: sql<number>`count(*) filter (where ${reviewRequests.trigger_source} = 'job_complete')::int`,
        portal_manual: sql<number>`count(*) filter (where ${reviewRequests.trigger_source} = 'portal_manual')::int`,
        admin_manual: sql<number>`count(*) filter (where ${reviewRequests.trigger_source} = 'manual')::int`,
        qr_scan: sql<number>`count(*) filter (where ${reviewRequests.trigger_source} = 'qr_scan')::int`,
      }).from(reviewRequests)
        .where(eq(reviewRequests.client_id, clientId));

      res.json(row || { total: 0, job_complete: 0, portal_manual: 0, admin_manual: 0, qr_scan: 0 });
    } catch (err: any) {
      log.error("[portal] request-stats error:", err.message);
      res.status(500).json({ error: "Failed to load stats" });
    }
  });

  // ═══════════════════════════════════════════════
  // Google Business Connection (Portal)
  // ═══════════════════════════════════════════════

  /**
   * GET /api/portal/reputation/google-status
   * Returns Google connection status for the authenticated client.
   */
  app.get("/api/portal/reputation/google-status", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { isGoogleOAuthConfigured } = await import("../../services/googleBusinessService");
      const { decryptGoogleCredentials } = await import("../../lib/tokenEncryption");
      const { storage } = await import("../../storage");
      const client = await storage.getClientById(clientId);
      const rawCreds = client?.google_credentials as Record<string, unknown> | null;
      const creds = rawCreds ? decryptGoogleCredentials(rawCreds) as any : null;

      const connected = !!(creds?.refresh_token || creds?.access_token);
      const expired = connected && creds?.expiry_date && new Date(creds.expiry_date).getTime() < Date.now() && !creds?.refresh_token;

      res.json({
        oauthConfigured: isGoogleOAuthConfigured(),
        connected,
        connectedAt: creds?.connected_at || null,
        needsReconnect: expired,
      });
    } catch (err: any) {
      log.error("[portal] google-status error:", err.message);
      res.status(500).json({ error: "Failed to check connection" });
    }
  });

  /**
   * GET /api/portal/reputation/google-connect
   * Initiates Google OAuth flow for the authenticated client.
   */
  app.get("/api/portal/reputation/google-connect", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { isGoogleOAuthConfigured, getGoogleAuthUrl } = await import("../../services/googleBusinessService");
      if (!isGoogleOAuthConfigured()) {
        return res.status(503).json({ error: "Google connection is not available right now" });
      }

      const state = JSON.stringify({ clientId, source: "portal" });
      const authUrl = getGoogleAuthUrl(state);
      res.json({ authUrl });
    } catch (err: any) {
      log.error("[portal] google-connect error:", err.message);
      res.status(500).json({ error: "Failed to start connection" });
    }
  });

  /**
   * POST /api/portal/reputation/google-disconnect
   * Disconnects Google for the authenticated client.
   */
  app.post("/api/portal/reputation/google-disconnect", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      // Revoke token on Google's side before clearing credentials
      const { revokeGoogleTokens } = await import("../../services/googleBusinessService");
      await revokeGoogleTokens(clientId);

      const { storage } = await import("../../storage");
      await storage.updateClient(clientId, { google_credentials: null } as any);

      await storage.logAdminActivity({
        actor_type: "client",
        actor_id: (req.user as any)?.id,
        actor_name: null,
        action: "google.disconnected",
        entity_type: "client",
        entity_id: clientId,
        summary: `Google Business disconnected by client (portal)`,
      });

      res.json({ ok: true });
    } catch (err: any) {
      log.error("[portal] google-disconnect error:", err.message);
      res.status(500).json({ error: "Failed to disconnect" });
    }
  });

  /* ═══════════════════════════════════════════
     Competitor tracking — Premium tier
     ═══════════════════════════════════════════ */

  /**
   * GET /api/portal/reputation/competitors
   * Returns the customer's tracked competitors + each one's most-recent
   * snapshot. Tier-gated: Basic/Pro see an empty list + upgrade hint;
   * Premium sees real data.
   */
  app.get("/api/portal/reputation/competitors", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { reputationCompetitors, reputationCompetitorSnapshots, monitoredReviews } = await import("@shared/schema");
      const { extractTier, canAccessFeature } = await import("@shared/reputationConfig");
      const { db } = await import("../../db");
      const { and, eq, inArray, desc, sql } = await import("drizzle-orm");

      const svc = await storage.getClientReputationService(clientId);
      const tier = svc ? extractTier(svc.serviceId) : null;
      const hasAccess = canAccessFeature(tier, "competitorTracking");

      if (!hasAccess) {
        return res.json({
          tier,
          hasAccess: false,
          upgradeRequired: "premium",
          competitors: [],
          ownStats: null,
        });
      }

      // Own stats so the dashboard can render a "you vs. them" comparison
      // without a second request.
      const [own] = await db.select({
        total_reviews: sql<number>`COUNT(*)::int`,
        average_rating: sql<number>`COALESCE(ROUND(AVG(${monitoredReviews.rating})::numeric, 2), 0)::float`,
      })
        .from(monitoredReviews)
        .where(eq(monitoredReviews.client_id, clientId));

      const competitors = await db.select()
        .from(reputationCompetitors)
        .where(eq(reputationCompetitors.client_id, clientId))
        .orderBy(reputationCompetitors.created_at);

      // N+1 fix: pull all snapshots for the tracked competitors in one
      // query ordered by snapshot_date DESC, then pick the first hit per
      // competitor in JS. Was Promise.all of per-competitor selects.
      const competitorIds = competitors.map(c => c.id);
      const latestByCompetitor = new Map<number, typeof reputationCompetitorSnapshots.$inferSelect>();
      if (competitorIds.length > 0) {
        const snapshots = await db.select()
          .from(reputationCompetitorSnapshots)
          .where(inArray(reputationCompetitorSnapshots.competitor_id, competitorIds))
          .orderBy(desc(reputationCompetitorSnapshots.snapshot_date));
        for (const s of snapshots) {
          if (!latestByCompetitor.has(s.competitor_id)) {
            latestByCompetitor.set(s.competitor_id, s);
          }
        }
      }
      const enriched = competitors.map(c => ({
        ...c,
        latest_snapshot: latestByCompetitor.get(c.id) ?? null,
      }));

      res.json({
        tier,
        hasAccess: true,
        ownStats: own ?? { total_reviews: 0, average_rating: 0 },
        competitors: enriched,
      });
    } catch (err: any) {
      log.error("[portal] competitors list error:", err.message);
      res.status(500).json({ error: "Failed to load competitors" });
    }
  });

  /**
   * GET /api/portal/reputation/competitors/trend?days=90
   * Time series for each tracked competitor + the client's own snapshots
   * (computed on-the-fly from monitored_reviews so we don't need yet
   * another snapshot table for own data).
   */
  app.get("/api/portal/reputation/competitors/trend", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { reputationCompetitors, reputationCompetitorSnapshots } = await import("@shared/schema");
      const { extractTier, canAccessFeature } = await import("@shared/reputationConfig");
      const { db } = await import("../../db");
      const { and, eq, inArray, sql } = await import("drizzle-orm");

      const svc = await storage.getClientReputationService(clientId);
      const tier = svc ? extractTier(svc.serviceId) : null;
      if (!canAccessFeature(tier, "competitorTracking")) {
        return res.json({ tier, hasAccess: false, days: 0, series: [] });
      }

      const days = Math.min(Math.max(parseInt(String(req.query.days ?? "90"), 10) || 90, 7), 365);

      const competitors = await db.select()
        .from(reputationCompetitors)
        .where(and(
          eq(reputationCompetitors.client_id, clientId),
          eq(reputationCompetitors.enabled, true),
        ));

      // N+1 fix: one snapshots query for all enabled competitors, grouped
      // in JS. Was Promise.all of per-competitor selects.
      const competitorIds = competitors.map(c => c.id);
      const snapshotsByCompetitor = new Map<number, Array<typeof reputationCompetitorSnapshots.$inferSelect>>();
      if (competitorIds.length > 0) {
        const allSnapshots = await db.select()
          .from(reputationCompetitorSnapshots)
          .where(and(
            inArray(reputationCompetitorSnapshots.competitor_id, competitorIds),
            sql`${reputationCompetitorSnapshots.snapshot_date} >= NOW() - (${sql.raw(String(days))} || ' days')::INTERVAL`,
          ))
          .orderBy(reputationCompetitorSnapshots.snapshot_date);
        for (const s of allSnapshots) {
          const arr = snapshotsByCompetitor.get(s.competitor_id);
          if (arr) arr.push(s);
          else snapshotsByCompetitor.set(s.competitor_id, [s]);
        }
      }
      const series = competitors.map(c => ({
        competitor: c,
        snapshots: snapshotsByCompetitor.get(c.id) ?? [],
      }));

      res.json({ tier, hasAccess: true, days, series });
    } catch (err: any) {
      log.error("[portal] competitors trend error:", err.message);
      res.status(500).json({ error: "Failed to load trend" });
    }
  });

  /**
   * POST /api/portal/reputation/competitors
   * Customer-side add. Same place-id validation as the admin path.
   * Tier-gated: only Premium can add.
   */
  app.post("/api/portal/reputation/competitors", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { reputationCompetitors } = await import("@shared/schema");
      const { extractTier, canAccessFeature } = await import("@shared/reputationConfig");
      const { db } = await import("../../db");
      const { eq } = await import("drizzle-orm");

      const svc = await storage.getClientReputationService(clientId);
      const tier = svc ? extractTier(svc.serviceId) : null;
      if (!canAccessFeature(tier, "competitorTracking")) {
        return res.status(403).json({ error: "Competitor tracking requires the Premium plan", upgrade: true });
      }

      const { place_id, display_name } = req.body ?? {};
      if (!place_id || !display_name) {
        return res.status(400).json({ error: "place_id and display_name are required" });
      }

      const { validateGooglePlaceId } = await import("../../services/reputation/placeIdValidator");
      const v = await validateGooglePlaceId(place_id);
      if (!v.valid && !v.soft) {
        return res.status(400).json({ error: `Invalid Google Place ID: ${v.reason}` });
      }

      const existing = await db.select({ id: reputationCompetitors.id })
        .from(reputationCompetitors)
        .where(eq(reputationCompetitors.client_id, clientId));
      if (existing.length >= 5) {
        return res.status(400).json({ error: "Maximum of 5 competitors per client" });
      }

      const [row] = await db.insert(reputationCompetitors).values({
        client_id: clientId,
        place_id,
        display_name,
        enabled: true,
      } as any).returning();
      res.json({ competitor: row });
    } catch (err: any) {
      if (String(err?.message || "").includes("idx_competitors_client_place")) {
        return res.status(409).json({ error: "This competitor is already tracked" });
      }
      log.error("[portal] competitor add error:", err.message);
      res.status(500).json({ error: "Failed to add competitor" });
    }
  });

  app.delete("/api/portal/reputation/competitors/:id", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

      const { reputationCompetitors } = await import("@shared/schema");
      const { db } = await import("../../db");
      const { and, eq } = await import("drizzle-orm");

      const result = await db.delete(reputationCompetitors)
        .where(and(eq(reputationCompetitors.id, id), eq(reputationCompetitors.client_id, clientId)))
        .returning({ id: reputationCompetitors.id });
      if (result.length === 0) return res.status(404).json({ error: "Not found" });
      res.json({ ok: true });
    } catch (err: any) {
      log.error("[portal] competitor remove error:", err.message);
      res.status(500).json({ error: "Failed to remove competitor" });
    }
  });

  /**
   * PATCH /api/portal/reputation/auto-reply-settings
   * Body: { auto_reply_paused: boolean }
   * Stores in the reputationshield client_service metadata.
   */
  app.patch("/api/portal/reputation/auto-reply-settings", requireClientStrict, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { auto_reply_paused } = req.body;
      if (typeof auto_reply_paused !== "boolean") {
        return res.status(400).json({ error: "auto_reply_paused must be a boolean" });
      }

      const services = await db.select({
        id: clientServices.id,
        metadata: clientServices.metadata,
      })
        .from(clientServices)
        .where(and(
          eq(clientServices.client_id, clientId),
          sql`${clientServices.service_id} LIKE '%reputationshield%'`,
          eq(clientServices.status, "active"),
        ))
        .limit(1);

      if (services.length === 0) {
        return res.status(404).json({ error: "No active ReputationShield service found" });
      }

      const svc = services[0];
      const existing = (svc.metadata as Record<string, any>) ?? {};
      await db.update(clientServices)
        .set({ metadata: { ...existing, auto_reply_paused }, updated_at: new Date() })
        .where(eq(clientServices.id, svc.id));

      log.info("[portal/reputation/auto-reply-settings] auto_reply_paused toggled", { clientId, auto_reply_paused });
      res.json({ ok: true, auto_reply_paused });
    } catch (err: any) {
      log.error("[portal/reputation/auto-reply-settings] Error:", { error: err.message });
      res.status(500).json({ error: "Failed to update ReputationShield settings" });
    }
  });
}

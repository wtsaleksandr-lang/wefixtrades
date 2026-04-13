/**
 * Shared reputation routes — review management endpoints.
 *
 * These routes are the canonical API for review/reply operations,
 * usable by both SocialSync and ReputationShield products.
 *
 * Path: /api/reputation/...
 */
import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { storage } from "../storage";
import { syncClientReviews, processAllClientReviews } from "../services/reputation/reviewOrchestrator";
import { getGoogleAccessToken } from "../services/socialSync/googleBusinessService";
import { postGBPReply } from "../services/reputation/gbpReviewIngestion";
import { enqueueFromBooking, processReviewRequests, getReviewLink, getReviewLinkConfig, updateReviewLinkConfig, validateReviewLink } from "../services/reputation/reviewRequestService";
import { getAttributionInsights, runAttributionForClient } from "../services/reputation/reviewAttribution";

export function registerReputationRoutes(app: Express): void {

  // 1. POST sync reviews for a client
  app.post("/api/reputation/clients/:clientId/reviews/sync", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const result = await syncClientReviews(clientId);
      res.json(result);
    } catch (err: any) {
      console.error("[reputation] Review sync error:", err.message);
      res.status(500).json({ error: "Failed to sync reviews" });
    }
  });

  // 2. GET reviews for a client
  app.get("/api/reputation/clients/:clientId/reviews", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const needsReply = req.query.needs_reply === "true" ? true : req.query.needs_reply === "false" ? false : undefined;
      const reviews = await storage.listReviews(clientId, {
        platform: req.query.platform as string,
        needsReply,
        limit: Math.min(100, parseInt(req.query.limit as string) || 50),
      });

      const summary = {
        total: reviews.length,
        needs_reply: reviews.filter(r => r.needs_reply && !r.has_existing_owner_reply).length,
        negative: reviews.filter(r => r.sentiment === "negative" || r.sentiment === "urgent").length,
        auto_replied: reviews.filter(r => r.reply_status === "auto_replied").length,
        draft_ready: reviews.filter(r => r.reply_status === "draft_ready").length,
        escalated: reviews.filter(r => r.escalation_flag).length,
      };

      res.json({ reviews, summary });
    } catch (err: any) {
      console.error("[reputation] List reviews error:", err.message);
      res.status(500).json({ error: "Failed to list reviews" });
    }
  });

  // 3. POST approve and post a draft reply
  app.post("/api/reputation/reviews/:reviewId/approve-reply", requireAdmin, async (req: Request, res: Response) => {
    try {
      const reviewId = parseInt(req.params.reviewId as string);
      if (isNaN(reviewId)) return res.status(400).json({ error: "Invalid review ID" });

      const { db } = await import("../db");
      const { reviews: reviewsTable } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [review] = await db.select().from(reviewsTable).where(eq(reviewsTable.id, reviewId)).limit(1);
      if (!review) return res.status(404).json({ error: "Review not found" });

      const replyText = req.body.reply_text || review.reply_text;
      if (!replyText) return res.status(400).json({ error: "No reply text available" });

      if (review.platform === "google_business") {
        const credentials = await getGoogleAccessToken(review.client_id);
        if (!credentials) return res.status(400).json({ error: "No Google Business connection" });

        const posted = await postGBPReply(credentials.token, credentials.locationName, review.external_review_id, replyText);
        if (!posted.success) {
          await storage.updateReview(reviewId, { reply_status: "failed", reply_result: { error: posted.error } } as any);
          return res.status(500).json({ error: posted.error || "Reply post failed" });
        }

        await storage.updateReview(reviewId, {
          reply_text: replyText,
          reply_status: "manually_replied",
          reply_posted_at: new Date(),
          reply_result: posted.result,
        } as any);
      } else {
        return res.status(400).json({ error: `Reply posting not supported for platform "${review.platform}"` });
      }

      res.json({ ok: true });
    } catch (err: any) {
      console.error("[reputation] Approve reply error:", err.message);
      res.status(500).json({ error: "Failed to post reply" });
    }
  });

  // 4. POST batch process all client reviews
  app.post("/api/reputation/internal/process-reviews", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await processAllClientReviews();
      res.json(result);
    } catch (err: any) {
      console.error("[reputation] Batch review process error:", err.message);
      res.status(500).json({ error: "Failed to process reviews" });
    }
  });

  // ─── Review Request Routes ───

  // 5. POST enqueue a review request manually
  app.post("/api/reputation/clients/:clientId/review-requests/enqueue", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const { booking_id, customer_name, customer_phone, customer_email } = req.body;
      if (!customer_name) return res.status(400).json({ error: "customer_name is required" });
      if (!customer_phone && !customer_email) return res.status(400).json({ error: "customer_phone or customer_email required" });

      const result = await enqueueFromBooking(
        clientId,
        booking_id || 0,
        customer_name,
        customer_phone || null,
        customer_email || null,
      );

      if (!result.enqueued) return res.status(400).json({ error: result.reason });
      res.status(201).json({ ok: true });
    } catch (err: any) {
      console.error("[reputation] Enqueue review request error:", err.message);
      res.status(500).json({ error: "Failed to enqueue review request" });
    }
  });

  // 6. GET review requests for a client
  app.get("/api/reputation/clients/:clientId/review-requests", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const requests = await storage.listReviewRequests(clientId, Math.min(100, parseInt(req.query.limit as string) || 50));

      const summary = {
        total: requests.length,
        sent: requests.filter(r => r.status === "sent").length,
        pending: requests.filter(r => r.status === "pending").length,
        failed: requests.filter(r => r.status === "failed").length,
      };

      res.json({ requests, summary });
    } catch (err: any) {
      console.error("[reputation] List review requests error:", err.message);
      res.status(500).json({ error: "Failed to list review requests" });
    }
  });

  // 7. GET review link for a client
  app.get("/api/reputation/clients/:clientId/review-link", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const link = await getReviewLink(clientId);
      res.json({ review_link: link, configured: !!link });
    } catch (err: any) {
      console.error("[reputation] Review link error:", err.message);
      res.status(500).json({ error: "Failed to get review link" });
    }
  });

  // 8. POST process pending review requests manually
  app.post("/api/reputation/internal/process-review-requests", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await processReviewRequests();
      res.json(result);
    } catch (err: any) {
      console.error("[reputation] Process review requests error:", err.message);
      res.status(500).json({ error: "Failed to process review requests" });
    }
  });

  // 9. GET review request readiness + summary for a client
  app.get("/api/reputation/clients/:clientId/review-requests/status", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const reviewLink = await getReviewLink(clientId);
      const requests = await storage.listReviewRequests(clientId, 100);

      const total = requests.length;
      const sent = requests.filter(r => r.status === "sent" || r.status === "delivered").length;
      const pending = requests.filter(r => r.status === "pending").length;
      const failed = requests.filter(r => r.status === "failed").length;
      const skipped = requests.filter(r => r.status === "skipped").length;

      // Check GBP connection
      const connections = await storage.listSocialSyncConnections(clientId);
      const gbp = connections.find(c => c.platform === "google_business");
      const gbpConnected = gbp?.connection_status === "connected" || gbp?.connection_status === "expiring_soon";

      // Readiness assessment
      let readiness: "ready" | "blocked" | "limited" | "active";
      const blockers: string[] = [];

      if (!reviewLink) blockers.push("No review link configured");
      if (!gbpConnected) blockers.push("Google Business not connected");

      if (blockers.length > 0) {
        readiness = "blocked";
      } else if (sent > 0) {
        readiness = "active";
      } else if (total === 0) {
        readiness = "limited";
      } else {
        readiness = "ready";
      }

      res.json({
        readiness,
        blockers,
        review_link: reviewLink,
        review_link_configured: !!reviewLink,
        gbp_connected: gbpConnected,
        summary: { total, sent, pending, failed, skipped },
      });
    } catch (err: any) {
      console.error("[reputation] Review request status error:", err.message);
      res.status(500).json({ error: "Failed to load status" });
    }
  });

  // ─── Attribution Routes ───

  // 10. GET attribution insights for a client
  app.get("/api/reputation/clients/:clientId/attribution", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const insights = await getAttributionInsights(clientId);
      res.json(insights);
    } catch (err: any) {
      console.error("[reputation] Attribution insights error:", err.message);
      res.status(500).json({ error: "Failed to load attribution insights" });
    }
  });

  // 11. POST run attribution backfill for a client
  app.post("/api/reputation/clients/:clientId/attribution/backfill", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const result = await runAttributionForClient(clientId);
      res.json(result);
    } catch (err: any) {
      console.error("[reputation] Attribution backfill error:", err.message);
      res.status(500).json({ error: "Failed to run attribution" });
    }
  });

  // ─── Review Link Management Routes ───

  // 12. GET review link configuration
  app.get("/api/reputation/clients/:clientId/review-link/config", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const config = await getReviewLinkConfig(clientId);
      res.json(config);
    } catch (err: any) {
      console.error("[reputation] Review link config error:", err.message);
      res.status(500).json({ error: "Failed to load review link config" });
    }
  });

  // 13. PUT update review link configuration
  app.put("/api/reputation/clients/:clientId/review-link/config", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const { review_link, place_id } = req.body;

      // Validate review_link if provided
      if (review_link) {
        const validation = validateReviewLink(review_link);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.error });
        }
      }

      await updateReviewLinkConfig(clientId, {
        review_link: review_link !== undefined ? review_link : undefined,
        place_id: place_id !== undefined ? place_id : undefined,
      });

      const updated = await getReviewLinkConfig(clientId);
      res.json(updated);
    } catch (err: any) {
      console.error("[reputation] Review link update error:", err.message);
      res.status(500).json({ error: err.message || "Failed to update review link" });
    }
  });

  // 14. POST validate a review link
  app.post("/api/reputation/review-link/validate", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: "url is required" });
      const result = validateReviewLink(url);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: "Validation failed" });
    }
  });

  // ─── Phase 6B: ReputationShield Dashboard ───

  // 15. GET reputation dashboard metrics for a client
  app.get("/api/reputation/clients/:clientId/dashboard", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const allReviews = await storage.listReviews(clientId, { limit: 200 });
      const requests = await storage.listReviewRequests(clientId, 200);

      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const thirtyDays = 30 * day;

      // Review metrics
      const recentReviews = allReviews.filter(r => r.review_time && (now - new Date(r.review_time).getTime()) < thirtyDays);
      const ratings = allReviews.filter(r => r.star_rating).map(r => r.star_rating!);
      const recentRatings = recentReviews.filter(r => r.star_rating).map(r => r.star_rating!);
      const avgRating = ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;
      const avgRatingRecent = recentRatings.length > 0 ? Math.round((recentRatings.reduce((a, b) => a + b, 0) / recentRatings.length) * 10) / 10 : null;

      // Reply metrics
      const replied = allReviews.filter(r => r.reply_status === "auto_replied" || r.reply_status === "manually_replied" || r.has_existing_owner_reply);
      const needsReply = allReviews.filter(r => r.needs_reply && !r.has_existing_owner_reply && r.reply_status !== "auto_replied" && r.reply_status !== "manually_replied");
      const replyRate = allReviews.length > 0 ? Math.round((replied.length / allReviews.length) * 100) : null;

      // Sentiment
      const negative = allReviews.filter(r => r.sentiment === "negative" || r.sentiment === "urgent");
      const unresolvedNegative = negative.filter(r => r.needs_reply && r.reply_status !== "auto_replied" && r.reply_status !== "manually_replied" && !r.has_existing_owner_reply);
      const escalated = allReviews.filter(r => r.escalation_flag);

      // Request metrics
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
      const avgDaysToReview = daysList.length > 0 ? Math.round((daysList.reduce((a, b) => a + b, 0) / daysList.length) * 10) / 10 : null;

      // Weekly trend (last 8 weeks)
      const weeklyTrend: { week: string; reviews: number; avg_rating: number | null }[] = [];
      for (let i = 7; i >= 0; i--) {
        const weekStart = now - (i + 1) * 7 * day;
        const weekEnd = now - i * 7 * day;
        const weekReviews = allReviews.filter(r => r.review_time && new Date(r.review_time).getTime() >= weekStart && new Date(r.review_time).getTime() < weekEnd);
        const wRatings = weekReviews.filter(r => r.star_rating).map(r => r.star_rating!);
        weeklyTrend.push({
          week: new Date(weekStart).toISOString().slice(0, 10),
          reviews: weekReviews.length,
          avg_rating: wRatings.length > 0 ? Math.round((wRatings.reduce((a, b) => a + b, 0) / wRatings.length) * 10) / 10 : null,
        });
      }

      // Readiness / health
      const rlConfig = await getReviewLinkConfig(clientId);
      const connections = await storage.listSocialSyncConnections(clientId);
      const gbp = connections.find(c => c.platform === "google_business");

      const issues: string[] = [];
      if (!rlConfig.effective_link) issues.push("No review link configured");
      if (!gbp || (gbp.connection_status !== "connected" && gbp.connection_status !== "expiring_soon")) issues.push("Google Business not connected");
      if (unresolvedNegative.length > 0) issues.push(`${unresolvedNegative.length} negative reviews need attention`);
      if (requests.filter(r => r.status === "failed").length > 0) issues.push("Some review requests failed");
      const draftReady = allReviews.filter(r => r.reply_status === "draft_ready").length;
      if (draftReady > 0) issues.push(`${draftReady} reply drafts awaiting posting`);

      let health: "healthy" | "active" | "at_risk" | "blocked" | "limited";
      if (issues.some(i => i.includes("not connected") || i.includes("No review link"))) health = "blocked";
      else if (unresolvedNegative.length > 0) health = "at_risk";
      else if (allReviews.length > 0 && sentRequests.length > 0) health = "healthy";
      else if (allReviews.length > 0 || sentRequests.length > 0) health = "active";
      else health = "limited";

      res.json({
        health,
        issues,
        metrics: {
          total_reviews: allReviews.length,
          reviews_30d: recentReviews.length,
          avg_rating: avgRating,
          avg_rating_30d: avgRatingRecent,
          reply_rate: replyRate,
          auto_replied: allReviews.filter(r => r.reply_status === "auto_replied").length,
          manually_replied: allReviews.filter(r => r.reply_status === "manually_replied").length,
          drafts_pending: draftReady,
          unresolved_negative: unresolvedNegative.length,
          escalated: escalated.length,
          requests_sent: sentRequests.length,
          likely_attributed: attributed.length,
          estimated_response_rate: responseRate,
          avg_days_to_review: avgDaysToReview,
        },
        weekly_trend: weeklyTrend,
      });
    } catch (err: any) {
      console.error("[reputation] Dashboard error:", err.message);
      res.status(500).json({ error: "Failed to load dashboard" });
    }
  });
}

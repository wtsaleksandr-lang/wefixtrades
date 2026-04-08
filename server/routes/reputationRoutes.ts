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
import { enqueueFromBooking, processReviewRequests, getReviewLink } from "../services/reputation/reviewRequestService";
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
}

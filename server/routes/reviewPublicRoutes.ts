/**
 * Public review funnel routes — no auth required.
 * Customers access these via a unique token link from their review request email.
 * Pattern follows onboardingPublicRoutes.ts.
 */

import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";

const log = createLogger("ReviewPublic");

export function registerReviewPublicRoutes(app: Express): void {

  /**
   * GET /api/review/:token
   * Returns review request context for the sentiment gate page.
   * Marks as "clicked" on first visit.
   */
  app.get("/api/review/:token", async (req: Request, res: Response) => {
    try {
      const token = req.params.token as string;
      const rr = await storage.getReviewRequestByToken(token);
      if (!rr) return res.status(404).json({ error: "Review request not found" });

      // Mark as clicked on first open (only if currently sent)
      if (rr.status === "sent") {
        await storage.updateReviewRequest(rr.id, {
          status: "clicked",
          clicked_at: new Date(),
          next_followup_at: null,
        });
      }

      const payload = rr.payload as any;

      // Don't expose internal IDs
      res.json({
        businessName: payload?.business_name || "your service provider",
        customerName: rr.customer_name || "",
        status: rr.status === "sent" ? "clicked" : rr.status,
        sentiment: rr.sentiment,
        reviewUrl: rr.review_url,
        facebookReviewUrl: rr.facebook_review_url || null,
        hasFeedback: !!rr.internal_feedback,
      });
    } catch (err: any) {
      log.error("[review-funnel] GET error:", err.message);
      res.status(500).json({ error: "Failed to load review page" });
    }
  });

  /**
   * POST /api/review/:token/respond
   * Customer selects positive or negative sentiment.
   * Positive → returns Google review link for redirect.
   * Negative → signals client to show feedback form.
   */
  app.post("/api/review/:token/respond", async (req: Request, res: Response) => {
    try {
      const token = req.params.token as string;
      const { sentiment } = req.body;

      if (!sentiment || !["positive", "negative", "neutral"].includes(sentiment)) {
        return res.status(400).json({ error: "sentiment must be positive, negative, or neutral" });
      }

      const rr = await storage.getReviewRequestByToken(token);
      if (!rr) return res.status(404).json({ error: "Review request not found" });

      // Stop condition: already completed
      const terminalStatuses = ["completed", "stopped", "routed_positive", "routed_negative", "feedback_captured"];
      if (terminalStatuses.includes(rr.status)) {
        return res.status(400).json({ error: "This review has already been completed" });
      }

      if (sentiment === "positive" || sentiment === "neutral") {
        // Determine which platform the customer chose (default: google)
        const platform = req.body.platform === "facebook" ? "facebook" : "google";

        await storage.updateReviewRequest(rr.id, {
          sentiment,
          status: "routed_positive",
          completed_at: new Date(),
          next_followup_at: null,
          routed_platform: platform,
        });

        const reviewUrl = platform === "facebook"
          ? (rr.facebook_review_url || rr.review_url || null)
          : (rr.review_url || null);

        res.json({
          ok: true,
          sentiment,
          reviewUrl,
          platform,
        });
      } else {
        // negative
        await storage.updateReviewRequest(rr.id, {
          sentiment: "negative",
          status: "routed_negative",
          next_followup_at: null,
        });
        res.json({
          ok: true,
          sentiment: "negative",
          captureRequired: true,
        });
      }
    } catch (err: any) {
      log.error("[review-funnel] respond error:", err.message);
      res.status(500).json({ error: "Failed to process response" });
    }
  });

  /**
   * POST /api/review/:token/feedback
   * Captures private feedback from unhappy customers.
   * This feedback is NOT routed publicly.
   */
  app.post("/api/review/:token/feedback", async (req: Request, res: Response) => {
    try {
      const token = req.params.token as string;
      const { message } = req.body;

      if (!message || typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({ error: "message is required" });
      }

      const rr = await storage.getReviewRequestByToken(token);
      if (!rr) return res.status(404).json({ error: "Review request not found" });

      // Only allow feedback if sentiment was negative (or already routed_negative)
      if (rr.status === "completed" || rr.status === "stopped" || rr.status === "feedback_captured") {
        return res.status(400).json({ error: "Feedback has already been submitted" });
      }

      await storage.updateReviewRequest(rr.id, {
        internal_feedback: message.trim().slice(0, 5000),
        status: "feedback_captured",
        completed_at: new Date(),
        next_followup_at: null,
      });

      res.json({ ok: true });
    } catch (err: any) {
      log.error("[review-funnel] feedback error:", err.message);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  /**
   * GET /api/review/qr/:widgetToken
   * QR code landing — creates a new review request and returns the access token
   * for the sentiment gate. The frontend redirects to /review/:accessToken.
   *
   * Rate limited: max 60 QR sessions per widget token per hour.
   */
  const qrRateLimits = new Map<string, { count: number; resets: number }>();
  const QR_HOURLY_LIMIT = 60;

  app.get("/api/review/qr/:widgetToken", async (req: Request, res: Response) => {
    try {
      const widgetToken = req.params.widgetToken as string;
      if (!widgetToken || widgetToken.length < 16) {
        return res.status(400).json({ error: "Invalid token" });
      }

      // Rate limit per widget token
      const now = Date.now();
      const rl = qrRateLimits.get(widgetToken);
      if (rl && now < rl.resets) {
        if (rl.count >= QR_HOURLY_LIMIT) {
          return res.status(429).json({ error: "Too many scans. Please try again later." });
        }
        rl.count++;
      } else {
        qrRateLimits.set(widgetToken, { count: 1, resets: now + 60 * 60 * 1000 });
      }

      // Look up client
      const client = await storage.getClientByWidgetToken(widgetToken);
      if (!client) {
        return res.status(404).json({ error: "Business not found" });
      }

      // Create QR review request
      const { createQrReviewRequest } = await import("../services/reviewRequestService");
      const rr = await createQrReviewRequest(client.id);

      // Return the access token so frontend can redirect to the sentiment gate
      res.json({
        accessToken: rr.access_token,
        businessName: client.business_name,
      });
    } catch (err: any) {
      log.error("[review-funnel] QR landing error:", err.message);
      res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  });
}

/**
 * Public review funnel routes — no auth required.
 * Customers access these via a unique token link from their review request email.
 * Pattern follows onboardingPublicRoutes.ts.
 */

import type { Express, Request, Response } from "express";
import { storage } from "../storage";

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
        hasFeedback: !!rr.internal_feedback,
      });
    } catch (err: any) {
      console.error("[review-funnel] GET error:", err.message);
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
        await storage.updateReviewRequest(rr.id, {
          sentiment,
          status: "routed_positive",
          completed_at: new Date(),
          next_followup_at: null,
        });
        res.json({
          ok: true,
          sentiment,
          reviewUrl: rr.review_url || null,
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
      console.error("[review-funnel] respond error:", err.message);
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
      console.error("[review-funnel] feedback error:", err.message);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });
}

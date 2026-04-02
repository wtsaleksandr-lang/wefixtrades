/**
 * Public onboarding form routes — no auth required.
 * Clients access these via a unique token link.
 */

import type { Express, Request, Response } from "express";
import { storage } from "../storage";

export function registerOnboardingPublicRoutes(app: Express): void {

  /**
   * GET /api/onboarding/:token
   * Returns template steps, current responses, and context for the form.
   * Also marks as "viewed" if status is "not_sent" or "sent".
   */
  app.get("/api/onboarding/:token", async (req: Request, res: Response) => {
    try {
      const token = req.params.token as string;
      const data = await storage.getOnboardingByToken(token);
      if (!data) return res.status(404).json({ error: "Onboarding form not found" });

      const { submission, template, clientName, serviceName } = data;

      // Mark as viewed on first open
      if (submission.status === "not_sent" || submission.status === "sent") {
        await storage.updateOnboardingSubmission(submission.id, {
          status: "viewed",
        });
      }

      // Don't expose internal IDs to public
      res.json({
        status: submission.status === "not_sent" || submission.status === "sent" ? "viewed" : submission.status,
        clientName,
        serviceName,
        steps: template?.steps ?? [],
        responses: submission.responses ?? {},
        submittedAt: submission.submitted_at,
      });
    } catch (err: any) {
      console.error("[onboarding] GET error:", err.message);
      res.status(500).json({ error: "Failed to load onboarding form" });
    }
  });

  /**
   * POST /api/onboarding/:token
   * Accepts form responses and marks submission as submitted.
   */
  app.post("/api/onboarding/:token", async (req: Request, res: Response) => {
    try {
      const token = req.params.token as string;
      const { responses } = req.body;

      if (!responses || typeof responses !== "object") {
        return res.status(400).json({ error: "responses object is required" });
      }

      const data = await storage.getOnboardingByToken(token);
      if (!data) return res.status(404).json({ error: "Onboarding form not found" });

      const { submission } = data;

      // Don't allow re-submission of already approved forms
      if (submission.status === "approved") {
        return res.status(400).json({ error: "This form has already been approved" });
      }

      await storage.updateOnboardingSubmission(submission.id, {
        responses,
        status: "submitted",
        submitted_at: new Date(),
      });

      res.json({ ok: true, status: "submitted" });
    } catch (err: any) {
      console.error("[onboarding] POST error:", err.message);
      res.status(500).json({ error: "Failed to submit onboarding form" });
    }
  });
}

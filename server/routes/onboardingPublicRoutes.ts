/**
 * Public onboarding form routes — no auth required.
 * Clients access these via a unique token link.
 */

import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { mapOnboardingToTradeLineConfig, advanceSetupStage } from "@shared/schema";
import { sendOnboardingConfirmationEmail } from "../lib/onboardingConfirmationEmail";

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
   * If this is a TradeLine service, also maps answers into config
   * and triggers the assistant build pipeline.
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

      if (submission.status === "submitted") {
        return res.status(400).json({ error: "This form has already been submitted" });
      }

      await storage.updateOnboardingSubmission(submission.id, {
        responses,
        status: "submitted",
        submitted_at: new Date(),
      });

      // Send onboarding submission confirmation email (fail-safe, non-blocking)
      try {
        const client = await storage.getClientById(submission.client_id);
        if (client?.contact_email) {
          const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
          sendOnboardingConfirmationEmail(client.contact_email, {
            businessName: data.clientName,
            serviceName: data.serviceName,
            portalUrl: `${baseUrl}/portal`,
          }).catch(err =>
            console.warn(`[onboarding-confirmation] send failed for submission #${submission.id}:`, err.message),
          );
        }
      } catch (err: any) {
        console.warn(`[onboarding-confirmation] lookup failed for client #${submission.client_id}:`, err.message);
      }

      // Service-specific post-submit orchestration
      if (submission.client_service_id) {
        try {
          const cs = await storage.getClientServiceById(submission.client_service_id);
          if (cs && cs.service_id.startsWith("tradeline")) {
            // TradeLine: deterministic mapping (mapOnboardingToTradeLineConfig)
            const config = await storage.getTradeLineConfig(cs.id);
            if (config) {
              const updates = mapOnboardingToTradeLineConfig(responses, config.variant);
              if (updates.setupStage) {
                updates.setupStage = advanceSetupStage(config.setupStage, updates.setupStage);
              }
              if (Object.keys(updates).length > 0) {
                await storage.updateTradeLineConfig(cs.id, updates);
              }
            }

            // Trigger assistant build (non-blocking)
            import("../services/vapiService").then(({ provisionTradeLineAssistant }) => {
              provisionTradeLineAssistant(cs.id).catch(err =>
                console.warn(`[tradeline] Auto-build assistant failed for service #${cs.id}:`, err.message),
              );
            });
          } else if (cs) {
            // Non-TradeLine: AI-powered extraction (non-blocking)
            // Fills client fields + client_service.metadata.config from raw responses
            import("../services/onboardingAI").then(({ processOnboardingSubmission }) => {
              processOnboardingSubmission(submission.id).catch(err =>
                console.warn(`[onboarding-ai] Processing failed for submission #${submission.id}:`, err.message),
              );
            });
          }
        } catch (err) {
          console.warn("[onboarding] Post-submit orchestration error:", err);
        }
      }

      res.json({ ok: true, status: "submitted" });
    } catch (err: any) {
      console.error("[onboarding] POST error:", err.message);
      res.status(500).json({ error: "Failed to submit onboarding form" });
    }
  });

  /**
   * GET /api/onboarding/:token/status
   * Lightweight public endpoint for polling TradeLine setup progress.
   * Returns only non-sensitive status fields.
   */
  app.get("/api/onboarding/:token/status", async (req: Request, res: Response) => {
    try {
      const token = req.params.token as string;
      const data = await storage.getOnboardingByToken(token);
      if (!data) return res.status(404).json({ error: "Not found" });

      const { submission } = data;
      let assistantStatus = "not_built";
      let setupStage = "not_started";
      let buildError: string | null = null;

      if (submission.client_service_id) {
        const config = await storage.getTradeLineConfig(submission.client_service_id);
        if (config) {
          assistantStatus = config.assistant?.status ?? "not_built";
          setupStage = config.setupStage ?? "not_started";
          if (assistantStatus === "failed") {
            buildError = config.assistant?.lastBuildError || "Build failed";
          }
        }
      }

      res.json({
        onboardingStatus: submission.status,
        assistantStatus,
        setupStage,
        buildError,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to check status" });
    }
  });
}

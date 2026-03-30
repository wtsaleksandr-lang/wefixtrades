/**
 * Vapi Integration Routes
 *
 * Handles Vapi webhook events, status/readiness checks,
 * and conversation routing through the shared assistant core.
 *
 * Endpoints:
 *   POST /api/vapi/webhook       — Main Vapi webhook receiver
 *   POST /api/vapi/conversation   — Custom LLM endpoint for Vapi assistant-request
 *   GET  /api/vapi/status         — Public readiness check (no secrets exposed)
 *   GET  /api/admin/vapi/status   — Admin-only detailed readiness report
 */

import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import {
  checkVapiReadiness,
  getVapiConfig,
  verifyWebhookSignature,
  handleConversationTurn,
  extractCallReport,
  buildAssistantConfig,
  translateTranscript,
  type VapiWebhookEvent,
  type VapiTranscriptMessage,
} from "../services/vapiService";
import { logUsage } from "../services/usageTracker";
import { getModel } from "../services/aiService";

export function registerVapiRoutes(app: Express): void {

  /**
   * POST /api/vapi/webhook
   *
   * Main webhook endpoint that Vapi calls for all event types.
   * Verifies signature, parses event type, and routes accordingly.
   */
  app.post("/api/vapi/webhook", async (req: Request, res: Response) => {
    try {
      // Verify webhook signature
      const signature = req.headers["x-vapi-signature"] as string | undefined;
      const rawBody = JSON.stringify(req.body);

      if (!verifyWebhookSignature(rawBody, signature)) {
        console.warn("[vapi] Webhook signature verification failed");
        return res.status(401).json({ error: "Invalid signature" });
      }

      const event = req.body as VapiWebhookEvent;
      const eventType = event?.message?.type;

      if (!eventType) {
        return res.status(400).json({ error: "Missing event type" });
      }

      console.log(`[vapi] Received webhook event: ${eventType}`, {
        callId: event.message.call?.id,
      });

      switch (eventType) {
        case "assistant-request": {
          // Vapi is asking for assistant configuration
          const config = buildAssistantConfig();
          return res.json(config);
        }

        case "conversation-update": {
          // Vapi is sending updated transcript for a response
          const messages = event.message.messages || event.message.artifact?.messages || [];
          const callId = event.message.call?.id || "unknown";

          if (!messages.length) {
            return res.json({ reply: "How can I help you?" });
          }

          const reply = await handleConversationTurn(messages, callId);
          return res.json({ reply });
        }

        case "function-call": {
          // Future: handle server-side function calls from Vapi
          const fn = event.message.functionCall;
          console.log("[vapi] Function call received:", fn?.name, fn?.parameters);
          return res.json({ result: "Function not yet implemented" });
        }

        case "status-update": {
          // Call status changed (ringing, in-progress, ended)
          const status = event.message.status;
          const callId = event.message.call?.id;
          console.log(`[vapi] Call ${callId} status: ${status}`);

          // Log status transitions for monitoring
          if (status === "ended") {
            logUsage({
              model: "vapi-call",
              surface: "vapi",
              provider: "vapi",
              channel: "voice",
              sessionId: callId ? `vapi-${callId}` : undefined,
              success: event.message.endedReason !== "error",
              errorMessage: event.message.endedReason === "error"
                ? "Call ended with error"
                : undefined,
              metadata: { webhookEvent: "status-update", endedReason: event.message.endedReason, callId },
            });
          }

          return res.json({ ok: true });
        }

        case "end-of-call-report": {
          // Full call summary — extract and log for admin visibility
          const report = extractCallReport(event);
          console.log("[vapi] Call ended:", {
            callId: report.callId,
            duration: report.duration,
            reason: report.endedReason,
            messages: report.messageCount,
          });

          // Log the completed call
          logUsage({
            model: "vapi-call",
            surface: "vapi",
            provider: "vapi",
            channel: "voice",
            sessionId: `vapi-${report.callId}`,
            latencyMs: report.duration ? report.duration * 1000 : undefined,
            success: report.endedReason !== "error",
            metadata: {
              webhookEvent: "end-of-call-report",
              callId: report.callId,
              endedReason: report.endedReason,
              messageCount: report.messageCount,
              durationSeconds: report.duration,
            },
          });

          return res.json({ ok: true });
        }

        case "transcript": {
          // Real-time transcript update — acknowledge only
          return res.json({ ok: true });
        }

        case "hang": {
          // Call hung up
          return res.json({ ok: true });
        }

        default: {
          console.log(`[vapi] Unhandled event type: ${eventType}`);
          return res.json({ ok: true });
        }
      }
    } catch (err: any) {
      console.error("[vapi] Webhook error:", err?.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * POST /api/vapi/conversation
   *
   * Custom LLM endpoint for Vapi's "custom-llm" model provider.
   * Vapi sends the conversation transcript and expects a text reply.
   * Routes through the shared assistant core with surface="vapi".
   */
  app.post("/api/vapi/conversation", async (req: Request, res: Response) => {
    try {
      const { messages, call } = req.body || {};
      const callId = call?.id || req.body?.callId || "unknown";

      const vapiMessages: VapiTranscriptMessage[] = Array.isArray(messages)
        ? messages
        : [];

      const reply = await handleConversationTurn(vapiMessages, callId);

      // Vapi custom-llm expects this response format
      return res.json({
        output: {
          content: reply,
          model: getModel(),
        },
      });
    } catch (err: any) {
      console.error("[vapi] Conversation error:", err?.message);
      return res.status(500).json({
        output: {
          content: "I'm sorry, I'm having trouble right now. Please try calling back in a moment, or visit wefixtrades.com for help.",
          model: "error",
        },
      });
    }
  });

  /**
   * GET /api/vapi/web-config
   *
   * Returns the public key and assistant ID needed by the client-side
   * Vapi Web SDK. Only non-secret values are exposed.
   * Returns 503 if the web demo is not configured.
   */
  app.get("/api/vapi/web-config", (_req: Request, res: Response) => {
    const config = getVapiConfig();
    if (!config.publicKey || !config.assistantId) {
      return res.status(503).json({
        error: "Voice demo is not configured yet.",
        webDemoEnabled: false,
      });
    }
    return res.json({
      publicKey: config.publicKey,
      assistantId: config.assistantId,
      webDemoEnabled: true,
    });
  });

  /**
   * GET /api/vapi/status
   *
   * Public-safe readiness check. Returns whether Vapi integration
   * is configured without exposing any secrets.
   */
  app.get("/api/vapi/status", (_req: Request, res: Response) => {
    const readiness = checkVapiReadiness();
    const config = getVapiConfig();
    const webDemoEnabled = !!(config.publicKey && config.assistantId);
    return res.json({
      configured: readiness.configured,
      ready: readiness.assistantReady,
      webDemoEnabled,
      checks: {
        apiKeyPresent: readiness.details.hasApiKey,
        publicKeyPresent: readiness.details.hasPublicKey,
        assistantIdPresent: readiness.details.hasAssistantId,
        webhookSecretPresent: readiness.details.hasWebhookSecret,
        assistantCoreReady: readiness.details.assistantCoreReady,
      },
    });
  });

  /**
   * GET /api/admin/vapi/status
   *
   * Admin-only detailed readiness report with full diagnostics.
   * Shows exactly what is configured and what is missing.
   */
  app.get("/api/admin/vapi/status", requireAdmin, (_req: Request, res: Response) => {
    const readiness = checkVapiReadiness();
    return res.json({
      configured: readiness.configured,
      ready: readiness.assistantReady,
      webDemoReady: readiness.webDemoReady,
      details: readiness.details,
      missing: readiness.missing,
      endpoints: {
        webhook: "/api/vapi/webhook",
        conversation: "/api/vapi/conversation",
        publicStatus: "/api/vapi/status",
      },
      setupSteps: readiness.assistantReady ? [] : [
        ...(!readiness.details.hasApiKey ? ["Add VAPI_API_KEY to environment variables"] : []),
        ...(!readiness.details.hasAssistantId ? ["Create a Vapi assistant and add VAPI_ASSISTANT_ID"] : []),
        ...(!readiness.details.hasWebhookSecret ? ["Add VAPI_WEBHOOK_SECRET for webhook signature verification"] : []),
        ...(!readiness.details.hasPhoneNumberId ? ["Purchase a Vapi phone number and add VAPI_PHONE_NUMBER_ID"] : []),
        ...(!readiness.details.hasServerUrl ? ["Set VAPI_SERVER_URL to your public domain"] : []),
        ...(!readiness.details.assistantCoreReady ? ["Configure ANTHROPIC_API_KEY for the shared assistant core"] : []),
      ],
    });
  });
}

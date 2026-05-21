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
  handleTradeLineConversationTurn,
  extractCallReport,
  buildAssistantConfig,
  buildAssistantConfigWithAvailability,
  buildTradeLineAssistantConfig,
  buildTradeLineContext,
  buildTradeLineContextWithKnowledge,
  resolveTradeLineClient,
  logTradeLineCall,
  processTradeLineCallPostHook,
  translateTranscript,
  type VapiWebhookEvent,
  type VapiTranscriptMessage,
  type ResolvedTradeLineClient,
} from "../services/vapiService";
import { logUsage } from "../services/usageTracker";
import { getModel } from "../services/aiService";
import { recordVoiceCostForClient } from "../services/clientCostBilling";
import { aiChannelGateOn } from "../services/aiChannelGate";
import { handleSalesCallEnded } from "../services/wftSalesLine";
import {
  executeCheckAvailability,
  executeCreateBooking,
} from "../services/bookingTools";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";

const log = createLogger("Vapi");

/**
 * Per-call cache of resolved TradeLine client context.
 * Keyed by Vapi call ID. Cleared when call ends.
 * Avoids repeated DB lookups during a single call's conversation turns.
 */
const activeTradeLineCalls = new Map<string, ResolvedTradeLineClient>();

export function registerVapiRoutes(app: Express): void {

  /**
   * POST /api/vapi/webhook
   *
   * Main webhook endpoint that Vapi calls for all event types.
   * Verifies signature, parses event type, and routes accordingly.
   */
  app.post("/api/vapi/webhook", async (req: Request, res: Response) => {
    try {
      // Verify webhook signature using the raw body buffer (captured by Express JSON middleware)
      const signature = req.headers["x-vapi-signature"] as string | undefined;
      const rawBody = (req as any).rawBody as Buffer | undefined;

      if (!verifyWebhookSignature(rawBody, signature)) {
        log.warn("[vapi] Webhook signature verification failed");
        return res.status(401).json({ error: "Invalid signature" });
      }

      const event = req.body as VapiWebhookEvent;
      const eventType = event?.message?.type;

      if (!eventType) {
        return res.status(400).json({ error: "Missing event type" });
      }

      log.info(`[vapi] Received webhook event: ${eventType}`, {
        callId: event.message.call?.id,
      });

      // Attempt TradeLine client resolution from call metadata
      const callId = event.message.call?.id || "unknown";
      const callMetadata = (event.message.call as any)?.metadata;
      const customerNumber = event.message.call?.customer?.number;
      const phoneNumberId = event.message.call?.phoneNumberId;

      // Resolve and cache TradeLine context for this call
      if (callId !== "unknown" && !activeTradeLineCalls.has(callId)) {
        const resolved = await resolveTradeLineClient(callMetadata, customerNumber, phoneNumberId);
        if (resolved) {
          activeTradeLineCalls.set(callId, resolved);
          log.info(`[vapi] Resolved TradeLine client: ${resolved.client.business_name} (service ${resolved.clientService.id}, mode: ${resolved.config.currentMode})`);
        }
      }

      const tradeLineResolved = activeTradeLineCalls.get(callId);

      switch (eventType) {
        case "assistant-request": {
          if (tradeLineResolved) {
            const tlConfig = buildTradeLineAssistantConfig(tradeLineResolved);
            return res.json(tlConfig);
          }
          // Read brand-availability state and override greeting/system prompt
          // when the operator has flipped the toggle off.
          const config = await buildAssistantConfigWithAvailability();
          return res.json(config);
        }

        case "conversation-update": {
          // Vapi is sending updated transcript for a response
          const messages = event.message.messages || event.message.artifact?.messages || [];

          if (!messages.length) {
            return res.json({ reply: "How can I help you?" });
          }

          // Use TradeLine mode-aware handler if resolved, otherwise default
          const reply = tradeLineResolved
            ? await handleTradeLineConversationTurn(
                messages,
                callId,
                await buildTradeLineContextWithKnowledge(tradeLineResolved),
                tradeLineResolved.clientService.id,
              )
            : await handleConversationTurn(messages, callId);

          return res.json({ reply });
        }

        case "function-call": {
          const fn = event.message.functionCall;
          log.info("[vapi] Function call received", { name: fn?.name, params: fn?.parameters });

          if (!fn?.name) {
            return res.json({ result: "No function specified" });
          }

          // Resolve calculator ID for booking operations
          let bookingCalcId: number | null = null;
          if (tradeLineResolved) {
            const calcs = await storage.getCalculatorsByUserId(tradeLineResolved.client.user_id ?? 0);
            bookingCalcId = calcs[0]?.id ?? null;
          }

          if (fn.name === "checkAvailability") {
            if (!bookingCalcId) {
              return res.json({ result: "Booking is not configured for this business. I can take your details instead." });
            }
            const result = await executeCheckAvailability(bookingCalcId, fn.parameters || {});
            return res.json({ result: result.narrative });
          }

          if (fn.name === "createBooking") {
            if (!bookingCalcId) {
              return res.json({ result: "Booking is not configured. Let me take your details and someone will call you back." });
            }
            const params = { ...(fn.parameters || {}) };
            if (!params.customer_phone && customerNumber) {
              params.customer_phone = customerNumber;
            }
            const result = await executeCreateBooking(bookingCalcId, params);
            return res.json({ result: result.narrative });
          }

          return res.json({ result: `Function ${fn.name} is not implemented` });
        }

        case "status-update": {
          // Call status changed (ringing, in-progress, ended)
          const status = event.message.status;
          const callId = event.message.call?.id;
          log.info(`[vapi] Call ${callId} status: ${status}`);

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
          log.info("[vapi] Call ended:", {
            callId: report.callId,
            duration: report.duration,
            reason: report.endedReason,
            messages: report.messageCount,
          });

          // Log the completed call to ai_usage_logs
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

          // W-BA-2 (Phase 3b §5) — record voice cost against the client.
          if (tradeLineResolved?.client?.id && report.duration) {
            recordVoiceCostForClient({
              clientId: tradeLineResolved.client.id,
              durationSeconds: report.duration,
            }).catch(err =>
              log.warn(`[vapi-cost] voice cost record failed: ${(err as Error).message}`),
            );
          }

          // If this was a TradeLine call, log to tradeline_call_log + update usage
          if (tradeLineResolved) {
            const callResult = await logTradeLineCall(
              tradeLineResolved.clientService.id,
              report,
              event.message.recordingUrl ?? undefined,
            );

            // Non-blocking: extract lead + send notifications
            if (callResult.callLogId) {
              processTradeLineCallPostHook(
                tradeLineResolved.clientService.id,
                tradeLineResolved.client.id,
                callResult.callLogId,
                callResult.outcome,
                callResult.transcript,
                event.message.recordingUrl ?? undefined,
                report,
              ).catch(err =>
                log.warn(`[tradeline] post-call hook failed for call ${report.callId}: ${(err as Error).message}`),
              );
            }
          } else {
            // Not a TradeLine customer — this was a call to the WeFixTrades
            // company sales/support line. Extract caller info, log as sales
            // lead, and email the team. Non-blocking.
            handleSalesCallEnded(report).catch(err =>
              log.warn(`[wft-sales-line] post-call handler failed for ${report.callId}:`, err.message),
            );
          }

          // Clean up call cache
          if (report.callId !== "unknown") {
            activeTradeLineCalls.delete(report.callId);
          }

          return res.json({ ok: true });
        }

        case "transcript": {
          // Real-time transcript update — acknowledge only
          return res.json({ ok: true });
        }

        case "hang": {
          // Call hung up — clean up cache
          if (callId !== "unknown") {
            activeTradeLineCalls.delete(callId);
          }
          return res.json({ ok: true });
        }

        default: {
          log.info(`[vapi] Unhandled event type: ${eventType}`);
          return res.json({ ok: true });
        }
      }
    } catch (err: any) {
      log.error("[vapi] Webhook error:", err?.message);
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
      const convCallId = call?.id || req.body?.callId || "unknown";

      const vapiMessages: VapiTranscriptMessage[] = Array.isArray(messages)
        ? messages
        : [];

      // W-BA-1: per-channel emergency kill switch. When the voice channel is
      // gated OFF, route the caller to voicemail rather than the AI. Fails
      // CLOSED — if we can't read the gate, we don't take the call with AI.
      if (!(await aiChannelGateOn("voice"))) {
        return res.json({
          output: {
            content: "Thanks for calling — our team is unavailable to take this call live. Please leave a brief message after the tone and we'll get back to you shortly.",
            model: "channel-gate-off",
          },
        });
      }

      // Check for cached TradeLine context from webhook resolution
      const tradeLineCtx = activeTradeLineCalls.get(convCallId);

      // Brand sales-line calls (no TradeLine context): run the inbound
      // classifier on the first user message. Short-circuits spam, polite-
      // declines out-of-scope, escalates needs_human / availability_off into
      // a support ticket, and otherwise proceeds with normal handling.
      if (!tradeLineCtx && vapiMessages.length <= 2) {
        const firstUserMsg = vapiMessages.find((m) => m.role === "user")?.message?.trim();
        if (firstUserMsg && firstUserMsg.length > 4) {
          try {
            const { decideInboundAction } = await import("../services/inboundClassifier");
            const decision = await decideInboundAction({
              channel: "voice",
              fromIdentity: call?.customer?.number || "unknown",
              message: firstUserMsg,
            });
            log.info("[vapi] brand-call classification", {
              callId: convCallId,
              action: decision.action,
              category: decision.category,
              confidence: decision.confidence,
            });

            if (decision.action === "drop") {
              return res.json({ output: { content: "Sorry, this doesn't sound like the right number for that. Goodbye.", model: "classifier" } });
            }
            if (decision.action === "polite_decline") {
              return res.json({ output: { content: "Thanks for calling — WeFixTrades sells digital tools to trades businesses, we don't perform the trade work itself. Best of luck finding the right person!", model: "classifier" } });
            }
            if (decision.action === "ticket") {
              const ref = decision.ticketId ? ` Reference T-${decision.ticketId}.` : "";
              const intro = decision.awayMessage ?? "Thanks for calling — our team is briefly tied up. ";
              return res.json({ output: { content: `${intro}I've logged your request and someone will call you back within the hour.${ref} Have a great day!`, model: "classifier" } });
            }
            // action === "reply" → fall through to normal conversation handling
          } catch (err) {
            log.warn("[vapi] classifier failed, proceeding with normal handler", { error: (err as Error).message });
          }
        }
      }

      const reply = tradeLineCtx
        ? await handleTradeLineConversationTurn(
            vapiMessages,
            convCallId,
            await buildTradeLineContextWithKnowledge(tradeLineCtx),
            tradeLineCtx.clientService.id,
          )
        : await handleConversationTurn(vapiMessages, convCallId);

      // Vapi custom-llm expects this response format
      return res.json({
        output: {
          content: reply,
          model: getModel(),
        },
      });
    } catch (err: any) {
      log.error("[vapi] Conversation error:", err?.message);
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

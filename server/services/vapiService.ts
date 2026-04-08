/**
 * Vapi Integration Layer
 *
 * Adapter between Vapi's webhook/API format and the shared assistant core.
 * This service does NOT duplicate any intelligence — it translates Vapi-specific
 * requests into the unified AssistantRequest format and returns responses
 * in Vapi-compatible format.
 *
 * Vapi sends webhook events for call lifecycle:
 *   - assistant-request: Vapi asks for assistant config
 *   - function-call: Vapi triggers a server-side function
 *   - status-update: call status changes (ringing, in-progress, ended)
 *   - transcript: speech-to-text results
 *   - end-of-call-report: full call summary after hangup
 *   - hang: call ended
 *
 * This layer converts relevant events into shared assistant calls.
 */

import { assistantSync, isReady } from "./assistant";
import type { AssistantRequest } from "./assistant";
import type { ChatMessage } from "./aiService";
import { buildSystemPrompt, type TradeLineContext } from "./promptBuilder";
import { storage } from "../storage";
import type { TradelineConfig, ClientService, Client } from "@shared/schema";

/* ─── Vapi Config ─── */

export interface VapiConfig {
  apiKey: string;
  publicKey?: string;
  assistantId?: string;
  phoneNumberId?: string;
  webhookSecret?: string;
  serverUrl?: string;
}

/**
 * Reads Vapi configuration from environment variables.
 * Returns null values for unconfigured fields — never throws.
 */
export function getVapiConfig(): Partial<VapiConfig> {
  return {
    apiKey: process.env.VAPI_API_KEY || undefined,
    publicKey: process.env.VAPI_PUBLIC_KEY || undefined,
    assistantId: process.env.VAPI_ASSISTANT_ID || undefined,
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID || undefined,
    webhookSecret: process.env.VAPI_WEBHOOK_SECRET || undefined,
    serverUrl: process.env.VAPI_SERVER_URL || undefined,
  };
}

/* ─── Readiness Check ─── */

export interface VapiReadiness {
  configured: boolean;
  assistantReady: boolean;
  /** Whether the browser-based voice demo can run (public key + assistant ID) */
  webDemoReady: boolean;
  details: {
    hasApiKey: boolean;
    hasPublicKey: boolean;
    hasAssistantId: boolean;
    hasPhoneNumberId: boolean;
    hasWebhookSecret: boolean;
    hasServerUrl: boolean;
    assistantCoreReady: boolean;
    syncEndpointAvailable: boolean;
    webhookEndpointAvailable: boolean;
  };
  missing: string[];
}

/**
 * Check whether Vapi integration is ready to operate.
 * Returns a structured readiness report useful for admin dashboards.
 */
export function checkVapiReadiness(): VapiReadiness {
  const config = getVapiConfig();
  const assistant = isReady();

  const details = {
    hasApiKey: !!config.apiKey,
    hasPublicKey: !!config.publicKey,
    hasAssistantId: !!config.assistantId,
    hasPhoneNumberId: !!config.phoneNumberId,
    hasWebhookSecret: !!config.webhookSecret,
    hasServerUrl: !!config.serverUrl,
    assistantCoreReady: assistant.ready,
    syncEndpointAvailable: true,  // /api/chat/sync always exists
    webhookEndpointAvailable: true,  // /api/vapi/webhook always exists
  };

  const missing: string[] = [];
  if (!details.hasApiKey) missing.push("VAPI_API_KEY");
  if (!details.hasPublicKey) missing.push("VAPI_PUBLIC_KEY (required for web voice demo)");
  if (!details.hasAssistantId) missing.push("VAPI_ASSISTANT_ID");
  if (!details.hasWebhookSecret) missing.push("VAPI_WEBHOOK_SECRET");
  if (!details.hasPhoneNumberId) missing.push("VAPI_PHONE_NUMBER_ID (optional — needed for inbound calls)");
  if (!details.assistantCoreReady) missing.push("ANTHROPIC_API_KEY (shared assistant core)");

  // Vapi is "configured" when at minimum the API key is present
  const configured = details.hasApiKey;
  // Fully ready when assistant core + API key + webhook secret are all set
  const assistantReady = configured && details.assistantCoreReady && details.hasWebhookSecret;
  // Web demo needs public key + assistant ID (no API key needed on client)
  const webDemoReady = details.hasPublicKey && details.hasAssistantId;

  return { configured, assistantReady, webDemoReady, details, missing };
}

/* ─── Vapi Webhook Event Types ─── */

export interface VapiWebhookEvent {
  message: {
    type: string;
    call?: VapiCallObject;
    transcript?: string;
    functionCall?: { name: string; parameters: Record<string, any> };
    status?: string;
    endedReason?: string;
    /** End-of-call report fields */
    summary?: string;
    recordingUrl?: string;
    stereoRecordingUrl?: string;
    artifact?: {
      messages?: VapiTranscriptMessage[];
      transcript?: string;
    };
    /** For conversation-update / assistant-request */
    messages?: VapiTranscriptMessage[];
  };
}

export interface VapiCallObject {
  id: string;
  orgId?: string;
  assistantId?: string;
  phoneNumberId?: string;
  type?: string;
  status?: string;
  startedAt?: string;
  endedAt?: string;
  customer?: {
    number?: string;
    name?: string;
  };
}

export interface VapiTranscriptMessage {
  role: "user" | "assistant" | "system" | "bot";
  message: string;
  time?: number;
  secondsFromStart?: number;
}

/* ─── Webhook Signature Verification ─── */

/**
 * Verify a Vapi webhook signature.
 * Vapi sends an x-vapi-signature header containing an HMAC-SHA256
 * of the raw body using the webhook secret.
 *
 * Returns true if valid or if verification is skipped (no secret configured).
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string | undefined,
): boolean {
  const config = getVapiConfig();
  if (!config.webhookSecret) {
    // No secret configured — skip verification but log a warning
    console.warn("[vapi] No VAPI_WEBHOOK_SECRET configured — skipping signature verification");
    return true;
  }

  if (!signature) {
    return false;
  }

  try {
    const crypto = require("crypto");
    const expected = crypto
      .createHmac("sha256", config.webhookSecret)
      .update(typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8"))
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

/* ─── Translate Vapi transcript into shared ChatMessage[] ─── */

/**
 * Converts Vapi's transcript message format into the shared assistant
 * ChatMessage[] format used by the assistant core.
 */
export function translateTranscript(vapiMessages: VapiTranscriptMessage[]): ChatMessage[] {
  return vapiMessages
    .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "bot")
    .map((m) => ({
      role: m.role === "bot" ? "assistant" : m.role as "user" | "assistant",
      content: m.message,
    }));
}

/* ─── Handle Vapi conversation turn ─── */

/**
 * Process a Vapi conversation-update or assistant-request event
 * by routing through the shared assistant core.
 *
 * Returns the assistant's text reply for Vapi to speak via TTS.
 */
export async function handleConversationTurn(
  messages: VapiTranscriptMessage[],
  callId: string,
): Promise<string> {
  const chatMessages = translateTranscript(messages);

  if (!chatMessages.length) {
    return "Hi, thanks for calling WeFixTrades! How can I help you today?";
  }

  const req: AssistantRequest = {
    surface: "vapi",
    messages: chatMessages,
    sessionId: `vapi-${callId}`,
    maxTokens: 150,  // Keep voice responses short
  };

  const result = await assistantSync(req);
  return result.reply;
}

/* ─── Handle end-of-call report ─── */

export interface VapiCallReport {
  callId: string;
  duration?: number;
  endedReason?: string;
  summary?: string;
  transcript?: string;
  messageCount: number;
  customerNumber?: string;
}

/**
 * Extract a structured call report from Vapi's end-of-call-report event.
 * This data can be logged, archived, or forwarded to the admin dashboard.
 */
export function extractCallReport(event: VapiWebhookEvent): VapiCallReport {
  const msg = event.message;
  const call = msg.call;
  const artifact = msg.artifact;

  const messages = artifact?.messages || msg.messages || [];

  return {
    callId: call?.id || "unknown",
    endedReason: msg.endedReason || msg.status,
    summary: msg.summary,
    transcript: artifact?.transcript,
    messageCount: messages.length,
    customerNumber: call?.customer?.number,
    duration: call?.startedAt && call?.endedAt
      ? Math.round((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000)
      : undefined,
  };
}

/* ─── TradeLine Client Resolution ─── */

/**
 * Resolved TradeLine context for a call — contains the client, service,
 * and TradeLine config needed for per-client prompting and logging.
 */
export interface ResolvedTradeLineClient {
  clientService: ClientService;
  client: Client;
  config: TradelineConfig;
}

/**
 * Attempt to resolve a TradeLine client_service from call metadata.
 *
 * Resolution strategies (in priority order):
 * 1. Explicit client_service_id in Vapi call metadata (future: set via Vapi assistant metadata)
 * 2. Future: phone number lookup (requires per-client number table)
 *
 * Returns null if no TradeLine context can be resolved — the call
 * falls back to the default WeFixTrades assistant.
 */
export async function resolveTradeLineClient(
  callMetadata?: Record<string, any>,
  customerNumber?: string,
): Promise<ResolvedTradeLineClient | null> {
  try {
    // Strategy 1: explicit client_service_id in metadata
    const csId = callMetadata?.clientServiceId ?? callMetadata?.client_service_id;
    if (csId) {
      const numId = typeof csId === "number" ? csId : parseInt(csId);
      if (!isNaN(numId)) {
        return resolveByClientServiceId(numId);
      }
    }

    // Strategy 2: phone number lookup (placeholder for future per-client routing)
    // When per-client phone numbers are stored, look up clientService by
    // tradelineConfig.phoneRouting.primaryBusinessNumber matching the Vapi phone number.
    // For now, this is a no-op.

    return null;
  } catch (err) {
    console.error("[vapi] TradeLine client resolution failed:", err);
    return null;
  }
}

async function resolveByClientServiceId(csId: number): Promise<ResolvedTradeLineClient | null> {
  const cs = await storage.getClientServiceById(csId);
  if (!cs || !cs.service_id.startsWith("tradeline")) return null;

  const config = await storage.getTradeLineConfig(csId);
  if (!config) return null;

  const client = await storage.getClientById(cs.client_id);
  if (!client) return null;

  return { clientService: cs, client, config };
}

/**
 * Build a TradeLineContext for the prompt builder from resolved client data.
 */
export function buildTradeLineContext(resolved: ResolvedTradeLineClient): TradeLineContext {
  return {
    businessName: resolved.client.business_name,
    tradeType: resolved.client.trade_type ?? undefined,
    serviceArea: undefined, // could be enriched from onboarding data later
    mode: resolved.config.currentMode,
    channels: resolved.config.channels,
    booking: resolved.config.booking,
    phoneRouting: resolved.config.phoneRouting,
  };
}

/* ─── TradeLine-aware conversation handler ─── */

/**
 * Process a conversation turn with TradeLine context.
 * Uses the per-client mode-aware prompt instead of the generic WeFixTrades prompt.
 */
export async function handleTradeLineConversationTurn(
  messages: VapiTranscriptMessage[],
  callId: string,
  tradeLineCtx: TradeLineContext,
): Promise<string> {
  const chatMessages = translateTranscript(messages);

  if (!chatMessages.length) {
    const greeting = tradeLineCtx.mode === "after_hours"
      ? `Hi, thanks for calling ${tradeLineCtx.businessName}! We're closed for the day, but I can help make sure you're looked after.`
      : `Hi, thanks for calling ${tradeLineCtx.businessName}! How can I help you today?`;
    return greeting;
  }

  const systemPrompt = buildSystemPrompt("vapi", undefined, undefined, undefined, tradeLineCtx);

  const req: AssistantRequest = {
    surface: "vapi",
    messages: chatMessages,
    sessionId: `vapi-${callId}`,
    maxTokens: 150,
    systemOverride: systemPrompt,
  };

  const result = await assistantSync(req);
  return result.reply;
}

/* ─── TradeLine call logging ─── */

/**
 * Log a completed Vapi call to the tradeline_call_log table
 * and increment usage counters for the billing period.
 */
export async function logTradeLineCall(
  clientServiceId: number,
  report: VapiCallReport,
  recordingUrl?: string,
): Promise<void> {
  try {
    const vapiCallId = report.callId !== "unknown" ? report.callId : null;

    if (!vapiCallId) {
      console.warn("[vapi] Call has no vapi_call_id — cannot guarantee idempotency, skipping log");
      return;
    }

    // Idempotent insert — returns null if this vapi_call_id was already logged
    const inserted = await storage.createTradeLineCallLog({
      client_service_id: clientServiceId,
      vapi_call_id: vapiCallId,
      direction: "inbound",
      caller_number: report.customerNumber ?? null,
      duration_seconds: report.duration ?? 0,
      outcome: report.endedReason === "error" ? "failed" : "answered",
      started_at: null, // Vapi doesn't always provide start time in report
      ended_at: new Date(),
      summary: report.summary ?? null,
      transcript_json: report.transcript ? { text: report.transcript } : null,
      recording_url: recordingUrl ?? null,
    });

    if (!inserted) {
      console.log(`[vapi] Duplicate call log skipped for vapi_call_id=${report.callId}`);
      return; // Do NOT increment usage for duplicate webhooks
    }

    // Update usage for current billing period — only on first insert
    const durationMinutes = report.duration ? Math.ceil(report.duration / 60) : 0;
    if (durationMinutes > 0) {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      await storage.incrementTradeLineUsage(clientServiceId, periodStart, periodEnd, {
        voiceMinutes: durationMinutes,
        calls: 1,
      });
    }
  } catch (err) {
    console.error("[vapi] Failed to log TradeLine call:", err);
  }
}

/* ─── Build Vapi assistant config response ─── */

/**
 * When Vapi sends an "assistant-request" webhook, it expects a response
 * containing the assistant configuration. This builds that response
 * using our server URL as the conversation handler.
 */
export function buildAssistantConfig(): Record<string, any> {
  const config = getVapiConfig();

  return {
    assistant: {
      model: {
        provider: "custom-llm",
        url: config.serverUrl
          ? `${config.serverUrl}/api/vapi/conversation`
          : "/api/vapi/conversation",
      },
      voice: {
        provider: "11labs",
        voiceId: "21m00Tcm4TlvDq8ikWAM",  // Placeholder — configure in Vapi dashboard
      },
      firstMessage: "Hi, thanks for calling WeFixTrades! I can help you learn about our services, get a quick estimate, or schedule a consultation. What can I help you with?",
      transcriber: {
        provider: "deepgram",
        model: "nova-2",
        language: "en",
      },
    },
  };
}

/* ─── Per-Client Vapi Assistant CRUD ─── */

const VAPI_API_BASE = "https://api.vapi.ai";

/**
 * Create or update a Vapi assistant for a specific TradeLine client service.
 *
 * If the client service already has a vapiAssistantId in metadata,
 * updates the existing assistant. Otherwise creates a new one.
 *
 * Returns the Vapi assistant ID.
 */
export async function upsertVapiAssistant(
  clientServiceId: number,
  systemPrompt: string,
  firstMessage: string,
  assistantName: string,
): Promise<{ assistantId: string; created: boolean }> {
  const config = getVapiConfig();
  if (!config.apiKey) {
    throw new Error("VAPI_API_KEY not configured — cannot manage assistants");
  }

  // Check for existing assistant ID in metadata
  const cs = await storage.getClientServiceById(clientServiceId);
  const rawMeta = (cs?.metadata as Record<string, any>) ?? {};
  const existingId = rawMeta?.tradeline?.assistant?.vapiAssistantId;

  const assistantPayload = {
    name: assistantName,
    model: {
      provider: "custom-llm" as const,
      url: config.serverUrl
        ? `${config.serverUrl}/api/vapi/conversation`
        : "/api/vapi/conversation",
      messages: [{ role: "system", content: systemPrompt }],
    },
    voice: {
      provider: "11labs" as const,
      voiceId: "21m00Tcm4TlvDq8ikWAM",
    },
    firstMessage,
    transcriber: {
      provider: "deepgram" as const,
      model: "nova-2",
      language: "en",
    },
    serverUrl: config.serverUrl
      ? `${config.serverUrl}/api/vapi/webhook`
      : undefined,
    metadata: {
      client_service_id: String(clientServiceId),
      source: "tradeline_template_engine",
    },
  };

  if (existingId) {
    // Update existing assistant
    const resp = await fetch(`${VAPI_API_BASE}/assistant/${existingId}`, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(assistantPayload),
    });

    if (!resp.ok) {
      const body = await resp.text();
      // If assistant was deleted externally, fall through to create
      if (resp.status === 404) {
        console.warn(`[vapi] Assistant ${existingId} not found — will create new`);
      } else {
        throw new Error(`Vapi assistant update failed (${resp.status}): ${body}`);
      }
    } else {
      console.log(`[vapi] Updated assistant ${existingId} for service #${clientServiceId}`);
      return { assistantId: existingId, created: false };
    }
  }

  // Create new assistant
  const resp = await fetch(`${VAPI_API_BASE}/assistant`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(assistantPayload),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Vapi assistant creation failed (${resp.status}): ${body}`);
  }

  const data = await resp.json();
  const newId = data.id;
  if (!newId) throw new Error("Vapi returned no assistant ID");

  console.log(`[vapi] Created assistant ${newId} for service #${clientServiceId}`);
  return { assistantId: newId, created: true };
}

/**
 * Full pipeline: build assistant definition → push to Vapi → store ID in metadata.
 *
 * This is the main entry point for automated assistant provisioning.
 */
export async function provisionTradeLineAssistant(
  clientServiceId: number,
): Promise<{
  assistantId: string | null;
  skipped: boolean;
  skipReason?: string;
  definition?: import("./tradelineTemplates").AssistantDefinition;
}> {
  // Lazy import to avoid circular dependency
  const { buildTradeLineAssistant } = await import("./tradelineTemplates");

  // 1. Build the assistant definition
  const result = await buildTradeLineAssistant(clientServiceId);

  if (result.skipped) {
    return {
      assistantId: null,
      skipped: true,
      skipReason: result.skipReason,
      definition: result.definition,
    };
  }

  // 2. Push to Vapi (if API key is configured)
  const vapiConfig = getVapiConfig();
  let assistantId: string | null = null;

  if (vapiConfig.apiKey) {
    const name = `TradeLine — ${result.input.businessName}`;
    const upsertResult = await upsertVapiAssistant(
      clientServiceId,
      result.definition.systemPrompt,
      result.definition.firstMessage,
      name,
    );
    assistantId = upsertResult.assistantId;

    // 3. Store the Vapi assistant ID in metadata
    const cs = await storage.getClientServiceById(clientServiceId);
    const rawMeta = (cs?.metadata as Record<string, any>) ?? {};
    rawMeta.tradeline = rawMeta.tradeline ?? {};
    rawMeta.tradeline.assistant = {
      ...rawMeta.tradeline.assistant,
      vapiAssistantId: assistantId,
    };
    await storage.updateClientServiceMetadata(clientServiceId, rawMeta);
  } else {
    console.warn("[vapi] VAPI_API_KEY not set — assistant built but not pushed to Vapi");
  }

  // 4. Log the build
  const cs = await storage.getClientServiceById(clientServiceId);
  await storage.logAdminActivity({
    actor_type: "system",
    actor_name: "TradeLine Template Engine",
    action: "tradeline.assistant_built",
    entity_type: "client_service",
    entity_id: clientServiceId,
    summary: `Built assistant (template: ${result.definition.templateId}, hash: ${result.definition.inputHash})${assistantId ? ` → Vapi ID: ${assistantId}` : " (Vapi not configured)"}`,
    metadata: {
      templateId: result.definition.templateId,
      inputHash: result.definition.inputHash,
      vapiAssistantId: assistantId,
      clientId: cs?.client_id,
    },
  });

  return {
    assistantId,
    skipped: false,
    definition: result.definition,
  };
}

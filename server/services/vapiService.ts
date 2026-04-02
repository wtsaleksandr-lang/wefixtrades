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

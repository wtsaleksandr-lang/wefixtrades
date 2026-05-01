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
import { createLogger } from "../lib/logger";

const log = createLogger("VapiService");

/* ─── Startup readiness warning ─── */
if (!process.env.VAPI_API_KEY) {
  log.warn("VAPI_API_KEY is not set — voice features will return fallback responses");
}

/* ─── Vapi Config ─── */

export interface VapiConfig {
  apiKey: string;
  publicKey?: string;
  assistantId?: string;
  phoneNumberId?: string;
  webhookSecret?: string;
  serverUrl?: string;
}

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
    syncEndpointAvailable: true,
    webhookEndpointAvailable: true,
  };
  const missing: string[] = [];
  if (!details.hasApiKey) missing.push("VAPI_API_KEY");
  if (!details.hasPublicKey) missing.push("VAPI_PUBLIC_KEY (required for web voice demo)");
  if (!details.hasAssistantId) missing.push("VAPI_ASSISTANT_ID");
  if (!details.hasWebhookSecret) missing.push("VAPI_WEBHOOK_SECRET");
  if (!details.hasPhoneNumberId) missing.push("VAPI_PHONE_NUMBER_ID (optional — needed for inbound calls)");
  if (!details.assistantCoreReady) missing.push("ANTHROPIC_API_KEY (shared assistant core)");
  const configured = details.hasApiKey;
  const assistantReady = configured && details.assistantCoreReady && details.hasWebhookSecret;
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
    summary?: string;
    recordingUrl?: string;
    stereoRecordingUrl?: string;
    artifact?: { messages?: VapiTranscriptMessage[]; transcript?: string };
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
  customer?: { number?: string; name?: string };
}

export interface VapiTranscriptMessage {
  role: "user" | "assistant" | "system" | "bot";
  message: string;
  time?: number;
  secondsFromStart?: number;
}

/* ─── Webhook Signature Verification ─── */

export function verifyWebhookSignature(rawBody: string | Buffer, signature: string | undefined): boolean {
  const config = getVapiConfig();
  if (!config.webhookSecret) {
    log.warn("No VAPI_WEBHOOK_SECRET configured — skipping signature verification");
    return true;
  }
  if (!signature) return false;
  try {
    const crypto = require("crypto");
    const expected = crypto.createHmac("sha256", config.webhookSecret)
      .update(typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8")).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/* ─── Translate Vapi transcript into shared ChatMessage[] ─── */

export function translateTranscript(vapiMessages: VapiTranscriptMessage[]): ChatMessage[] {
  return vapiMessages
    .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "bot")
    .map((m) => ({ role: m.role === "bot" ? "assistant" : m.role as "user" | "assistant", content: m.message }));
}

/* ─── Handle Vapi conversation turn (with fallback) ─── */

export async function handleConversationTurn(messages: VapiTranscriptMessage[], callId: string): Promise<string> {
  const chatMessages = translateTranscript(messages);
  if (!chatMessages.length) return "Hi, thanks for calling WeFixTrades! How can I help you today?";

  try {
    const req: AssistantRequest = { surface: "vapi", messages: chatMessages, sessionId: `vapi-${callId}`, maxTokens: 150 };
    const result = await assistantSync(req);
    return result.reply;
  } catch (err: any) {
    log.error("Conversation turn failed, returning fallback", { callId, error: err.message });
    return "I'm sorry, I'm having a little trouble right now. Could you please call back in a few minutes, or leave your name and number and we'll get back to you?";
  }
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
      ? Math.round((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000) : undefined,
  };
}

/* ─── TradeLine Client Resolution ─── */

export interface ResolvedTradeLineClient {
  clientService: ClientService;
  client: Client;
  config: TradelineConfig;
}

export async function resolveTradeLineClient(callMetadata?: Record<string, any>, customerNumber?: string): Promise<ResolvedTradeLineClient | null> {
  try {
    const csId = callMetadata?.clientServiceId ?? callMetadata?.client_service_id;
    if (csId) {
      const numId = typeof csId === "number" ? csId : parseInt(csId);
      if (!isNaN(numId)) return resolveByClientServiceId(numId);
    }
    return null;
  } catch (err) {
    log.error("TradeLine client resolution failed", { error: (err as Error).message });
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

export function buildTradeLineContext(resolved: ResolvedTradeLineClient): TradeLineContext {
  return {
    businessName: resolved.client.business_name,
    tradeType: resolved.client.trade_type ?? undefined,
    serviceArea: undefined,
    mode: resolved.config.currentMode,
    channels: resolved.config.channels,
    booking: resolved.config.booking,
    phoneRouting: resolved.config.phoneRouting,
  };
}

/* ─── TradeLine-aware conversation handler (with fallback) ─── */

export async function handleTradeLineConversationTurn(messages: VapiTranscriptMessage[], callId: string, tradeLineCtx: TradeLineContext): Promise<string> {
  const chatMessages = translateTranscript(messages);
  if (!chatMessages.length) {
    return tradeLineCtx.mode === "after_hours"
      ? `Hi, thanks for calling ${tradeLineCtx.businessName}! We're closed for the day, but I can help make sure you're looked after.`
      : `Hi, thanks for calling ${tradeLineCtx.businessName}! How can I help you today?`;
  }

  try {
    const systemPrompt = buildSystemPrompt("vapi", undefined, undefined, undefined, tradeLineCtx);
    const req: AssistantRequest = { surface: "vapi", messages: chatMessages, sessionId: `vapi-${callId}`, maxTokens: 150, systemOverride: systemPrompt };
    const result = await assistantSync(req);
    return result.reply;
  } catch (err: any) {
    log.error("TradeLine conversation turn failed, returning fallback", { callId, error: err.message });
    const name = tradeLineCtx.businessName || "us";
    return `I apologize, I'm having a temporary issue. Please leave your name and number, or try calling ${name} back in a few minutes.`;
  }
}

/* ─── TradeLine call logging ─── */

export async function logTradeLineCall(clientServiceId: number, report: VapiCallReport, recordingUrl?: string): Promise<void> {
  try {
    const vapiCallId = report.callId !== "unknown" ? report.callId : null;
    if (!vapiCallId) { log.warn("Call has no vapi_call_id — cannot guarantee idempotency, skipping log"); return; }

    const inserted = await storage.createTradeLineCallLog({
      client_service_id: clientServiceId, vapi_call_id: vapiCallId, direction: "inbound",
      caller_number: report.customerNumber ?? null, duration_seconds: report.duration ?? 0,
      outcome: report.endedReason === "error" ? "failed" : "answered",
      started_at: null, ended_at: new Date(), summary: report.summary ?? null,
      transcript_json: report.transcript ? { text: report.transcript } : null, recording_url: recordingUrl ?? null,
    });

    if (!inserted) { log.debug("Duplicate call log skipped", { vapiCallId: report.callId }); return; }

    const durationMinutes = report.duration ? Math.ceil(report.duration / 60) : 0;
    if (durationMinutes > 0) {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      await storage.incrementTradeLineUsage(clientServiceId, periodStart, periodEnd, { voiceMinutes: durationMinutes, calls: 1 });
    }
  } catch (err) {
    log.error("Failed to log TradeLine call", { error: (err as Error).message });
  }
}

/* ─── Build Vapi assistant config response ─── */

export function buildAssistantConfig(): Record<string, any> {
  const config = getVapiConfig();
  return {
    assistant: {
      name: "WeFixTrades Sales & Support",
      model: { provider: "custom-llm", url: config.serverUrl ? `${config.serverUrl}/api/vapi/conversation` : "/api/vapi/conversation" },
      voice: { provider: "11labs", voiceId: process.env.VAPI_WFT_VOICE_ID || "21m00Tcm4TlvDq8ikWAM" },
      firstMessage: "WeFixTrades, this is Riley — how can I help?",
      endCallMessage: "Thanks for calling WeFixTrades. We'll follow up by email shortly — have a great rest of your day.",
      maxDurationSeconds: 900, recordingEnabled: true,
      transcriber: { provider: "deepgram", model: "nova-2", language: "en" },
      endCallPhrases: ["goodbye", "bye", "thanks bye"],
    },
  };
}

/* ─── Per-Client Vapi Assistant CRUD (with graceful fallback) ─── */

const VAPI_API_BASE = "https://api.vapi.ai";

export async function upsertVapiAssistant(
  clientServiceId: number, systemPrompt: string, firstMessage: string, assistantName: string,
  voiceConfig?: { provider: string; voiceId: string }, transcriberLanguage?: string,
): Promise<{ assistantId: string; created: boolean }> {
  const config = getVapiConfig();
  if (!config.apiKey) {
    log.warn("VAPI_API_KEY not configured — cannot manage assistants");
    throw new Error("Voice service is not configured. Set VAPI_API_KEY to enable assistant management.");
  }

  const cs = await storage.getClientServiceById(clientServiceId);
  const rawMeta = (cs?.metadata as Record<string, any>) ?? {};
  const existingId = rawMeta?.tradeline?.assistant?.vapiAssistantId;

  const payload = {
    name: assistantName,
    model: { provider: "custom-llm" as const, url: config.serverUrl ? `${config.serverUrl}/api/vapi/conversation` : "/api/vapi/conversation", messages: [{ role: "system", content: systemPrompt }] },
    voice: { provider: (voiceConfig?.provider || "11labs") as "11labs", voiceId: voiceConfig?.voiceId || "21m00Tcm4TlvDq8ikWAM" },
    firstMessage,
    transcriber: { provider: "deepgram" as const, model: "nova-2", language: transcriberLanguage || "en" },
    serverUrl: config.serverUrl ? `${config.serverUrl}/api/vapi/webhook` : undefined,
    metadata: { client_service_id: String(clientServiceId), source: "tradeline_template_engine" },
  };

  if (existingId) {
    try {
      const resp = await fetch(`${VAPI_API_BASE}/assistant/${existingId}`, { method: "PATCH", headers: { "Authorization": `Bearer ${config.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!resp.ok) {
        const body = await resp.text();
        if (resp.status === 404) { log.warn("Assistant not found — will create new", { existingId }); }
        else throw new Error(`Vapi assistant update failed (${resp.status}): ${body}`);
      } else {
        log.info("Updated Vapi assistant", { assistantId: existingId, clientServiceId });
        return { assistantId: existingId, created: false };
      }
    } catch (err: any) {
      if (err.message?.includes("Vapi assistant update failed")) throw err;
      log.error("Vapi API unreachable during assistant update", { existingId, error: err.message });
      throw new Error(`Voice service temporarily unavailable: ${err.message}`);
    }
  }

  try {
    const resp = await fetch(`${VAPI_API_BASE}/assistant`, { method: "POST", headers: { "Authorization": `Bearer ${config.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!resp.ok) { const body = await resp.text(); throw new Error(`Vapi assistant creation failed (${resp.status}): ${body}`); }
    const data = await resp.json();
    const newId = data.id;
    if (!newId) throw new Error("Vapi returned no assistant ID");
    log.info("Created Vapi assistant", { assistantId: newId, clientServiceId });
    return { assistantId: newId, created: true };
  } catch (err: any) {
    if (err.message?.includes("Vapi assistant creation failed") || err.message?.includes("Vapi returned no")) throw err;
    log.error("Vapi API unreachable during assistant creation", { error: err.message });
    throw new Error(`Voice service temporarily unavailable: ${err.message}`);
  }
}

export async function provisionTradeLineAssistant(clientServiceId: number): Promise<{ assistantId: string | null; skipped: boolean; skipReason?: string; definition?: import("./tradelineTemplates").AssistantDefinition; error?: string }> {
  const { buildTradeLineAssistant } = await import("./tradelineTemplates");
  let result;
  try { result = await buildTradeLineAssistant(clientServiceId); } catch (err: any) {
    log.error("Assistant build failed", { clientServiceId, error: err.message });
    await storage.logAdminActivity({ actor_type: "system", actor_name: "TradeLine Template Engine", action: "tradeline.assistant_build_failed", entity_type: "client_service", entity_id: clientServiceId, summary: `Assistant build failed: ${err.message}` });
    return { assistantId: null, skipped: false, error: err.message };
  }
  if (result.skipped) return { assistantId: null, skipped: true, skipReason: result.skipReason, definition: result.definition };

  const vapiConfig = getVapiConfig();
  let assistantId: string | null = null;
  if (vapiConfig.apiKey) {
    try {
      const name = `TradeLine — ${result.input.businessName}`;
      const upsertResult = await upsertVapiAssistant(clientServiceId, result.definition.systemPrompt, result.definition.firstMessage, name, result.definition.voiceConfig, result.definition.transcriberLanguage);
      assistantId = upsertResult.assistantId;
      const latestConfig = await storage.getTradeLineConfig(clientServiceId);
      const ca = latestConfig?.assistant;
      await storage.updateTradeLineConfig(clientServiceId, { assistant: { status: ca?.status ?? "not_built", templateId: ca?.templateId ?? "", inputHash: ca?.inputHash ?? "", vapiAssistantId: assistantId, lastBuiltAt: ca?.lastBuiltAt ?? "", lastBuildError: ca?.lastBuildError ?? "", manualOverride: ca?.manualOverride ?? false } });
    } catch (err: any) {
      log.error("Push to Vapi failed", { clientServiceId, error: err.message });
      const latestConfig = await storage.getTradeLineConfig(clientServiceId);
      const ca = latestConfig?.assistant;
      await storage.updateTradeLineConfig(clientServiceId, { assistant: { status: "failed", templateId: ca?.templateId ?? "", inputHash: ca?.inputHash ?? "", vapiAssistantId: ca?.vapiAssistantId ?? "", lastBuiltAt: ca?.lastBuiltAt ?? "", lastBuildError: `Vapi push failed: ${err.message}`, manualOverride: ca?.manualOverride ?? false } });
      await storage.logAdminActivity({ actor_type: "system", actor_name: "TradeLine Template Engine", action: "tradeline.vapi_push_failed", entity_type: "client_service", entity_id: clientServiceId, summary: `Vapi push failed: ${err.message}` });
      return { assistantId: null, skipped: false, error: `Vapi push failed: ${err.message}`, definition: result.definition };
    }
  } else {
    log.warn("VAPI_API_KEY not set — assistant built but not pushed to Vapi");
  }

  await storage.logAdminActivity({ actor_type: "system", actor_name: "TradeLine Template Engine", action: "tradeline.assistant_built", entity_type: "client_service", entity_id: clientServiceId, summary: `Built assistant (template: ${result.definition.templateId}, hash: ${result.definition.inputHash})${assistantId ? ` → Vapi ID: ${assistantId}` : " (Vapi not configured)"}`, metadata: { templateId: result.definition.templateId, inputHash: result.definition.inputHash, vapiAssistantId: assistantId } });
  return { assistantId, skipped: false, definition: result.definition };
}

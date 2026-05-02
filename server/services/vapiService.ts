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
import { chat, type ChatMessage } from "./aiService";
import { buildSystemPrompt, type TradeLineContext } from "./promptBuilder";
import { storage } from "../storage";
import type { TradelineConfig, ClientService, Client, TradelineLeadData } from "@shared/schema";
import { VAPI_BOOKING_FUNCTIONS } from "./bookingTools";
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

/**
 * Verifies Vapi webhook signature using the raw request body buffer.
 * In production: rejects if VAPI_WEBHOOK_SECRET is not set (500 at route level).
 * In development: allows unverified webhooks with a warning.
 */
export function verifyWebhookSignature(rawBody: Buffer | undefined, signature: string | undefined): boolean {
  const config = getVapiConfig();
  const isProd = process.env.NODE_ENV === "production";

  if (!config.webhookSecret) {
    if (isProd) {
      log.error("VAPI_WEBHOOK_SECRET is not set in production — rejecting webhook");
      return false;
    }
    log.warn("No VAPI_WEBHOOK_SECRET configured — allowing unverified webhook in development");
    return true;
  }

  if (!rawBody) {
    log.warn("No raw body available for signature verification");
    return false;
  }

  if (!signature) {
    log.warn("No x-vapi-signature header present");
    return false;
  }

  try {
    const crypto = require("crypto");
    const expected = crypto.createHmac("sha256", config.webhookSecret)
      .update(rawBody)
      .digest("hex");
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch (err) {
    log.error("Webhook signature verification threw", { error: (err as Error).message });
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

/* ─── Phone-number -> clientServiceId lookup cache (5-min TTL) ─── */
interface PhoneCacheEntry {
  clientServiceId: number;
  expiresAt: number;
}
const PHONE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const phoneNumberCache = new Map<string, PhoneCacheEntry>();

function getCachedClientServiceId(key: string): number | undefined {
  const entry = phoneNumberCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    phoneNumberCache.delete(key);
    return undefined;
  }
  return entry.clientServiceId;
}

function setCachedClientServiceId(key: string, csId: number): void {
  phoneNumberCache.set(key, { clientServiceId: csId, expiresAt: Date.now() + PHONE_CACHE_TTL_MS });
}

/**
 * Resolve which TradeLine client a Vapi call belongs to.
 *
 * Strategy 1: metadata.clientServiceId (explicit assignment from Vapi assistant config)
 * Strategy 2: phoneNumberId lookup (Vapi phone number -> client_services metadata)
 * Strategy 3: primaryBusinessNumber match (client's business number forwards to Vapi)
 */
export async function resolveTradeLineClient(
  callMetadata?: Record<string, any>,
  customerNumber?: string,
  phoneNumberId?: string,
): Promise<ResolvedTradeLineClient | null> {
  try {
    // Strategy 1: explicit clientServiceId in call metadata
    const csId = callMetadata?.clientServiceId ?? callMetadata?.client_service_id;
    if (csId) {
      const numId = typeof csId === "number" ? csId : parseInt(csId);
      if (!isNaN(numId)) {
        const resolved = await resolveByClientServiceId(numId);
        if (resolved) return resolved;
      }
    }

    // Strategy 2: lookup by Vapi phoneNumberId (the Vapi number that received the call)
    if (phoneNumberId) {
      const cacheKey = `vapi-phone:${phoneNumberId}`;
      const cached = getCachedClientServiceId(cacheKey);
      if (cached) {
        const resolved = await resolveByClientServiceId(cached);
        if (resolved) return resolved;
      }

      const csIdByPhone = await storage.findClientServiceByVapiPhoneNumberId(phoneNumberId);
      if (csIdByPhone) {
        setCachedClientServiceId(cacheKey, csIdByPhone);
        const resolved = await resolveByClientServiceId(csIdByPhone);
        if (resolved) return resolved;
      }
    }

    // Strategy 3: lookup by the CALLED number matching a client's primaryBusinessNumber
    // (handles the case where the client's business number forwards to Vapi)
    if (callMetadata?.calledNumber) {
      const calledNumber = callMetadata.calledNumber;
      const cacheKey = `biz-phone:${calledNumber}`;
      const cached = getCachedClientServiceId(cacheKey);
      if (cached) {
        const resolved = await resolveByClientServiceId(cached);
        if (resolved) return resolved;
      }

      const csIdByBiz = await storage.findClientServiceByPrimaryBusinessNumber(calledNumber);
      if (csIdByBiz) {
        setCachedClientServiceId(cacheKey, csIdByBiz);
        const resolved = await resolveByClientServiceId(csIdByBiz);
        if (resolved) return resolved;
      }
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
  // Reject calls to disabled assistants
  if (config.assistant?.status === "disabled") {
    log.warn("Call routed to disabled TradeLine assistant — rejecting", { clientServiceId: csId });
    return null;
  }
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

export interface TradeLineCallResult {
  callLogId: number | null;
  outcome: string;
  transcript: string | null;
}

export async function logTradeLineCall(clientServiceId: number, report: VapiCallReport, recordingUrl?: string): Promise<TradeLineCallResult> {
  const outcome = report.endedReason === "error" ? "failed" : "answered";
  try {
    const vapiCallId = report.callId !== "unknown" ? report.callId : null;
    if (!vapiCallId) {
      log.warn("Call has no vapi_call_id — cannot guarantee idempotency, skipping log");
      return { callLogId: null, outcome, transcript: report.transcript ?? null };
    }

    const inserted = await storage.createTradeLineCallLog({
      client_service_id: clientServiceId, vapi_call_id: vapiCallId, direction: "inbound",
      caller_number: report.customerNumber ?? null, duration_seconds: report.duration ?? 0,
      outcome,
      started_at: null, ended_at: new Date(), summary: report.summary ?? null,
      transcript_json: report.transcript ? { text: report.transcript } : null, recording_url: recordingUrl ?? null,
    });

    if (!inserted) {
      log.debug("Duplicate call log skipped", { vapiCallId: report.callId });
      return { callLogId: null, outcome, transcript: report.transcript ?? null };
    }

    const durationMinutes = report.duration ? Math.ceil(report.duration / 60) : 0;
    if (durationMinutes > 0) {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      await storage.incrementTradeLineUsage(clientServiceId, periodStart, periodEnd, { voiceMinutes: durationMinutes, calls: 1 });
    }

    return { callLogId: inserted.id, outcome, transcript: report.transcript ?? null };
  } catch (err) {
    log.error("Failed to log TradeLine call", { error: (err as Error).message });
    return { callLogId: null, outcome, transcript: report.transcript ?? null };
  }
}

/* ─── TradeLine post-call: lead extraction + notifications ─── */

const LEAD_EXTRACTION_SYSTEM_PROMPT = `Extract the following from this phone call transcript: caller_name, caller_phone, caller_address, job_type, urgency (low/medium/high/emergency), job_description, preferred_date. Return JSON only. If a field cannot be determined from the transcript, omit it. Do not include any markdown formatting or explanation.`;

/**
 * Extract structured lead data from a call transcript using Claude.
 * Fail-safe: never throws, returns null on failure.
 */
export async function extractLeadFromTranscript(transcript: string): Promise<TradelineLeadData | null> {
  try {
    const response = await chat({
      system: LEAD_EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: transcript }],
      maxTokens: 400,
    });

    // Parse JSON from response — handle potential markdown wrapping
    const jsonStr = response.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(jsonStr);
    return parsed as TradelineLeadData;
  } catch (err) {
    log.error("Lead extraction from transcript failed", { error: (err as Error).message });
    return null;
  }
}

/**
 * SMS rate limiter: tracks last notification time per phone number.
 * Simple in-memory map, resets on restart (acceptable for 5-min threshold).
 */
const smsRateLimitMap = new Map<string, number>();
const SMS_RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

function canSendSmsTo(phone: string): boolean {
  const lastSent = smsRateLimitMap.get(phone);
  if (!lastSent) return true;
  return Date.now() - lastSent >= SMS_RATE_LIMIT_MS;
}

function markSmsSent(phone: string): void {
  smsRateLimitMap.set(phone, Date.now());
}

/**
 * Post-call processing: extract lead + send notifications.
 * Called asynchronously after logTradeLineCall — must not block the webhook response.
 */
export async function processTradeLineCallPostHook(
  clientServiceId: number,
  clientId: number,
  callLogId: number,
  outcome: string,
  transcript: string | null,
  recordingUrl: string | undefined,
  report: VapiCallReport,
): Promise<void> {
  // Skip if call failed or was missed
  if (outcome === "failed" || outcome === "missed") {
    log.debug("Skipping post-call processing for failed/missed call", { callLogId, outcome });
    return;
  }

  // Skip if transcript is too short or empty
  if (!transcript || transcript.length <= 50) {
    log.debug("Skipping lead extraction — transcript too short", { callLogId, len: transcript?.length ?? 0 });
    return;
  }

  // 1. Extract lead data
  const leadData = await extractLeadFromTranscript(transcript);
  if (!leadData) {
    log.debug("No lead data extracted from transcript", { callLogId });
    return;
  }

  // 2. Store extracted lead on the call log
  await storage.updateTradeLineCallLeadData(callLogId, leadData as Record<string, unknown>);
  log.info("Lead extracted from TradeLine call", { callLogId, callerName: leadData.caller_name, jobType: leadData.job_type });

  // 3. Send notifications to business owner
  try {
    const config = await storage.getTradeLineConfig(clientServiceId);
    const notifications = config?.notifications;
    if (!notifications) {
      log.debug("No notification preferences configured", { clientServiceId });
      return;
    }

    const client = await storage.getClientById(clientId);
    const businessName = client?.business_name || "Our team";

    const { sendTradeLineCallNotifications } = await import("./tradelineNotifications");
    await sendTradeLineCallNotifications({
      clientServiceId,
      clientId,
      callLogId,
      leadData,
      recordingUrl,
      report,
      smsNumbers: notifications.sms ?? [],
      emailAddresses: notifications.email ?? [],
      canSendSmsTo,
      markSmsSent,
      currentMode: config.currentMode,
      businessName,
      outboundSmsEnabled: (config as any).notifications?.outboundSmsEnabled !== false,
    });
  } catch (err) {
    log.error("TradeLine notification dispatch failed", { callLogId, error: (err as Error).message });
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

/**
 * Build Vapi assistant config for a TradeLine client, including booking
 * functions when booking is enabled in the client's config.
 */
export function buildTradeLineAssistantConfig(resolved: ResolvedTradeLineClient): Record<string, any> {
  const config = getVapiConfig();
  const ctx = buildTradeLineContext(resolved);

  const assistant: Record<string, any> = {
    name: `TradeLine — ${resolved.client.business_name}`,
    model: { provider: "custom-llm", url: config.serverUrl ? `${config.serverUrl}/api/vapi/conversation` : "/api/vapi/conversation" },
    voice: { provider: "11labs", voiceId: process.env.VAPI_WFT_VOICE_ID || "21m00Tcm4TlvDq8ikWAM" },
    firstMessage: ctx.mode === "after_hours"
      ? `Hi, thanks for calling ${ctx.businessName}! We're closed for the day, but I can help make sure you're looked after.`
      : `Hi, thanks for calling ${ctx.businessName}! How can I help you today?`,
    endCallMessage: `Thanks for calling ${ctx.businessName}. We'll follow up shortly — have a great day.`,
    maxDurationSeconds: 900, recordingEnabled: true,
    transcriber: { provider: "deepgram", model: "nova-2", language: "en" },
    endCallPhrases: ["goodbye", "bye", "thanks bye"],
    serverUrl: config.serverUrl ? `${config.serverUrl}/api/vapi/webhook` : "/api/vapi/webhook",
    metadata: { client_service_id: String(resolved.clientService.id) },
  };

  if (ctx.booking.enabled) {
    assistant.functions = VAPI_BOOKING_FUNCTIONS;
  }

  return { assistant };
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

  // Auto-provision a phone number after assistant is built (fail-safe)
  if (assistantId && vapiConfig.apiKey) {
    provisionVapiPhoneNumber(clientServiceId, assistantId).catch(err => {
      log.warn("Phone number auto-provisioning failed (non-blocking)", { clientServiceId, error: (err as Error).message });
    });
  }

  return { assistantId, skipped: false, definition: result.definition };
}

/* ─── Per-Client Vapi Phone Number Provisioning ─── */

export async function provisionVapiPhoneNumber(clientServiceId: number, assistantId?: string): Promise<{ phoneNumberId: string | null; number: string | null }> {
  const config = getVapiConfig();
  if (!config.apiKey) { log.warn("VAPI_API_KEY not configured — cannot provision phone number"); return { phoneNumberId: null, number: null }; }
  if (!assistantId) {
    const tlConfig = await storage.getTradeLineConfig(clientServiceId);
    assistantId = tlConfig?.assistant?.vapiAssistantId;
    if (!assistantId) { log.warn("No assistant ID for phone provisioning", { clientServiceId }); return { phoneNumberId: null, number: null }; }
  }
  const existingConfig = await storage.getTradeLineConfig(clientServiceId);
  const existingPhoneId = (existingConfig?.assistant as Record<string, any>)?.vapiPhoneNumberId;
  if (existingPhoneId) { return { phoneNumberId: existingPhoneId, number: null }; }
  try {
    const resp = await fetch(`${VAPI_API_BASE}/phone-number`, { method: "POST", headers: { "Authorization": `Bearer ${config.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ assistantId, provider: "twilio", name: `TradeLine #${clientServiceId}` }) });
    if (!resp.ok) { const body = await resp.text(); throw new Error(`Vapi phone provisioning failed (${resp.status}): ${body}`); }
    const data = await resp.json();
    const phoneNumberId = data.id;
    const number = data.number || data.phoneNumber || null;
    if (phoneNumberId) {
      const latestConfig = await storage.getTradeLineConfig(clientServiceId);
      const ca = latestConfig?.assistant;
      await storage.updateTradeLineConfig(clientServiceId, { assistant: { ...ca!, vapiPhoneNumberId: phoneNumberId } } as any);
      await storage.logAdminActivity({ actor_type: "system", actor_name: "TradeLine Phone Provisioner", action: "tradeline.phone_provisioned", entity_type: "client_service", entity_id: clientServiceId, summary: `Provisioned Vapi phone number: ${number || phoneNumberId}`, metadata: { vapiPhoneNumberId: phoneNumberId, number } });
      log.info("Provisioned Vapi phone number", { clientServiceId, phoneNumberId, number });
    }
    return { phoneNumberId: phoneNumberId || null, number };
  } catch (err) {
    log.error("Vapi phone number provisioning failed", { clientServiceId, error: (err as Error).message });
    await storage.logAdminActivity({ actor_type: "system", actor_name: "TradeLine Phone Provisioner", action: "tradeline.phone_provision_failed", entity_type: "client_service", entity_id: clientServiceId, summary: `Phone provisioning failed: ${(err as Error).message}` });
    return { phoneNumberId: null, number: null };
  }
}

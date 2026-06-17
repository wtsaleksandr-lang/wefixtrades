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

import { assistantSync, assistantAgentLoop, isReady } from "./assistant";
import type { AssistantRequest, AssistantAgentLoopOptions } from "./assistant";
import type { AgentLoopResult } from "./aiAgentLoop";
import { chat, type ChatMessage } from "./aiService";
import { BOOKING_TOOLS, executeCheckAvailability, executeCreateBooking } from "./bookingTools";
import { resolveBookingCalculatorId as resolveSharedBookingCalculatorId } from "./booking/resolveBookingCalculator";
import { CLAUDE_SONNET } from "./aiModels";
import { buildSystemPrompt, type TradeLineContext } from "./promptBuilder";
import { summarizeBusinessHours } from "./clientKnowledge";
import { storage } from "../storage";
import type { TradelineConfig, ClientService, Client, TradelineLeadData } from "@shared/schema";
import { VAPI_BOOKING_FUNCTIONS } from "./bookingTools";
import { createLogger } from "../lib/logger";
import {
  buildVapiVoiceBlock,
  buildVapiTranscriber,
  buildVoiceBasePreset,
  resolveTradeLineVoiceId,
  VAPI_MAX_DURATION_SECONDS,
  VAPI_RECORDING_ENABLED,
  VAPI_END_CALL_PHRASES,
  ELEVENLABS_RACHEL_VOICE_ID,
} from "../lib/voiceProfile";
import { db } from "../db";
import { onboardingSubmissions } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { applyOnboardingToAIConfig, type AIConfigPatch } from "./onboardingMappers";
import { z } from "zod";
// Top-level import (not inline `require("crypto")`): the inline require only
// worked because the prod bundle is CJS — it throws "require is not defined"
// under any ESM execution (tsx tests, future ESM build), which silently
// turned EVERY signature verification into a rejection.
import crypto from "crypto";

/* ─── custom-llm model identifiers ───
 * Vapi requires `model.model` to be a NON-EMPTY STRING for the custom-llm
 * provider (it is forwarded to our /api/vapi/conversation endpoint as the model
 * identifier). These are the canonical string values — referenced from every
 * place that constructs a Vapi `model` object so a future edit can't silently
 * drop or mistype the field and re-trigger the 400 `model.model must be a
 * string` provisioning failure (see Wave 12D fix). */
export const VAPI_BRAND_MODEL = "wefixtrades-brand-v1" as const;
export const VAPI_TRADELINE_MODEL = "wefixtrades-tradeline-v1" as const;

/* ─── TradeLine live-conversation brain ───
 * The LLM model + answer budget for the per-client TradeLine VOICE turn
 * (handleTradeLineConversationTurn). These are scoped to the TradeLine path
 * ONLY — passed on that AssistantRequest, never the global aiService default —
 * so the website widget chat (which sets no model and stays on CLAUDE_HAIKU per
 * the client-chat-access guard) is unaffected.
 *
 * - Model: Sonnet, not Haiku. A receptionist call wants the nuance Sonnet gives
 *   (triage, objection handling, multi-part questions). Env override allowed.
 * - maxTokens: raised from the old 150 hard cap (which clipped natural
 *   receptionist answers mid-sentence) to a budget that lets a complete answer
 *   land. Brevity is still enforced by the VOICE RULES in the prompt (1–3
 *   sentences); this only stops the hard mid-sentence truncation. */
export const TRADELINE_VOICE_MODEL =
  process.env.TRADELINE_VOICE_MODEL || CLAUDE_SONNET;
export const TRADELINE_VOICE_MAX_TOKENS = 280;

/* ─── Wave 12D — Zod schema for the Vapi assistant create/update payload ───
 *
 * Catches the `model.model must be a string` class of bug at the boundary
 * (before we POST to Vapi) instead of after a 400 response. Mirrors only the
 * fields Vapi has historically rejected for type errors — we don't try to
 * reproduce Vapi's full schema, just enough to catch the silent regressions.
 *
 * Vapi requires for `custom-llm` provider:
 *   - model.provider: string
 *   - model.model: NON-EMPTY STRING (this is the silent-failure surface)
 *   - model.url: a fully-qualified https URL — relative paths are rejected
 */
export const vapiAssistantPayloadSchema = z.object({
  name: z.string().min(1, "assistant name is required"),
  model: z.object({
    provider: z.string().min(1),
    // The exact bug Alex hit on 2026-05-25/26: a payload where `model.model`
    // was an object / undefined / empty got HTTP 400 from Vapi. Zod's
    // .min(1) catches the empty-string regression too.
    model: z.string().min(1, "model.model must be a non-empty string"),
    url: z.string().url("model.url must be a fully-qualified URL"),
    messages: z.array(z.object({
      role: z.string(),
      content: z.string(),
    })).optional(),
  }),
  voice: z.object({
    provider: z.string(),
    voiceId: z.string(),
    // Tuned 11labs render fields — listed explicitly (not .passthrough()) so the
    // boundary still validates the voice object's shape before we POST to Vapi.
    // A typo'd value type (e.g. stability as a string) or out-of-range tuning
    // fails HERE instead of sailing through to Vapi as an opaque 400. Ranges
    // mirror Vapi's ElevenLabsVoice schema.
    model: z.string().optional(),
    stability: z.number().min(0).max(1).optional(),
    similarityBoost: z.number().min(0).max(1).optional(),
    style: z.number().min(0).max(1).optional(),
    useSpeakerBoost: z.boolean().optional(),
    speed: z.number().min(0.7).max(1.2).optional(),
  }),
  firstMessage: z.string().optional(),
  transcriber: z.object({
    provider: z.string(),
    model: z.string(),
    language: z.string().optional(),
  }).optional(),
  // Shared turn-detection layer — validated explicitly so a typo'd/mistyped
  // field fails at our boundary instead of as an opaque Vapi 400. Names +
  // nesting verified against Vapi's voice-pipeline schema (2026-06-03).
  startSpeakingPlan: z.object({
    waitSeconds: z.number().min(0).max(5).optional(),
    smartEndpointingPlan: z.object({
      provider: z.string(),
    }).passthrough().optional(),
    transcriptionEndpointingPlan: z.object({
      onPunctuationSeconds: z.number().min(0).optional(),
      onNoPunctuationSeconds: z.number().min(0).optional(),
      onNumberSeconds: z.number().min(0).optional(),
    }).optional(),
  }).optional(),
  stopSpeakingPlan: z.object({
    numWords: z.number().int().min(0).max(10).optional(),
    voiceSeconds: z.number().min(0).max(1).optional(),
    backoffSeconds: z.number().min(0).max(10).optional(),
  }).optional(),
  serverUrl: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
}).passthrough();

export type VapiAssistantPayload = z.infer<typeof vapiAssistantPayloadSchema>;

/**
 * Validate a Vapi assistant payload before POST/PATCH. Throws a descriptive
 * error if `model.model` is not a string (or any other contract is broken),
 * so the failure is caught at our boundary instead of as an opaque 400 from
 * Vapi.
 */
export function validateVapiAssistantPayload(payload: unknown): VapiAssistantPayload {
  const parsed = vapiAssistantPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new Error(`Vapi assistant payload validation failed: ${issues}`);
  }
  return parsed.data;
}

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
    const expected = crypto.createHmac("sha256", config.webhookSecret)
      .update(rawBody)
      .digest("hex");
    // timingSafeEqual THROWS on length mismatch — a garbage/truncated
    // x-vapi-signature header (attack noise, not a server fault) was
    // surfacing as an error-level Sentry event (NODEWEFIXTRADES-1E).
    // Reject malformed signatures before the constant-time compare; length
    // is public information here so the early return leaks nothing.
    const provided = Buffer.from(signature, "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    if (provided.length !== expectedBuf.length) {
      log.warn("Webhook signature rejected — malformed/wrong-length signature header");
      return false;
    }
    return crypto.timingSafeEqual(provided, expectedBuf);
  } catch (err) {
    // Anything else unexpected: still never throw past the verifier — the
    // route turns `false` into a 401. Warn (bad input), don't page.
    log.warn("Webhook signature verification threw — rejecting", { error: (err as Error).message });
    return false;
  }
}

/* ─── Custom-LLM (/conversation) authentication ─── */

/**
 * Shared secret used to authenticate Vapi's custom-llm POSTs to
 * /api/vapi/conversation.
 *
 * WHY a path/header secret and not the webhook HMAC signature:
 * Vapi signs `serverUrl` (server-message webhook) requests with the
 * `x-vapi-signature` HMAC header, which is why /api/vapi/webhook can verify
 * an HMAC. Vapi's custom-llm `model.url` requests are a DIFFERENT transport —
 * they are NOT HMAC-signed with the server secret by default; custom-llm auth
 * is carried by whatever credential is baked into the configured `model.url`
 * (we control that URL end-to-end in buildAssistantConfig /
 * buildTradeLineAssistantConfig / upsertVapiAssistant). So the robust,
 * non-breaking gate is a shared bearer secret that travels on every URL we
 * hand Vapi. We accept it from either the Authorization: Bearer header or a
 * trailing /s/<secret> path segment, and ALSO accept a valid x-vapi-signature
 * (defence in depth — if a future Vapi config does sign these, it still works).
 *
 * Falls back to VAPI_WEBHOOK_SECRET so a single configured secret protects
 * both endpoints; a dedicated VAPI_CONVERSATION_SECRET can override.
 */
export function getConversationSecret(): string | undefined {
  return process.env.VAPI_CONVERSATION_SECRET || process.env.VAPI_WEBHOOK_SECRET || undefined;
}

/**
 * Builds the custom-llm URL Vapi should POST conversation turns to, with the
 * shared secret embedded as a trailing path segment when configured. Vapi
 * calls back exactly the URL we provide, so the secret rides along on every
 * legitimate request while a caller hitting the bare path is rejected.
 */
export function buildConversationUrl(serverUrl?: string): string {
  const base = serverUrl ? `${serverUrl}/api/vapi/conversation` : "/api/vapi/conversation";
  const secret = getConversationSecret();
  return secret ? `${base}/s/${encodeURIComponent(secret)}` : base;
}

/**
 * Authenticate an inbound /api/vapi/conversation request.
 * Accepts (any of):
 *   1. A valid x-vapi-signature HMAC over the raw body (same as the webhook).
 *   2. Authorization: Bearer <secret> matching the conversation secret.
 *   3. A path secret (/s/<secret>) matching the conversation secret.
 *
 * Production with no secret configured → reject (fail closed).
 * Development with no secret configured → allow (with warning), matching the
 * webhook verifier's dev behaviour so local testing is not blocked.
 */
export function verifyConversationAuth(
  rawBody: Buffer | undefined,
  signature: string | undefined,
  authorizationHeader: string | undefined,
  pathSecret: string | undefined,
): boolean {
  const secret = getConversationSecret();
  const isProd = process.env.NODE_ENV === "production";

  if (!secret) {
    if (isProd) {
      log.error("No VAPI_CONVERSATION_SECRET / VAPI_WEBHOOK_SECRET set in production — rejecting /conversation");
      return false;
    }
    log.warn("No conversation secret configured — allowing unverified /conversation in development");
    return true;
  }

  // 1. Defence in depth: accept a valid webhook-style HMAC signature if present.
  if (signature && verifyWebhookSignature(rawBody, signature)) {
    return true;
  }

  // 2/3. Constant-time compare of the bearer token or path secret.
  const presented =
    (authorizationHeader && authorizationHeader.startsWith("Bearer ")
      ? authorizationHeader.slice("Bearer ".length).trim()
      : undefined) || pathSecret;

  if (!presented) {
    log.warn("No bearer/path secret present on /conversation request");
    return false;
  }

  try {
    const a = Buffer.from(presented);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (err) {
    log.error("Conversation auth comparison threw", { error: (err as Error).message });
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
 * SECURITY (cross-tenant binding): the call metadata is CALLER-SUPPLIED and must
 * never be the authoritative tenant signal — a forged call could set
 * metadata.clientServiceId to bind to any tenant. Resolution order:
 *
 *   Strategy 1 (AUTHORITATIVE): phoneNumberId — the Vapi-attested number that
 *     received the call. Wins outright.
 *   Strategy 2 (FALLBACK): primaryBusinessNumber match on the called number.
 *   Strategy 3 (UNTRUSTED FALLBACK): metadata.clientServiceId — only used when
 *     neither phone signal resolves. If a phone signal DID resolve, the metadata
 *     is ignored; if it disagrees with the phone-derived client it is refused.
 */
export async function resolveTradeLineClient(
  callMetadata?: Record<string, any>,
  customerNumber?: string,
  phoneNumberId?: string,
): Promise<ResolvedTradeLineClient | null> {
  try {
    // Parse the caller-supplied metadata hint (UNTRUSTED — used only as a
    // last-resort fallback, and cross-checked against any phone-derived client).
    const metaCsRaw = callMetadata?.clientServiceId ?? callMetadata?.client_service_id;
    let metaCsId: number | undefined;
    if (metaCsRaw !== undefined && metaCsRaw !== null) {
      const numId = typeof metaCsRaw === "number" ? metaCsRaw : parseInt(metaCsRaw);
      if (!isNaN(numId)) metaCsId = numId;
    }

    // Strategy 1 (AUTHORITATIVE): lookup by Vapi phoneNumberId (the Vapi-attested
    // number that received the call). This wins over caller-supplied metadata.
    if (phoneNumberId) {
      const cacheKey = `vapi-phone:${phoneNumberId}`;
      const cached = getCachedClientServiceId(cacheKey);
      let csIdByPhone = cached;
      if (!csIdByPhone) {
        const looked = await storage.findClientServiceByVapiPhoneNumberId(phoneNumberId);
        if (looked) {
          setCachedClientServiceId(cacheKey, looked);
          csIdByPhone = looked;
        }
      }
      if (csIdByPhone) {
        const resolved = await resolveByClientServiceId(csIdByPhone);
        if (resolved) {
          // Refuse a metadata hint that disagrees with the attested phone number —
          // trust the phone, but surface the mismatch for monitoring.
          if (metaCsId !== undefined && metaCsId !== csIdByPhone) {
            log.warn("Ignoring caller metadata.clientServiceId that disagrees with attested phoneNumberId", {
              metadataClientServiceId: metaCsId,
              phoneDerivedClientServiceId: csIdByPhone,
            });
          }
          return resolved;
        }
      }
    }

    // Strategy 2 (FALLBACK): lookup by the CALLED number matching a client's primaryBusinessNumber
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

    // Strategy 3 (UNTRUSTED FALLBACK): caller-supplied metadata.clientServiceId.
    // Only reached when no phone-attested signal resolved a client. Now that
    // /api/vapi/conversation is auth-gated and /webhook is signature-gated, the
    // caller is trusted, but we still prefer phone-derived binding above and use
    // metadata only as a last resort (e.g. web-SDK demo calls with no DID).
    if (metaCsId !== undefined) {
      const resolved = await resolveByClientServiceId(metaCsId);
      if (resolved) return resolved;
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

export function buildTradeLineContext(
  resolved: ResolvedTradeLineClient,
  callerNumber?: string | null,
): TradeLineContext {
  // Real service area + business hours from the client's stored record so the
  // receptionist can answer "do you serve X?" and "are you open now?" directly,
  // instead of the previously-hardcoded `serviceArea: undefined`.
  //
  // - business_hours lives on the clients row (jsonb) — summarized to the same
  //   structured line the chat widget uses (shared summarizeBusinessHours).
  // - serviceArea has no dedicated clients column; when the onboarding/profile
  //   stored it on clients.metadata it's read here, else omitted gracefully (the
  //   auto-assembled BUSINESS DATA block still carries the calculator profile's
  //   service area). No "undefined" is ever injected into the prompt.
  const meta = resolved.client.metadata as Record<string, unknown> | null | undefined;
  const metaServiceArea =
    meta && typeof meta.serviceArea === "string" && meta.serviceArea.trim()
      ? meta.serviceArea.trim()
      : meta && typeof meta.service_area === "string" && meta.service_area.trim()
        ? meta.service_area.trim()
        : undefined;
  const businessHours = summarizeBusinessHours(resolved.client.business_hours) ?? undefined;

  return {
    businessName: resolved.client.business_name,
    tradeType: resolved.client.trade_type ?? undefined,
    serviceArea: metaServiceArea,
    businessHours,
    mode: resolved.config.currentMode,
    channels: resolved.config.channels,
    booking: resolved.config.booking,
    phoneRouting: resolved.config.phoneRouting,
    // LITERAL inbound caller-ID, threaded so the prompt confirms the real digits
    // and the booking executor defaults the callback number to it.
    callerNumber: callerNumber?.trim() || null,
  };
}

/**
 * Wave W-AW-1 — async variant that augments the per-client TradeLine context
 * with their active knowledge-base entries, custom greeting, and response
 * style from `tradeline_assistant_settings`. Used by every conversation turn
 * so the AI receptionist references the owner's curated FAQ / services /
 * policies / pricing instead of hallucinating.
 *
 * Fail-soft: any DB error returns the base context untouched — calls never
 * fail because of a KB read.
 */
export async function buildTradeLineContextWithKnowledge(
  resolved: ResolvedTradeLineClient,
  callerNumber?: string | null,
): Promise<TradeLineContext> {
  const base = buildTradeLineContext(resolved, callerNumber);
  try {
    const { db } = await import("../db");
    const {
      tradelineKnowledgeBase,
      tradelineAssistantSettings,
    } = await import("@shared/schema");
    const { and, desc, eq } = await import("drizzle-orm");

    const [kbRows, settingsRows] = await Promise.all([
      db
        .select({
          kind: tradelineKnowledgeBase.kind,
          title: tradelineKnowledgeBase.title,
          content: tradelineKnowledgeBase.content,
          priority: tradelineKnowledgeBase.priority,
        })
        .from(tradelineKnowledgeBase)
        .where(
          and(
            eq(tradelineKnowledgeBase.client_id, resolved.client.id),
            eq(tradelineKnowledgeBase.status, "active"),
          ),
        )
        .orderBy(desc(tradelineKnowledgeBase.priority))
        .limit(40),
      db
        .select({
          greeting: tradelineAssistantSettings.greeting,
          response_style: tradelineAssistantSettings.response_style,
        })
        .from(tradelineAssistantSettings)
        .where(eq(tradelineAssistantSettings.client_id, resolved.client.id))
        .limit(1),
    ]);

    // unified-AI U1 parity: also inject the platform-assembled business-data
    // block (customer audience) — the SAME auto-assembled pricing/hours/profile
    // the website CHAT widget loads (tradelineWidgetRoutes). Previously voice
    // hand-rolled a KB-only query and SKIPPED this, so the PHONE assistant knew
    // LESS than the website chat. audience MUST be "customer" — voice answers a
    // homeowner caller, so the customer tier hard-filters formula internals,
    // margins, lead PII, etc. (the leak boundary).
    //
    // Fail-open: a thrown/empty assembly degrades to the KB-only behaviour above
    // exactly — logged (not silently swallowed), never blocks a live call. The
    // KB-only path (kbRows/greeting/responseStyle) is loaded FIRST and returned
    // even if this block fails, so voice is never weaker than before this change.
    let assembledKnowledgeBlock: string | null = null;
    try {
      const { assembleClientKnowledge } = await import("./clientKnowledge");
      const assembled = await assembleClientKnowledge({
        clientId: String(resolved.client.id),
        audience: "customer",
      });
      assembledKnowledgeBlock = assembled.block.trim() || null;
    } catch (err) {
      log.warn("TradeLine voice client-knowledge assembly failed — KB-only context", {
        clientId: resolved.client.id,
        error: (err as Error).message,
      });
    }

    return {
      ...base,
      knowledgeBase: kbRows,
      greeting: settingsRows[0]?.greeting ?? null,
      responseStyle: settingsRows[0]?.response_style ?? null,
      assembledKnowledgeBlock,
    };
  } catch (err) {
    log.warn("Failed to load TradeLine KB / settings — using base context", {
      clientId: resolved.client.id,
      error: (err as Error).message,
    });
    return base;
  }
}

/* ─── TradeLine-aware conversation handler (with fallback) ─── */

/**
 * W-AZ-3: load the latest submitted onboarding for a TradeLine client_service
 * and project it through the TradeLine onboarding mapper. Returns null when no
 * submission exists or the mapper can't produce anything useful. Safe-fails on
 * any error so a missing patch never blocks an active call.
 */
async function loadTradeLineOnboardingPatch(clientServiceId: number): Promise<AIConfigPatch | null> {
  try {
    const [sub] = await db
      .select()
      .from(onboardingSubmissions)
      .where(and(
        eq(onboardingSubmissions.client_service_id, clientServiceId),
        eq(onboardingSubmissions.status, "submitted"),
      ))
      .orderBy(desc(onboardingSubmissions.submitted_at))
      .limit(1);
    if (!sub) return null;
    return await applyOnboardingToAIConfig("tradeline", sub);
  } catch (err) {
    log.warn("Failed to load TradeLine onboarding patch", { clientServiceId, error: String(err) });
    return null;
  }
}

/**
 * Resolve the calculator that backs a TradeLine client's booking calendar.
 *
 * The client's first calculator carries the booking_settings + slot calendar
 * the booking executors read/write. Returns null when the client has no
 * calculator (booking can't fire — the prompt then degrades to take-a-message).
 *
 * Booking consolidation (PR6): the resolution heuristic now lives in the shared
 * `booking/resolveBookingCalculator` module so VOICE and the new CHAT path pick
 * the backing calculator the SAME way (the brittle "first-calculator-wins" is
 * fixed in one place). This thin wrapper preserves the voice-side signature
 * (takes the ResolvedTradeLineClient, logs with clientId) — behaviour-identical.
 */
async function resolveBookingCalculatorId(
  resolved: ResolvedTradeLineClient,
): Promise<number | null> {
  return resolveSharedBookingCalculatorId(resolved.client.user_id);
}

/**
 * Injectable seam for handleTradeLineConversationTurn.
 *
 * Production binds the real assistantAgentLoop + assistantSync. The booking
 * test injects deterministic, DB-free stand-ins (a stubbed model that emits a
 * create_booking tool call running the REAL executor) so it can prove the tool
 * path actually fires — the exact failure mode that was previously invisible.
 */
export interface TradeLineTurnDeps {
  runAgentLoop?: (
    req: AssistantRequest,
    opts: AssistantAgentLoopOptions,
  ) => Promise<AgentLoopResult>;
  runSync?: (req: AssistantRequest) => Promise<{ reply: string }>;
  /** Override the booking-calculator resolution (test injects a fixed id). */
  resolveCalculatorId?: (resolved: ResolvedTradeLineClient) => Promise<number | null>;
  /** Override the booking executors (test asserts these are REACHED). */
  checkAvailability?: typeof executeCheckAvailability;
  createBooking?: typeof executeCreateBooking;
}

export async function handleTradeLineConversationTurn(
  messages: VapiTranscriptMessage[],
  callId: string,
  tradeLineCtx: TradeLineContext,
  clientServiceId?: number,
  resolved?: ResolvedTradeLineClient,
  deps: TradeLineTurnDeps = {},
): Promise<string> {
  const chatMessages = translateTranscript(messages);
  if (!chatMessages.length) {
    return tradeLineCtx.mode === "after_hours"
      ? `Hi, thanks for calling ${tradeLineCtx.businessName}! We're closed for the day, but I can help make sure you're looked after.`
      : `Hi, thanks for calling ${tradeLineCtx.businessName}! How can I help you today?`;
  }

  const runAgentLoop = deps.runAgentLoop ?? assistantAgentLoop;
  const runSync = deps.runSync ?? assistantSync;
  const checkAvailability = deps.checkAvailability ?? executeCheckAvailability;
  const createBooking = deps.createBooking ?? executeCreateBooking;
  const resolveCalcId = deps.resolveCalculatorId ?? resolveBookingCalculatorId;

  try {
    const onboardingPatch = clientServiceId
      ? await loadTradeLineOnboardingPatch(clientServiceId)
      : null;
    const systemPrompt = buildSystemPrompt(
      "vapi",
      undefined,
      undefined,
      undefined,
      tradeLineCtx,
      undefined,
      onboardingPatch,
    );

    // Scoped to the TradeLine voice path only: Sonnet brain + a larger answer
    // budget so receptionist replies aren't clipped mid-sentence. Brevity is
    // still enforced by the prompt's VOICE RULES. The widget chat path sets
    // neither and stays on Haiku (client-chat-access guard).
    const baseReq: AssistantRequest = {
      surface: "vapi",
      messages: chatMessages,
      sessionId: `vapi-${callId}`,
      model: TRADELINE_VOICE_MODEL,
      maxTokens: TRADELINE_VOICE_MAX_TOKENS,
      systemOverride: systemPrompt,
    };

    // ── Booking actuation (P0 fix) ──
    // The single-call assistantSync path forwards NO tools, so checkAvailability
    // / createBooking could NEVER fire on a voice call — the AI would say
    // "you're booked" and nothing was persisted. When this client has booking
    // enabled AND a backing calculator, route the turn through the tool-capable
    // agent loop with the booking executors wired in. The loop short-circuits to
    // a single completion when the model calls no tool (no extra round-trips on
    // "what are your hours?" turns), so voice latency for non-booking turns is
    // unchanged. Businesses without booking (or without a calculator) keep the
    // lean single-call path.
    const bookingCalcId =
      tradeLineCtx.booking?.enabled && resolved
        ? await resolveCalcId(resolved)
        : null;

    if (bookingCalcId != null) {
      const callerNumber = tradeLineCtx.callerNumber ?? undefined;
      const toolExecutors = {
        // Anthropic tool names (BOOKING_TOOLS) — check_availability / create_booking.
        check_availability: async (args: Record<string, unknown>) => {
          const r = await checkAvailability(bookingCalcId, args);
          // Return the executor's real status object so the loop's
          // isFailureResult() guard can flag a soft-fail as is_error — the model
          // then can't read a failed lookup as success. The narrative carries the
          // caller-facing text.
          return { ok: r.success, narrative: r.narrative, ...r.data };
        },
        create_booking: async (args: Record<string, unknown>) => {
          // Default the callback number to the literal caller ID when the model
          // didn't capture one — so a booking always carries a reachable number.
          const withPhone = { ...args };
          if (!withPhone.customer_phone && callerNumber) {
            withPhone.customer_phone = callerNumber;
          }
          const r = await createBooking(bookingCalcId, withPhone);
          return { ok: r.success, narrative: r.narrative, ...r.data };
        },
      };

      const result = await runAgentLoop(
        { ...baseReq, tools: BOOKING_TOOLS as any },
        {
          toolExecutors,
          // The booking tools are NOT registered in copilotActionRegistry, so the
          // loop treats them as auto-tier and executes inline (no confirm-card
          // short-circuit) — exactly what a live voice turn needs.
          actionSurface: "customer-widget",
          maxSteps: 4,
          // Generous per-turn ceiling; a booking turn is at most
          // availability → confirm → book.
          costCapCents: 25,
        },
      );

      if (result.reply && result.reply.trim()) {
        return result.reply;
      }
      // The loop produced no text (gate block, cost cap, executor missing, or a
      // provider error). Fall back to a safe take-a-message reply rather than
      // returning an empty string to the caller.
      log.warn("TradeLine booking-capable turn returned no text — using fallback", {
        callId,
        status: result.status,
      });
      const name = tradeLineCtx.businessName || "us";
      return `I want to make sure I get this right — let me take your name and number and the team at ${name} will lock in your appointment and call you straight back.`;
    }

    // Non-booking turn: the lean single-call path (no tools needed).
    const result = await runSync(baseReq);
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
 * Schema for the model's lead-extraction JSON. Every field optional (the model
 * omits what it can't determine) and length-capped so a hallucinated or
 * adversarial transcript can't persist oversized/garbage values. Unknown keys
 * are stripped (zod default), so only the expected shape reaches storage.
 */
const leadExtractionSchema = z.object({
  caller_name: z.string().max(120).optional(),
  caller_phone: z.string().max(40).optional(),
  caller_address: z.string().max(300).optional(),
  job_type: z.string().max(120).optional(),
  urgency: z.string().max(20).optional(),
  job_description: z.string().max(2000).optional(),
  preferred_date: z.string().max(120).optional(),
});

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
      // audit/ai 2026-05-24: attribute lead-extraction calls to the
      // inbound_classifier surface so they are gated, logged to
      // ai_usage_logs, and counted against a monthly budget cap.
      // Previously this Anthropic call ran ungated + unlogged.
      surface: "inbound_classifier",
    });

    // Parse JSON from response — handle potential markdown wrapping
    const jsonStr = response.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(jsonStr);

    // Validate against the expected lead shape before any caller persists it.
    // On a malformed object (wrong types, oversized fields), skip rather than
    // store garbage — the call is still logged; only the structured lead drops.
    const result = leadExtractionSchema.safeParse(parsed);
    if (!result.success) {
      log.warn("Lead extraction returned an invalid shape — skipping lead persist", {
        issues: result.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
      });
      return null;
    }
    return result.data as TradelineLeadData;
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

    // ── W-BA-8: route the follow-up generation through the BA-0 multi-step
    // agent loop when enabled. Mirrors BA-5 (email) / BA-6 (SMS). Pre-loop
    // gates fire here so a tripped gate or over-cap client never reaches the
    // model. When the loop owns the follow-up, we SKIP the legacy single-
    // call notification dispatch below; otherwise we fall through to it. ──
    const { agentLoopEnabledBA8, processVoiceFollowupViaLoop } = await import("./voiceFollowupConcierge");
    if (client && agentLoopEnabledBA8()) {
      const { aiGateAllowed } = await import("./aiSystemGate");
      const { aiChannelGateOn } = await import("./aiChannelGate");
      const { getClientVariableCosts } = await import("./clientVariableCosts");
      const { classifyBand } = await import("./aiBudgetRouter");

      const systemGate = await aiGateAllowed("portal").catch(() => ({
        allowed: false,
        reason: "gate read failed",
      }));
      const voiceGateOn = await aiChannelGateOn("voice").catch(() => false);

      // Per-client cost band — over_cap means skip the loop entirely. Fail
      // CLOSED on infra error (treat as over_cap) to satisfy the "fail
      // closed on gate / budget infra errors" hard constraint.
      let costBandOk = false;
      try {
        const vc = await getClientVariableCosts(clientId);
        if (vc) {
          const band = classifyBand(vc.ai_cost_cents_month, vc.default_budget_cents);
          costBandOk = band !== "over_cap";
        } else {
          costBandOk = true; // no row yet → fresh client, band = default
        }
      } catch (err) {
        log.warn("[BA-8] cost band read failed — failing closed", {
          clientId,
          error: (err as Error).message,
        });
        costBandOk = false;
      }

      // Voice follow-up opt-out signal — re-uses the existing TradeLine
      // outboundSmsEnabled flag, which is the pre-existing knob for outbound
      // caller contact. When false, the client has asked us NOT to contact
      // callers automatically.
      const outboundEnabled =
        (config as any).notifications?.outboundSmsEnabled !== false;

      if (systemGate.allowed && voiceGateOn && costBandOk && outboundEnabled) {
        try {
          const outcomeResult = await processVoiceFollowupViaLoop({
            clientServiceId,
            client,
            // TradeLine calls aren't anchored to a calculator — the auto-
            // opened support ticket is created without a calculator link.
            calculatorId: null,
            callLogId,
            leadData,
            report,
            callerEmail: (leadData as any).caller_email ?? null,
          });
          if (outcomeResult.handled) {
            log.info("[BA-8] voice follow-up handled by agent loop — skipping legacy dispatch", {
              callLogId,
              clientId,
            });
            return;
          }
          // handled === false → loop yielded ownership, fall through to legacy
        } catch (err) {
          log.error("[BA-8] processVoiceFollowupViaLoop threw — falling back to legacy", {
            callLogId,
            error: (err as Error).message,
          });
        }
      } else {
        log.info("[BA-8] gates / opt-out / band blocked — using legacy dispatch", {
          callLogId,
          systemAllowed: systemGate.allowed,
          voiceGateOn,
          costBandOk,
          outboundEnabled,
        });
      }
    }

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
      // `model.model` string is required by Vapi for custom-llm provider —
      // see fix in upsertVapiAssistant() below.
      model: { provider: "custom-llm", model: VAPI_BRAND_MODEL, url: buildConversationUrl(config.serverUrl) },
      voice: buildVapiVoiceBlock(process.env.VAPI_WFT_VOICE_ID || ELEVENLABS_RACHEL_VOICE_ID),
      firstMessage: "WeFixTrades, this is Riley — how can I help?",
      endCallMessage: "Thanks for calling WeFixTrades. We'll follow up by email shortly — have a great rest of your day.",
      maxDurationSeconds: VAPI_MAX_DURATION_SECONDS, recordingEnabled: VAPI_RECORDING_ENABLED,
      transcriber: buildVapiTranscriber("en"),
      endCallPhrases: VAPI_END_CALL_PHRASES,
      // Shared turn-detection / barge-in layer (brand line uses the base preset).
      ...buildVoiceBasePreset(),
    },
  };
}

/**
 * Async variant that reads the brand-availability singleton and rewrites the
 * firstMessage when we're marked as unavailable. Use this from any place
 * that's about to provision an inbound greeting.
 *
 * Falls back to the synchronous default if the DB read fails — never block a
 * real call on a missing row.
 */
export async function buildAssistantConfigWithAvailability(): Promise<Record<string, any>> {
  const base = buildAssistantConfig();
  try {
    const { storage } = await import("../storage");
    const av = await storage.getBrandAvailability();
    if (!av.is_available) {
      base.assistant.firstMessage = av.away_message;
      // Hard fallback: append a system-prompt addendum so the model sticks to
      // ticket-creation only and doesn't try to live-resolve the request.
      base.assistant.systemMessage = (base.assistant.systemMessage ?? "") +
        "\n\n[AVAILABILITY OVERRIDE: human team unavailable. Take name + number + brief description, confirm a callback within 1 hour, and end the call. Do not attempt to fully resolve the request.]";
    }
    return base;
  } catch (err) {
    log.warn("[vapi] availability read failed; using default greeting", { error: (err as Error).message });
    return base;
  }
}

/**
 * Build Vapi assistant config for a TradeLine client, including booking
 * functions when booking is enabled in the client's config.
 */
export async function buildTradeLineAssistantConfig(resolved: ResolvedTradeLineClient): Promise<Record<string, any>> {
  const config = getVapiConfig();
  const ctx = buildTradeLineContext(resolved);

  // Resolve the live voice: customer's portal pick (catalog → elevenlabs id)
  // wins; fall back to the static preset on config.voice.presetId, then Rachel.
  const { getVoicePreset } = await import("@shared/tradelineVoices");
  const presetVoiceId = getVoicePreset(resolved.config.voice?.presetId || "professional-female").voiceId;
  const voiceId = await resolveTradeLineVoiceId(resolved.client.id, presetVoiceId);

  const assistant: Record<string, any> = {
    name: `TradeLine — ${resolved.client.business_name}`,
    // `model.model` string is required by Vapi for custom-llm provider —
    // see fix in upsertVapiAssistant() below.
    model: { provider: "custom-llm", model: VAPI_TRADELINE_MODEL, url: buildConversationUrl(config.serverUrl) },
    voice: buildVapiVoiceBlock(voiceId),
    firstMessage: ctx.mode === "after_hours"
      ? `Hi, thanks for calling ${ctx.businessName}! We're closed for the day, but I can help make sure you're looked after.`
      : `Hi, thanks for calling ${ctx.businessName}! How can I help you today?`,
    endCallMessage: `Thanks for calling ${ctx.businessName}. We'll follow up shortly — have a great day.`,
    maxDurationSeconds: VAPI_MAX_DURATION_SECONDS, recordingEnabled: VAPI_RECORDING_ENABLED,
    transcriber: buildVapiTranscriber("en"),
    endCallPhrases: VAPI_END_CALL_PHRASES,
    // Shared turn-detection / barge-in layer (TradeLine uses the base preset;
    // thin per-agent override hook available for env-specific VAD).
    ...buildVoiceBasePreset(),
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

/**
 * Vapi's inbound-call ingest URL. This is the value the WORKING WeFixTrades
 * platform number sets as its Twilio `voice_url` (verified live —
 * docs/operations/twilio-vapi-integration-audit-2026-05-24.md §1/§3): a PSTN
 * caller hits Twilio, Twilio fetches this URL, Vapi accepts the SIP leg and
 * looks up the assistant for the imported number. Client numbers MUST route
 * here too — the previously-configured `/api/twilio/voice/inbound` route was
 * never registered (Wave 77 admitted "lands the route" but it never did), so
 * inbound calls to client numbers 404'd → Twilio fallback voicemail. Centralized
 * here so the wizard provision path and the Vapi-import path can't drift.
 */
export const VAPI_TWILIO_INBOUND_VOICE_URL = "https://api.vapi.ai/twilio/inbound_call";

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

  // Vapi `custom-llm` provider requires a `model` string field (forwarded to
  // our /api/vapi/conversation endpoint as the model identifier). Without it
  // Vapi rejects the assistant create/update with HTTP 400
  // `model.model must be a string` — this was the silent-failure root cause
  // that left zero TradeLine assistants in the live account (see
  // docs/operations/tradeline-provisioning-health-2026-05-24.md). It also
  // requires a fully-qualified https URL — relative paths are rejected, so
  // we hard-fail early when VAPI_SERVER_URL is not set rather than POST a
  // payload Vapi will refuse.
  if (!config.serverUrl) {
    throw new Error(
      "Vapi assistant creation failed: VAPI_SERVER_URL is not set — required to build a fully-qualified custom-llm URL.",
    );
  }
  const payload = {
    name: assistantName,
    model: {
      provider: "custom-llm" as const,
      model: VAPI_TRADELINE_MODEL,
      url: buildConversationUrl(config.serverUrl),
      messages: [{ role: "system", content: systemPrompt }],
    },
    voice: buildVapiVoiceBlock(voiceConfig?.voiceId),
    firstMessage,
    transcriber: buildVapiTranscriber(transcriberLanguage || "en"),
    // Shared turn-detection / barge-in layer (pre-provision path).
    ...buildVoiceBasePreset(),
    serverUrl: `${config.serverUrl}/api/vapi/webhook`,
    metadata: { client_service_id: String(clientServiceId), source: "tradeline_template_engine" },
  };

  // Wave 12D — validate at our boundary so a regression that drops or
  // mistypes model.model is caught HERE (with a clear error) instead of
  // as a vague "Vapi 400: model.model must be a string" downstream.
  try {
    validateVapiAssistantPayload(payload);
  } catch (validationErr: any) {
    log.error("Vapi assistant payload failed local validation", { clientServiceId, error: validationErr.message });
    throw new Error(`Vapi assistant creation failed: ${validationErr.message}`);
  }

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

/**
 * Re-push a client's TradeLine assistant after a portal voice/settings change.
 *
 * The pre-provisioned VAPI assistant (bound to the client's phone number) holds
 * the voice that callers hear, so a `tradeline_assistant_settings.voice_id`
 * change must be re-pushed to take effect on already-provisioned assistants.
 * The resolved voice is part of the build hash (see buildTradeLineAssistant), so
 * this rebuilds + re-pushes rather than no-oping. Fail-soft + fire-and-forget —
 * never blocks or fails the portal request.
 */
export async function reprovisionTradeLineVoiceForClient(clientId: number): Promise<void> {
  try {
    const { clientServices } = await import("@shared/schema");
    const { and, eq, like } = await import("drizzle-orm");
    const services = await db
      .select({ id: clientServices.id, status: clientServices.status })
      .from(clientServices)
      .where(and(eq(clientServices.client_id, clientId), like(clientServices.service_id, "tradeline%")));
    const target = services.find((s) => s.status === "active") ?? services[0];
    if (!target) {
      log.info("[voice-reprovision] no tradeline service for client — skipping", { clientId });
      return;
    }
    await provisionTradeLineAssistant(target.id);
    log.info("[voice-reprovision] re-pushed assistant after voice change", { clientId, clientServiceId: target.id });
  } catch (err) {
    log.warn("[voice-reprovision] failed (non-blocking)", { clientId, error: (err as Error).message });
  }
}

/**
 * Options for provisionTradeLineAssistant.
 *
 * `importNumber` — when supplied, the internal phone-provision step IMPORTS
 * this existing Twilio number into Vapi and attaches the assistant to it,
 * instead of BUYING a fresh Vapi number. This is the unification path: the
 * client's wizard/ported/forwarded number becomes the number the AI answers on.
 */
export interface ProvisionTradeLineAssistantOptions {
  importNumber?: string;
}

export async function provisionTradeLineAssistant(clientServiceId: number, options: ProvisionTradeLineAssistantOptions = {}): Promise<{ assistantId: string | null; skipped: boolean; skipReason?: string; definition?: import("./tradelineTemplates").AssistantDefinition; error?: string; status: "live" | "partial" | "failed"; phoneNumberId?: string | null; phoneNumber?: string | null; notLiveReason?: string }> {
  const { buildTradeLineAssistant } = await import("./tradelineTemplates");
  let result;
  try { result = await buildTradeLineAssistant(clientServiceId); } catch (err: any) {
    log.error("Assistant build failed", { clientServiceId, error: err.message });
    await storage.logAdminActivity({ actor_type: "system", actor_name: "TradeLine Template Engine", action: "tradeline.assistant_build_failed", entity_type: "client_service", entity_id: clientServiceId, summary: `Assistant build failed: ${err.message}` });
    return { assistantId: null, skipped: false, error: err.message, status: "failed", notLiveReason: `Assistant build failed: ${err.message}` };
  }
  if (result.skipped) return { assistantId: null, skipped: true, skipReason: result.skipReason, definition: result.definition, status: "partial", notLiveReason: result.skipReason || "Assistant build skipped — prerequisites not met." };

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
      return { assistantId: null, skipped: false, error: `Vapi push failed: ${err.message}`, definition: result.definition, status: "failed", notLiveReason: `Vapi push failed: ${err.message}` };
    }
  } else {
    log.warn("VAPI_API_KEY not set — assistant built but not pushed to Vapi");
  }

  await storage.logAdminActivity({ actor_type: "system", actor_name: "TradeLine Template Engine", action: "tradeline.assistant_built", entity_type: "client_service", entity_id: clientServiceId, summary: `Built assistant (template: ${result.definition.templateId}, hash: ${result.definition.inputHash})${assistantId ? ` → Vapi ID: ${assistantId}` : " (Vapi not configured)"}`, metadata: { templateId: result.definition.templateId, inputHash: result.definition.inputHash, vapiAssistantId: assistantId } });

  // The assistant was built locally but never pushed to Vapi (no API key). It is
  // NOT callable — report this honestly as "partial" so the setup surface cannot
  // tell the owner their phone assistant is live. (The previous code returned a
  // bare success here, which is the silent-degrade this fix closes.)
  if (!assistantId) {
    return {
      assistantId: null,
      skipped: false,
      definition: result.definition,
      status: "partial",
      phoneNumberId: null,
      phoneNumber: null,
      notLiveReason: "Voice provider (Vapi) is not configured — the assistant was built but not pushed and is not callable. Add VAPI_API_KEY, then rebuild.",
    };
  }

  // Auto-provision a phone number after the assistant is pushed. We AWAIT the
  // result (instead of fire-and-forget) so the return can reflect honestly
  // whether the line is actually callable. A failure here is non-fatal to the
  // assistant itself, but it means the assistant is reachable in-dashboard yet
  // has no inbound number — that is "partial", never "live".
  let phoneNumberId: string | null = null;
  let phoneNumber: string | null = null;
  let phoneError: string | undefined;
  try {
    const prov = await provisionVapiPhoneNumber(clientServiceId, assistantId, options.importNumber ? { importNumber: options.importNumber } : {});
    phoneNumberId = prov.phoneNumberId;
    phoneNumber = prov.number;
  } catch (err) {
    phoneError = (err as Error).message;
    log.warn("Phone number auto-provisioning failed (non-blocking)", { clientServiceId, error: phoneError });
  }

  if (!phoneNumberId) {
    return {
      assistantId,
      skipped: false,
      definition: result.definition,
      status: "partial",
      phoneNumberId: null,
      phoneNumber: null,
      notLiveReason: phoneError
        ? `Assistant is built and pushed, but provisioning an inbound phone number failed (${phoneError}) — no one can call it yet. Retry to provision a number.`
        : "Assistant is built and pushed, but no inbound phone number is provisioned yet — no one can call it. Retry to provision a number.",
    };
  }

  return { assistantId, skipped: false, definition: result.definition, status: "live", phoneNumberId, phoneNumber };
}

/* ─── Per-Client Vapi Phone Number Provisioning ─── */

/**
 * Options for provisionVapiPhoneNumber.
 *
 * IMPORT MODE (the unification fix): when `importNumber` is supplied, Vapi
 * IMPORTS the client's EXISTING Twilio number and attaches the assistant to
 * it — instead of BUYING a brand-new Vapi number. This is what makes "the
 * number the client picked/ported = the number the AI answers on" true. The
 * import payload shape is verified against the Vapi server SDK
 * `CreateTwilioPhoneNumberDto` (POST /phone-number, provider:"twilio"):
 * `number` (E.164 digits the client owns on Twilio), `twilioAccountSid`,
 * `twilioAuthToken`, plus `assistantId`/`name`. Omitting `number` is exactly
 * the legacy bug that made Vapi buy a fresh number.
 */
export interface VapiPhoneProvisionOptions {
  /** E.164 number already owned on Twilio. Triggers IMPORT (not buy). */
  importNumber?: string;
}

export async function provisionVapiPhoneNumber(clientServiceId: number, assistantId?: string, options: VapiPhoneProvisionOptions = {}): Promise<{ phoneNumberId: string | null; number: string | null }> {
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

  // Build the POST /phone-number body. Import vs buy is decided by whether the
  // caller handed us an existing Twilio number to attach.
  const importNumber = options.importNumber?.trim() || undefined;
  let body: Record<string, unknown>;
  if (importNumber) {
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    if (!twilioAccountSid || !twilioAuthToken) {
      // We can't import without Twilio creds — never silently fall through to
      // BUYING a number (that would spend money AND give the AI a different
      // number than the client's). Fail honestly.
      log.error("Cannot import Twilio number into Vapi — TWILIO_ACCOUNT_SID/AUTH_TOKEN not configured", { clientServiceId });
      throw new Error("Twilio credentials not configured — cannot import the client's number into Vapi.");
    }
    body = {
      provider: "twilio",
      // `number` = the digits the client owns on Twilio. Verified field name
      // against Vapi server SDK CreateTwilioPhoneNumberDto.
      number: importNumber,
      twilioAccountSid,
      twilioAuthToken,
      assistantId,
      name: `TradeLine #${clientServiceId}`,
    };
  } else {
    body = { assistantId, provider: "twilio", name: `TradeLine #${clientServiceId}` };
  }

  try {
    const resp = await fetch(`${VAPI_API_BASE}/phone-number`, { method: "POST", headers: { "Authorization": `Bearer ${config.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!resp.ok) { const respBody = await resp.text(); throw new Error(`Vapi phone ${importNumber ? "import" : "provisioning"} failed (${resp.status}): ${respBody}`); }
    const data = await resp.json();
    const phoneNumberId = data.id;
    const number = data.number || data.phoneNumber || importNumber || null;
    if (phoneNumberId) {
      const latestConfig = await storage.getTradeLineConfig(clientServiceId);
      const ca = latestConfig?.assistant;
      await storage.updateTradeLineConfig(clientServiceId, { assistant: { ...ca!, vapiPhoneNumberId: phoneNumberId } } as any);
      await storage.logAdminActivity({ actor_type: "system", actor_name: "TradeLine Phone Provisioner", action: importNumber ? "tradeline.phone_imported" : "tradeline.phone_provisioned", entity_type: "client_service", entity_id: clientServiceId, summary: `${importNumber ? "Imported client's Twilio number into" : "Provisioned"} Vapi phone number: ${number || phoneNumberId}`, metadata: { vapiPhoneNumberId: phoneNumberId, number, imported: Boolean(importNumber) } });
      log.info(importNumber ? "Imported client Twilio number into Vapi" : "Provisioned Vapi phone number", { clientServiceId, phoneNumberId, number });
    }
    return { phoneNumberId: phoneNumberId || null, number };
  } catch (err) {
    log.error(importNumber ? "Vapi phone number import failed" : "Vapi phone number provisioning failed", { clientServiceId, error: (err as Error).message });
    await storage.logAdminActivity({ actor_type: "system", actor_name: "TradeLine Phone Provisioner", action: "tradeline.phone_provision_failed", entity_type: "client_service", entity_id: clientServiceId, summary: `Phone provisioning failed: ${(err as Error).message}` });
    return { phoneNumberId: null, number: null };
  }
}

/**
 * Multi-provider LLM fallback chain — business-continuity backstop.
 *
 * Goal (Alex's directive): never let a single LLM provider outage stop the
 * business. The primary path stays Anthropic Claude (see aiService.chat),
 * but when Anthropic exhausts its retries we cascade through a chain of
 * OpenAI-compatible providers, one shot each, until one answers.
 *
 * Every provider in the chain speaks the OpenAI `/chat/completions` schema, so
 * a single `openai` SDK client (with a per-provider baseURL + key) covers all
 * of them. A provider is only attempted when its API key is present, so the
 * chain auto-extends the moment a new key lands in Doppler — no code change.
 *
 * This is a RELIABILITY fallback, not a router: it does not retry within a
 * provider (the chain itself is the resilience) and it does not pass tools
 * (text-only; tool-using paths handle failover separately). Each attempt is
 * logged to ai_usage_logs with the real provider/model attribution so cost
 * governance sees every call.
 */
import OpenAI from "openai";
import { createLogger } from "../lib/logger";
import { logUsage } from "./usageTracker";
import { noisyCatch } from "../lib/silentFailureGuard";
import type { ChatMessage } from "./aiService";

const log = createLogger("LLMFallbackChain");

/** One OpenAI-compatible provider in the cascade. */
interface ChainProvider {
  /** Stable id used for logging + ai_usage_logs.provider attribution. */
  name: string;
  /** Resolve the API key from env; undefined → provider skipped (not ready). */
  apiKey: () => string | undefined;
  /** OpenAI-compatible base URL. Undefined → the OpenAI default. */
  baseURL?: string;
  /** Model id to request from this provider. */
  model: string;
}

/**
 * Default cascade order. Tuned for quality-then-speed after the OpenAI step,
 * with two open-weight hosts (Groq, Together) and Mistral as further depth.
 * DeepSeek + xAI are defined but only light up once their keys are provisioned.
 *
 * Override the order (or prune it) at runtime via AI_FALLBACK_CHAIN, e.g.
 *   AI_FALLBACK_CHAIN="groq,together,openai"
 */
const PROVIDERS: Record<string, ChainProvider> = {
  openai: {
    name: "openai",
    apiKey: () => process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    model: "gpt-4o-mini",
  },
  groq: {
    name: "groq",
    apiKey: () => process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
  },
  together: {
    name: "together",
    apiKey: () => process.env.TOGETHER_API_KEY,
    baseURL: "https://api.together.xyz/v1",
    model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  },
  mistral: {
    name: "mistral",
    apiKey: () => process.env.MISTRAL_API_KEY,
    baseURL: "https://api.mistral.ai/v1",
    model: "mistral-large-latest",
  },
  deepseek: {
    name: "deepseek",
    apiKey: () => process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  xai: {
    name: "xai",
    apiKey: () => process.env.XAI_API_KEY ?? process.env.GROK_API_KEY,
    baseURL: "https://api.x.ai/v1",
    model: "grok-2-latest",
  },
};

const DEFAULT_ORDER = ["openai", "groq", "together", "mistral", "deepseek", "xai"];

/** Resolve the active cascade order from env, falling back to the default. */
function resolveOrder(): ChainProvider[] {
  const raw = process.env.AI_FALLBACK_CHAIN;
  const order = raw
    ? raw.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_ORDER;
  const seen = new Set<string>();
  const out: ChainProvider[] = [];
  for (const name of order) {
    const p = PROVIDERS[name];
    if (p && !seen.has(name)) {
      seen.add(name);
      out.push(p);
    }
  }
  return out;
}

/** Lazily-built, cached OpenAI clients keyed by provider name. */
const clients = new Map<string, OpenAI>();
function clientFor(p: ChainProvider, key: string): OpenAI {
  const existing = clients.get(p.name);
  if (existing) return existing;
  const c = new OpenAI({ apiKey: key, baseURL: p.baseURL, timeout: 30_000 });
  clients.set(p.name, c);
  return c;
}

export interface FallbackChatInput {
  system?: string;
  messages: ChatMessage[];
  maxTokens: number;
  /** When set, every attempt is logged to ai_usage_logs under this surface. */
  surface?: string;
  userId?: number;
  sessionId?: string;
  /** Channel tag for ai_usage_logs (defaults to "chat_fallback"). */
  channel?: string;
}

export interface FallbackChatResult {
  text: string;
  /** Which provider answered. */
  provider: string;
  /** Which model answered. */
  model: string;
}

/** Provider names whose key is currently present (for diagnostics/health). */
export function readyFallbackProviders(): string[] {
  return resolveOrder()
    .filter((p) => !!p.apiKey())
    .map((p) => p.name);
}

/**
 * Run the cascade. Tries each ready provider once, in order, returning the
 * first success. Throws an aggregate error only when EVERY ready provider
 * failed (or none had a key). Never retries within a provider.
 */
export async function runTextFallbackChain(input: FallbackChatInput): Promise<FallbackChatResult> {
  const order = resolveOrder();
  const openaiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
  if (input.system) openaiMessages.push({ role: "system", content: input.system });
  for (const m of input.messages) openaiMessages.push({ role: m.role, content: m.content });

  const tried: Array<{ provider: string; error: string }> = [];

  for (const p of order) {
    const key = p.apiKey();
    if (!key) continue; // not configured — skip silently
    const tStart = Date.now();
    try {
      const client = clientFor(p, key);
      const completion = await client.chat.completions.create({
        model: p.model,
        max_tokens: input.maxTokens,
        messages: openaiMessages,
      });
      const text = completion.choices[0]?.message?.content ?? "";
      const usage = completion.usage;
      if (input.surface) {
        noisyCatch(
          logUsage({
            model: p.model,
            surface: input.surface as any,
            provider: p.name,
            channel: input.channel ?? "chat_fallback",
            userId: input.userId,
            sessionId: input.sessionId,
            inputTokens: usage?.prompt_tokens ?? 0,
            outputTokens: usage?.completion_tokens ?? 0,
            latencyMs: Date.now() - tStart,
            success: true,
          }),
          { op: "ai.logUsage.fallback_success", meta: { surface: input.surface, provider: p.name } },
        );
      }
      log.info("fallback-chain provider answered", { provider: p.name, model: p.model, afterTried: tried.length });
      return { text, provider: p.name, model: p.model };
    } catch (err: any) {
      const msg = err?.message?.slice(0, 300) ?? String(err);
      tried.push({ provider: p.name, error: msg });
      log.warn("fallback-chain provider failed", { provider: p.name, model: p.model, error: msg });
      if (input.surface) {
        noisyCatch(
          logUsage({
            model: p.model,
            surface: input.surface as any,
            provider: p.name,
            channel: input.channel ?? "chat_fallback",
            userId: input.userId,
            sessionId: input.sessionId,
            latencyMs: Date.now() - tStart,
            success: false,
            errorMessage: msg,
          }),
          { op: "ai.logUsage.fallback_failed", meta: { surface: input.surface, provider: p.name } },
        );
      }
      // fall through to the next provider
    }
  }

  const detail = tried.length
    ? `tried: ${tried.map((t) => `${t.provider}(${t.error})`).join("; ")}`
    : "no fallback providers configured (no API keys present)";
  throw new Error(`LLM fallback chain exhausted — ${detail}`);
}

import Anthropic from "@anthropic-ai/sdk";
import { createLogger } from "../lib/logger";

const log = createLogger("AIService");

/* ─── Configuration ─── */
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TOKENS = 600;
const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

/* ─── Circuit Breaker ─── */
const CB_FAILURE_THRESHOLD = 5;
const CB_FAILURE_WINDOW_MS = 2 * 60_000;   // 2 minutes
const CB_OPEN_DURATION_MS = 30_000;         // 30 seconds

type CircuitState = "closed" | "open" | "half_open";

let cbState: CircuitState = "closed";
let cbConsecutiveFailures = 0;
let cbFirstFailureAt = 0;
let cbOpenedAt = 0;

function recordSuccess(): void {
  if (cbState === "half_open") {
    cbState = "closed";
    log.info("Circuit breaker closed");
  }
  cbConsecutiveFailures = 0;
  cbFirstFailureAt = 0;
}

function recordFailure(): void {
  const now = Date.now();

  // If the first failure in the current window is older than 2min, reset
  if (cbFirstFailureAt > 0 && now - cbFirstFailureAt > CB_FAILURE_WINDOW_MS) {
    cbConsecutiveFailures = 0;
    cbFirstFailureAt = 0;
  }

  if (cbConsecutiveFailures === 0) {
    cbFirstFailureAt = now;
  }
  cbConsecutiveFailures++;

  if (cbState === "half_open") {
    // Probe failed — re-open
    cbState = "open";
    cbOpenedAt = now;
    log.warn("Circuit breaker opened", { reason: "half_open_probe_failed" });
    return;
  }

  if (cbState === "closed" && cbConsecutiveFailures >= CB_FAILURE_THRESHOLD) {
    cbState = "open";
    cbOpenedAt = now;
    log.warn("Circuit breaker opened", { consecutiveFailures: cbConsecutiveFailures });
  }
}

function assertCircuitAllowsRequest(): void {
  if (cbState === "closed") return;

  const now = Date.now();
  if (cbState === "open" && now - cbOpenedAt >= CB_OPEN_DURATION_MS) {
    // Transition to half-open: allow one probe request
    cbState = "half_open";
    log.info("Circuit breaker half-open, allowing probe request");
    return;
  }

  if (cbState === "open") {
    throw new Error("AI service temporarily unavailable, please try again shortly");
  }
  // half_open: allow the single probe request through
}

export function getModel(): string {
  return process.env.CLAUDE_MODEL || DEFAULT_MODEL;
}

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    _client = new Anthropic({ apiKey, timeout: TIMEOUT_MS });
  }
  return _client;
}

/**
 * Get the shared Anthropic client instance for advanced use cases
 * (e.g. vision/multimodal) that can't go through chat().
 * Callers MUST call assertCircuitAllowsRequest() before and
 * recordSuccess()/recordFailure() after.
 */
export { assertCircuitAllowsRequest, recordSuccess, recordFailure };
export function getSharedClient(): Anthropic {
  return getClient();
}

/** Check API key is present at startup/first use */
export function validateConfig(): { valid: boolean; error?: string } {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { valid: false, error: "ANTHROPIC_API_KEY is not set" };
  }
  return { valid: true };
}

/* ─── Types ─── */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  /** Tool definitions to pass to the model (Anthropic tool format) */
  tools?: any[];
  /** Override the default model for this request */
  modelOverride?: string;
  /**
   * Optional image blocks to append to the LAST user message (multimodal).
   * Used by the mobile Ask tab to attach photos to a question. The text
   * content stays as-is; we wrap it into a content-array of
   *   [{ type: "text", text }, ...image blocks]
   * matching Anthropic's Messages API multimodal schema.
   */
  userImageBlocks?: Array<{
    mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    /** Raw bytes; will be base64-encoded into a source.data field. */
    data: Buffer;
  }>;
}

/* ─── Helpers ─── */
function mapMessages(messages: ChatMessage[], userImageBlocks?: ChatOptions["userImageBlocks"]) {
  if (!userImageBlocks?.length) {
    return messages.map((m) => ({ role: m.role, content: m.content }));
  }
  // Find the LAST user message and wrap it into a multimodal content array.
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") { lastUserIdx = i; break; }
  }
  return messages.map((m, idx) => {
    if (idx === lastUserIdx) {
      const blocks: any[] = [{ type: "text", text: m.content }];
      for (const img of userImageBlocks) {
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: img.mediaType,
            data: img.data.toString("base64"),
          },
        });
      }
      return { role: m.role, content: blocks };
    }
    return { role: m.role, content: m.content };
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ─── Prompt caching helper ─── */
function buildCachedSystem(systemText: string): any {
  return [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } } as any];
}

/* ─── Streaming chat (returns Anthropic stream, caller handles events) ─── */
export function streamChat(opts: ChatOptions) {
  assertCircuitAllowsRequest();
  const client = getClient();
  const params: Parameters<typeof client.messages.stream>[0] = {
    model: opts.modelOverride || getModel(),
    max_tokens: opts.maxTokens || DEFAULT_MAX_TOKENS,
    system: opts.system ? buildCachedSystem(opts.system) : (undefined as any),
    messages: mapMessages(opts.messages),
  };
  if (opts.tools?.length) (params as any).tools = opts.tools;
  return client.messages.stream(params);
}

/* ─── Non-streaming chat with retry ─── */
export async function chat(opts: ChatOptions): Promise<string> {
  assertCircuitAllowsRequest();
  const client = getClient();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const params: Parameters<typeof client.messages.create>[0] = {
        model: opts.modelOverride || getModel(),
        max_tokens: opts.maxTokens || DEFAULT_MAX_TOKENS,
        system: opts.system ? buildCachedSystem(opts.system) : (undefined as any),
        messages: mapMessages(opts.messages, opts.userImageBlocks) as any,
      };
      if (opts.tools?.length) (params as any).tools = opts.tools;
      const response = await client.messages.create(params) as Anthropic.Message;

      const usage = response.usage as any;
      if (usage?.cache_creation_input_tokens || usage?.cache_read_input_tokens) {
        log.debug("Prompt cache stats", {
          cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
          input_tokens: usage.input_tokens ?? 0,
        });
      }

      const block = response.content[0];
      recordSuccess();
      return block.type === "text" ? block.text : "";
    } catch (err: any) {
      lastError = err;
      if (err?.status === 401 || err?.status === 400) throw err;
      recordFailure();
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  throw lastError || new Error("Chat request failed after retries");
}

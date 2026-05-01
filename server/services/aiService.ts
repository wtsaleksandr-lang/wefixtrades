import Anthropic from "@anthropic-ai/sdk";

/* ─── Configuration ─── */
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TOKENS = 600;
const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

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
}

/* ─── Helpers ─── */
function mapMessages(messages: ChatMessage[]) {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ─── Streaming chat (returns Anthropic stream, caller handles events) ─── */
export function streamChat(opts: ChatOptions) {
  const client = getClient();
  const params: Parameters<typeof client.messages.stream>[0] = {
    model: opts.modelOverride || getModel(),
    max_tokens: opts.maxTokens || DEFAULT_MAX_TOKENS,
    system: opts.system,
    messages: mapMessages(opts.messages),
  };
  if (opts.tools?.length) (params as any).tools = opts.tools;
  return client.messages.stream(params);
}

/* ─── Non-streaming chat with retry ─── */
export async function chat(opts: ChatOptions): Promise<string> {
  const client = getClient();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const params: Parameters<typeof client.messages.create>[0] = {
        model: opts.modelOverride || getModel(),
        max_tokens: opts.maxTokens || DEFAULT_MAX_TOKENS,
        system: opts.system,
        messages: mapMessages(opts.messages),
      };
      if (opts.tools?.length) (params as any).tools = opts.tools;
      const response = await client.messages.create(params) as Anthropic.Message;
      const block = response.content[0];
      return block.type === "text" ? block.text : "";
    } catch (err: any) {
      lastError = err;
      // Don't retry on auth errors or invalid requests
      if (err?.status === 401 || err?.status === 400) throw err;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  throw lastError || new Error("Chat request failed after retries");
}

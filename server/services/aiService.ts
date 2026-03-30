import Anthropic from "@anthropic-ai/sdk";

/* ─── Configuration ─── */
const DEFAULT_MODEL = "claude-haiku-4-5-20241022";
const MAX_TOKENS = 600;
const TIMEOUT_MS = 30_000;

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

/* ─── Types ─── */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StreamChatOptions {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
}

/* ─── Streaming chat ─── */
export function streamChat(opts: StreamChatOptions) {
  const client = getClient();
  return client.messages.stream({
    model: getModel(),
    max_tokens: opts.maxTokens || MAX_TOKENS,
    system: opts.system,
    messages: opts.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });
}

/* ─── Non-streaming chat ─── */
export async function chat(opts: StreamChatOptions): Promise<string> {
  const client = getClient();
  const response = await client.messages.create({
    model: getModel(),
    max_tokens: opts.maxTokens || MAX_TOKENS,
    system: opts.system,
    messages: opts.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });
  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}

import OpenAI from "openai";

let _client: OpenAI | null = null;

/**
 * Typed error thrown by getOpenAI() when AI_INTEGRATIONS_OPENAI_API_KEY is
 * absent. Carrying a stable `code` lets the route layer map the failure to a
 * graceful 503 ("AI temporarily unavailable") instead of leaking a generic
 * 500. Existing callers that only `catch` (or let it bubble) are unaffected —
 * it is still an Error with the same descriptive message.
 */
export class OpenAINotConfiguredError extends Error {
  readonly code = "OPENAI_NOT_CONFIGURED";
  constructor(
    message = "AI temporarily unavailable: OpenAI API key is not configured. Set AI_INTEGRATIONS_OPENAI_API_KEY to enable AI features.",
  ) {
    super(message);
    this.name = "OpenAINotConfiguredError";
  }
}

function buildClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    // Cap each request at 30s so a stalled provider can't hang a worker
    // (the 524 class). SDK default is 10min. Bounded chat/completions,
    // image gen, and short-audio transcription all complete well inside
    // this; callers needing longer can pass a per-request `timeout`
    // override on the individual `.create()` call.
    timeout: 30_000,
  });
}

/**
 * Returns the shared OpenAI client, initializing it lazily on first call.
 * Throws a typed {@link OpenAINotConfiguredError} (a subclass of Error with a
 * stable `code`) if the API key is not configured. Existing callers keep
 * working unchanged; route layers that want a graceful 503 can either catch
 * the typed error (`err.code === "OPENAI_NOT_CONFIGURED"`) or use the
 * non-throwing {@link tryGetOpenAI} below.
 */
export function getOpenAI(): OpenAI {
  if (!_client) {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    if (!apiKey) {
      throw new OpenAINotConfiguredError();
    }
    _client = buildClient(apiKey);
  }
  return _client;
}

/**
 * Non-throwing variant of {@link getOpenAI}. Returns the shared client, or
 * `{ client: null, reason }` when the key is absent — so voice/wizard surfaces
 * can render a graceful 503 ("AI temporarily unavailable") instead of letting
 * a bare throw become a 500. Does not break any existing caller (purely
 * additive).
 */
export function tryGetOpenAI():
  | { client: OpenAI; reason?: undefined }
  | { client: null; reason: string } {
  if (_client) return { client: _client };
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) {
    return {
      client: null,
      reason:
        "AI temporarily unavailable: OpenAI API key is not configured (AI_INTEGRATIONS_OPENAI_API_KEY absent).",
    };
  }
  _client = buildClient(apiKey);
  return { client: _client };
}

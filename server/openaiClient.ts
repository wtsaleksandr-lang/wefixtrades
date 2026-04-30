import OpenAI from "openai";

let _client: OpenAI | null = null;
let _legacyEnvWarned = false;

/**
 * Resolve the OpenAI API key from env.
 *
 * Canonical: OPENAI_API_KEY.
 * Backward-compatibility fallback: AI_INTEGRATIONS_OPENAI_API_KEY (legacy
 * name from earlier code). When the fallback is used, log a one-shot
 * warning so operators can migrate.
 */
export function resolveOpenAiKey(): string | undefined {
  const canonical = process.env.OPENAI_API_KEY;
  if (canonical) return canonical;
  const legacy = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (legacy) {
    if (!_legacyEnvWarned) {
      console.warn(
        "[openai] Using AI_INTEGRATIONS_OPENAI_API_KEY (legacy). Please rename to OPENAI_API_KEY in your environment.",
      );
      _legacyEnvWarned = true;
    }
    return legacy;
  }
  return undefined;
}

/**
 * Returns the shared OpenAI client, initializing it lazily on first call.
 * Throws a descriptive error if the API key is not configured.
 */
export function getOpenAI(): OpenAI {
  if (!_client) {
    const apiKey = resolveOpenAiKey();
    if (!apiKey) {
      throw new Error(
        "OpenAI API key is not configured. Set OPENAI_API_KEY to enable AI features.",
      );
    }
    _client = new OpenAI({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _client;
}

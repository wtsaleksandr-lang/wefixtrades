import OpenAI from "openai";

let _client: OpenAI | null = null;

/**
 * Returns the shared OpenAI client, initializing it lazily on first call.
 * Throws a descriptive error if the API key is not configured.
 */
export function getOpenAI(): OpenAI {
  if (!_client) {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OpenAI API key is not configured. Set AI_INTEGRATIONS_OPENAI_API_KEY to enable AI features."
      );
    }
    _client = new OpenAI({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _client;
}

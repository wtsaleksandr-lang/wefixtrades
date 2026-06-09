/**
 * Canonical LLM model-ID registry.
 *
 * Single source of truth for every LLM **model identifier** the platform sends
 * to a provider. Model IDs used to be scattered as bare string literals across
 * ~10 files; a stale literal once left ZERO voice assistants provisioned (the
 * Vapi `model.model` incident). Centralizing them here means a model upgrade is
 * a one-line edit and a typo can't silently diverge two surfaces.
 *
 * RULES
 *  - Every constant is `as const` so it keeps its narrow literal type. Several
 *    call sites assign these into a `SupportedModel` union (see
 *    `quotequickAiBudgetMath.ts`), which only accepts the exact literal — a
 *    widened `string` would break typechecking. Do not drop `as const`.
 *  - This module changes nothing about WHICH model a surface uses. It only
 *    relocates the literal. Behaviour is identical to the pre-centralization
 *    code, including every `process.env.*` override, which still wins at the
 *    call site (the constant is just the default the env falls back to).
 *
 * NOT here:
 *  - Vapi custom-llm identifiers (`VAPI_BRAND_MODEL` / `VAPI_TRADELINE_MODEL`
 *    in `vapiService.ts`) are opaque Vapi routing IDs, NOT LLM model IDs —
 *    they stay in `vapiService.ts`.
 *  - Per-model RATES live in `aiModelPricingTable.ts` (keyed by these same IDs).
 */

/* ─── Anthropic (Claude) ─────────────────────────────────────────────── */

/** Default Claude chat/text model (cheap + fast). Env override: `CLAUDE_MODEL`. */
export const CLAUDE_HAIKU = "claude-haiku-4-5-20251001" as const;

/** Claude vision / premium-tier model. Env override (vision): `CLAUDE_VISION_MODEL`. */
export const CLAUDE_SONNET = "claude-sonnet-4-6" as const;

/* ─── OpenAI ─────────────────────────────────────────────────────────── */

/** Default OpenAI chat/generation model. */
export const OPENAI_GPT_4O_MINI = "gpt-4o-mini" as const;

/** Default OpenAI image model. Env override: `IMAGE_MODEL`. */
export const OPENAI_IMAGE = "gpt-image-1" as const;

/* ─── LLM fallback-chain models (OpenAI-compatible providers) ─────────── */
/* One model id per provider in the business-continuity cascade
 * (see `llmFallbackChain.ts`). These are the canonical request strings;
 * each provider is only attempted when its API key is present. */

/** Groq — open-weight Llama host. */
export const GROQ_LLAMA = "llama-3.3-70b-versatile" as const;

/** Together — open-weight Llama host (full namespaced id). */
export const TOGETHER_LLAMA = "meta-llama/Llama-3.3-70B-Instruct-Turbo" as const;

/** Mistral. */
export const MISTRAL_LARGE = "mistral-large-latest" as const;

/** DeepSeek. */
export const DEEPSEEK_CHAT = "deepseek-chat" as const;

/** xAI (Grok). */
export const XAI_GROK = "grok-2-latest" as const;

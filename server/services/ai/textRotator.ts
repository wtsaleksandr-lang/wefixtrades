/**
 * Text generation rotator — Claude → OpenAI → Gemini.
 *
 * Drop-in alternative to direct aiService.chat() calls. Today's default
 * order: Anthropic Claude → OpenAI GPT-4o → Google Gemini 2.5 Pro.
 *
 * NOTE: At the time of this PR landing:
 *   - ANTHROPIC_API_KEY is set ✓
 *   - OPENAI_API_KEY is set ✓ (also wired for image gen)
 *   - GOOGLE_AI_API_KEY / GEMINI_API_KEY NOT set — Gemini provider will
 *     mark itself not-ready and the rotator will skip it. Provision via
 *     `gcloud services api-keys create --api-target=service=generativelanguage.googleapis.com`
 *     when you want it active.
 *
 * Callers should NOT be migrated to this in this PR. Future refactor PR.
 * Currently lives alongside aiService.ts as the new path.
 */

import Anthropic from "@anthropic-ai/sdk";
import { rotate, resolveProviderOrder, type ProviderImpl } from "./rotator";

export interface TextInput {
  system?: string;
  user: string;
  max_tokens?: number;
  /** "premium" → top model. "standard" → mid. "fast" → cheap+fast. */
  tier?: "premium" | "standard" | "fast";
}

export interface TextOutput {
  text: string;
  /** Raw token counts when the provider reports them. */
  usage?: { input_tokens?: number; output_tokens?: number };
}

/* ─── Anthropic ─────────────────────────────────────────────────────── */

const anthropicProvider: ProviderImpl<TextInput, TextOutput> = {
  name: "anthropic",
  ready: () => !!process.env.ANTHROPIC_API_KEY,
  invoke: async (input) => {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const model = input.tier === "premium" ? "claude-sonnet-4-6"
      : input.tier === "fast" ? "claude-haiku-4-5-20251001"
      : "claude-haiku-4-5-20251001";
    const res = await client.messages.create({
      model,
      max_tokens: input.max_tokens ?? 2048,
      system: input.system,
      messages: [{ role: "user", content: input.user }],
    });
    const block = res.content.find((b: any) => b.type === "text");
    const text = (block as any)?.text ?? "";
    return {
      text,
      usage: {
        input_tokens: res.usage?.input_tokens,
        output_tokens: res.usage?.output_tokens,
      },
    };
  },
};

/* ─── OpenAI ────────────────────────────────────────────────────────── */

const openaiProvider: ProviderImpl<TextInput, TextOutput> = {
  name: "openai",
  ready: () => !!(process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY),
  invoke: async (input) => {
    const key = process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY!;
    const model = input.tier === "premium" ? "gpt-4o"
      : input.tier === "fast" ? "gpt-4o-mini"
      : "gpt-4.1";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: input.max_tokens ?? 2048,
        messages: [
          ...(input.system ? [{ role: "system", content: input.system }] : []),
          { role: "user", content: input.user },
        ],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      const err: any = new Error(`OpenAI ${res.status}: ${errBody.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    const json: any = await res.json();
    return {
      text: json.choices?.[0]?.message?.content ?? "",
      usage: {
        input_tokens: json.usage?.prompt_tokens,
        output_tokens: json.usage?.completion_tokens,
      },
    };
  },
};

/* ─── Gemini (Google AI Studio) ─────────────────────────────────────── */

const geminiProvider: ProviderImpl<TextInput, TextOutput> = {
  name: "gemini",
  ready: () => !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY),
  invoke: async (input) => {
    const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY!;
    const model = input.tier === "premium" ? "gemini-2.5-pro"
      : input.tier === "fast" ? "gemini-2.5-flash"
      : "gemini-2.5-pro";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{ text: (input.system ? input.system + "\n\n" : "") + input.user }],
        }],
        generationConfig: {
          maxOutputTokens: input.max_tokens ?? 2048,
        },
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      const err: any = new Error(`Gemini ${res.status}: ${errBody.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    const json: any = await res.json();
    const text = json.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
    return {
      text,
      usage: {
        input_tokens: json.usageMetadata?.promptTokenCount,
        output_tokens: json.usageMetadata?.candidatesTokenCount,
      },
    };
  },
};

/* ─── Public entry point ────────────────────────────────────────────── */

const DEFAULT_ORDER = [anthropicProvider, openaiProvider, geminiProvider];

export async function generateText(input: TextInput) {
  const providers = resolveProviderOrder("AI_TEXT_PROVIDERS", DEFAULT_ORDER);
  return rotate(input, providers, "text");
}

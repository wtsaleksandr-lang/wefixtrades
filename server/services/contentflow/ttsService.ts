/**
 * ContentFlow Phase 2 — narration TTS service (WP5, design §1.3).
 *
 * Audio paths for the video pipeline:
 *   Path A (default v1): Veo native audio — narration text goes in the
 *     render request; this service is NOT involved.
 *   Path B (Kling / fallback providers render silent): the worker calls
 *     this service to synthesize the scene-plan narration as one mp3, then
 *     hands it to the stitcher (narrationAudioPath) which ducks the native
 *     bed under the voice-over.
 *
 * GATING — left to callers by design: this module performs NO feature-flag
 * checks. The worker must gate Path B behind VIDEO_TTS_ENABLED === "true"
 * (inert by default) AND record audio_mode = "tts" on the project. Keeping
 * the flag out of this module lets admin preview surfaces reuse synthesis
 * without flipping the pipeline flag.
 *
 * First implementation: OpenAI `tts-1` — the repo's established TTS path
 * (server/lib/voicePreview.ts uses the same model via the shared client in
 * server/openaiClient.ts) and the cheap option ($15 / 1M chars ≈ $0.015 per
 * minute of narration). `gpt-4o-mini-tts` costs roughly the same but is not
 * used anywhere in the repo, so tts-1 keeps conventions aligned.
 *
 * Buffers are acceptable HERE (unlike video clips): narration audio for a
 * ≤64s deliverable is well under 1 MB.
 *
 * Env: AI_INTEGRATIONS_OPENAI_API_KEY (repo standard) or OPENAI_API_KEY
 * (legacy fallback, mirrors voicePreview.ts). Missing key → graceful skip
 * result, never a throw.
 */

import OpenAI from "openai";
import { tryGetOpenAI } from "../../openaiClient";
import { createLogger } from "../../lib/logger";

const log = createLogger("ContentflowTts");

/** OpenAI tts-1 pricing: $15 per 1M characters → 15 micro-USD per char. */
const TTS1_MICRO_USD_PER_CHAR = 15;

const OPENAI_TTS_MODEL = "tts-1";
const DEFAULT_VOICE = "alloy";

const OPENAI_TTS_VOICES = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
] as const;
export type OpenAiTtsVoice = (typeof OPENAI_TTS_VOICES)[number];

export type TtsResult =
  | { ok: true; mp3Buffer: Buffer; costMicroUsd: number }
  | { ok: false; error: string; skipped?: boolean };

export interface TtsProvider {
  /** Stable id recorded in cost_breakdown / logs. */
  id: string;
  /** True when the provider's credentials are present. Never throws. */
  isConfigured(): boolean;
  /**
   * Synthesize narration text to mp3. Returns a Result — never throws.
   * `skipped: true` marks "not configured" (caller falls back to silent /
   * native audio) as distinct from a hard synthesis failure.
   */
  synthesize(text: string, voice?: string): Promise<TtsResult>;
}

/** Injectable client factory so tests run without a key / network. */
export interface OpenAiTtsDeps {
  getClient: () => Pick<OpenAI, "audio"> | null;
  env: Record<string, string | undefined>;
}

function defaultGetClient(): Pick<OpenAI, "audio"> | null {
  const attempt = tryGetOpenAI();
  if (attempt.client) return attempt.client;
  // Legacy fallback: some deployments only set OPENAI_API_KEY (the shared
  // client reads AI_INTEGRATIONS_OPENAI_API_KEY exclusively).
  const legacyKey = process.env.OPENAI_API_KEY;
  if (legacyKey) {
    return new OpenAI({ apiKey: legacyKey, timeout: 30_000 });
  }
  return null;
}

function normalizeVoice(voice: string | undefined): OpenAiTtsVoice {
  if (voice && (OPENAI_TTS_VOICES as readonly string[]).includes(voice)) {
    return voice as OpenAiTtsVoice;
  }
  return DEFAULT_VOICE;
}

export function createOpenAiTtsProvider(
  overrides: Partial<OpenAiTtsDeps> = {},
): TtsProvider {
  const deps: OpenAiTtsDeps = {
    getClient: overrides.getClient ?? defaultGetClient,
    env: overrides.env ?? process.env,
  };

  return {
    id: "openai_tts1",

    isConfigured(): boolean {
      return !!(
        deps.env.AI_INTEGRATIONS_OPENAI_API_KEY || deps.env.OPENAI_API_KEY
      );
    },

    async synthesize(text: string, voice?: string): Promise<TtsResult> {
      const trimmed = text?.trim();
      if (!trimmed) {
        return { ok: false, error: "tts called with empty text" };
      }
      if (!this.isConfigured()) {
        // Graceful env-skip — pipeline falls back to silent / native audio.
        return { ok: false, error: "tts_not_configured", skipped: true };
      }
      try {
        const client = deps.getClient();
        if (!client) {
          return { ok: false, error: "tts_not_configured", skipped: true };
        }
        const res = await client.audio.speech.create({
          model: OPENAI_TTS_MODEL,
          voice: normalizeVoice(voice),
          input: trimmed,
          response_format: "mp3",
        });
        const mp3Buffer = Buffer.from(await res.arrayBuffer());
        if (mp3Buffer.length === 0) {
          return { ok: false, error: "tts returned empty audio" };
        }
        const costMicroUsd = trimmed.length * TTS1_MICRO_USD_PER_CHAR;
        log.info("narration synthesized", {
          chars: trimmed.length,
          bytes: mp3Buffer.length,
          costMicroUsd,
        });
        return { ok: true, mp3Buffer, costMicroUsd };
      } catch (err: any) {
        log.error("tts synthesis failed", { error: err?.message });
        return { ok: false, error: `tts failed: ${err?.message || err}` };
      }
    },
  };
}

/** Default provider instance (OpenAI tts-1). */
export const openAiTtsProvider = createOpenAiTtsProvider();

/**
 * Returns the first configured TTS provider, or null when none is — callers
 * treat null as "narration unavailable" and proceed silent/native.
 * (Single-provider v1; an ElevenLabs/Gemini entry slots in here later.)
 */
export function getTtsProvider(): TtsProvider | null {
  if (openAiTtsProvider.isConfigured()) return openAiTtsProvider;
  return null;
}

/**
 * Voice preview cache — generates a short TTS sample per voice slot and
 * caches it on disk so subsequent admin-UI Play clicks are instant.
 *
 * Wave 44 — provider swap. The admin TradeLine voices page maps each
 * catalog row to an ElevenLabs voice id. Production TradeLine calls go
 * out through Vapi configured with `voice: { provider: "11labs" }`, so
 * customers hear ElevenLabs voices on real calls. Previews used to
 * render via OpenAI `tts-1` (alloy/echo/fable/onyx/nova/shimmer) — that
 * created an audible mismatch: customers previewed a robotic OpenAI
 * voice but heard a natural ElevenLabs one on the actual call. Bad UX
 * (Alex's flag: "sounds robotic, Vapi was much more natural").
 *
 * Strategy:
 *   1. If `ELEVENLABS_API_KEY` is set, call ElevenLabs `text-to-speech`
 *      with the row's real ElevenLabs voice ID (or a passed default —
 *      Rachel `21m00Tcm4TlvDq8ikWAM` matches `VAPI_WFT_VOICE_ID`'s
 *      default and is the production voice).
 *   2. If ElevenLabs fails or no key is configured, fall back to OpenAI
 *      `tts-1` so admin UI Play never breaks (graceful degradation).
 *   3. Cache on disk by voice slug — file regenerates only when the
 *      cache file is removed manually, so per-preview cost is ≈ one
 *      ElevenLabs synthesis per voice across the entire app lifetime.
 *
 * Cache layout: /tmp/voice-samples-cache/{voiceId}.mp3
 *   - Uses the catalog `id` (slug) as the cache key, NOT the eleven id —
 *     so if an admin re-points a slug to a different eleven voice the
 *     cache refreshes on next reload (admin can `Remove-Item` manually).
 *
 * Returns null when neither provider is configured / both fail; the
 * route layer turns that into a 503 + frontend toast.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getOpenAI } from "../openaiClient";
import { createLogger } from "./logger";

const log = createLogger("VoicePreview");

const CACHE_DIR = join(tmpdir(), "voice-samples-cache");
const SAMPLE_TEXT =
  "Hi, thanks for calling. How can I help with your job today?";

/**
 * ElevenLabs Rachel — same voice used by Vapi for WeFixTrades production
 * calls (see server/services/vapiService.ts where `VAPI_WFT_VOICE_ID`
 * defaults to this same value). Using it as the preview default ensures
 * "what you hear in the preview = what your customers will hear".
 */
export const ELEVENLABS_RACHEL_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";
// `eleven_turbo_v2_5` is the fastest model with broad voice support —
// ~$0.30 per 1k chars on the standard tier; an 80-char greeting costs
// ≈ $0.024, and we cache to disk so each voice synthesizes once. Well
// under the $0.50/preview threshold called out in the Wave 44 brief.
const ELEVENLABS_MODEL = "eleven_turbo_v2_5";

/** Absolute path to the cache file for a given voice slug. */
export function cachePathFor(voiceId: string): string {
  return join(CACHE_DIR, `${voiceId}.mp3`);
}

/**
 * Cache path for an arbitrary (voice, text) pair. Used by the template
 * voice-preview route — the cache key folds in the voice + a text hash
 * so the same (template, tone, sample sentence) tuple always returns
 * the same MP3, while edits to the template name/tone produce a fresh
 * synthesis on next click.
 */
export function cachePathForText(
  keyPrefix: string,
  voiceLabel: string,
  text: string,
): string {
  const textHash = createHash("sha256")
    .update(text)
    .digest("hex")
    .slice(0, 12);
  const safePrefix = keyPrefix.replace(/[^a-z0-9_-]/gi, "_").slice(0, 60);
  const safeVoice = voiceLabel.replace(/[^a-z0-9_-]/gi, "_").slice(0, 40);
  return join(
    CACHE_DIR,
    `${safePrefix}_${safeVoice}_${textHash}.mp3`,
  );
}

/** True when a TTS provider is configured (ElevenLabs OR OpenAI). */
export function isPreviewAvailable(): boolean {
  return !!(
    process.env.ELEVENLABS_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  );
}

/** True when the ElevenLabs path is configured (primary provider). */
export function isElevenLabsAvailable(): boolean {
  return !!process.env.ELEVENLABS_API_KEY;
}

/**
 * Synthesize MP3 bytes via the ElevenLabs text-to-speech API.
 * Returns null on failure so callers can fall back to OpenAI.
 */
async function synthesizeElevenLabs(
  elevenLabsVoiceId: string,
  text: string,
): Promise<Buffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  try {
    const resp = await fetch(
      `${ELEVENLABS_API_BASE}/text-to-speech/${encodeURIComponent(elevenLabsVoiceId)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: ELEVENLABS_MODEL,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0,
            use_speaker_boost: true,
          },
        }),
      },
    );
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      log.warn("elevenlabs tts failed; will fall back", {
        status: resp.status,
        body: body.slice(0, 200),
        voiceId: elevenLabsVoiceId,
      });
      return null;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length === 0) {
      log.warn("elevenlabs returned empty buffer; falling back", {
        voiceId: elevenLabsVoiceId,
      });
      return null;
    }
    return buf;
  } catch (err: any) {
    log.warn("elevenlabs tts threw; falling back", {
      error: err?.message,
      voiceId: elevenLabsVoiceId,
    });
    return null;
  }
}

/**
 * Synthesize MP3 bytes via OpenAI `tts-1` — used as graceful fallback
 * when ElevenLabs is unconfigured or errors out. Same behavior as the
 * pre-Wave-44 path so the admin UI keeps working without ElevenLabs.
 */
async function synthesizeOpenAI(
  openaiVoice: string,
  text: string,
): Promise<Buffer | null> {
  if (
    !process.env.OPENAI_API_KEY &&
    !process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  ) {
    return null;
  }
  try {
    const client = getOpenAI();
    const resp = await client.audio.speech.create({
      model: "tts-1",
      voice: openaiVoice as
        | "alloy"
        | "echo"
        | "fable"
        | "onyx"
        | "nova"
        | "shimmer",
      input: text,
      response_format: "mp3",
    });
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length === 0) return null;
    return buf;
  } catch (err: any) {
    log.error("openai tts fallback failed", { error: err?.message });
    return null;
  }
}

/**
 * Return MP3 bytes for the given voice slug, generating on first
 * request and serving from disk thereafter.
 *
 * Wave 44 — prefers ElevenLabs (same provider as production calls);
 * falls back to OpenAI tts-1 when ElevenLabs isn't configured or
 * errors out. Logs the fallback path so ops can monitor.
 *
 * @param voiceId             — catalog slug (e.g. "sarah_warm"); cache key.
 * @param openaiVoice         — OpenAI TTS preset used as fallback.
 * @param elevenLabsVoiceId   — Optional production ElevenLabs voice id.
 *                              Falls back to Rachel (the WeFixTrades
 *                              default in vapiService.ts) when omitted.
 * @returns Buffer of audio/mpeg bytes, or null if generation failed.
 */
export async function getOrCreateSample(
  voiceId: string,
  openaiVoice: string,
  elevenLabsVoiceId?: string | null,
): Promise<Buffer | null> {
  const path = cachePathFor(voiceId);

  // Fast path — cached file already on disk.
  try {
    const s = await stat(path);
    if (s.isFile() && s.size > 0) {
      return await readFile(path);
    }
  } catch {
    // Cache miss; fall through to generate.
  }

  if (!isPreviewAvailable()) {
    log.warn("preview unavailable — no TTS key configured", { voiceId });
    return null;
  }

  try {
    await mkdir(CACHE_DIR, { recursive: true });
    // Try ElevenLabs first — it's the same provider as production calls.
    let buf: Buffer | null = null;
    const elevenId = elevenLabsVoiceId || ELEVENLABS_RACHEL_VOICE_ID;
    if (isElevenLabsAvailable()) {
      buf = await synthesizeElevenLabs(elevenId, SAMPLE_TEXT);
      if (!buf) {
        log.info("falling back to OpenAI tts-1 for preview", { voiceId });
      }
    }
    // Fallback: OpenAI tts-1 (preserves pre-Wave-44 behavior).
    if (!buf) {
      buf = await synthesizeOpenAI(openaiVoice, SAMPLE_TEXT);
    }
    if (!buf) {
      log.error("all tts providers failed", { voiceId });
      return null;
    }
    await writeFile(path, buf);
    return buf;
  } catch (err: any) {
    log.error("voice preview synthesis failed", {
      voiceId,
      error: err?.message,
    });
    return null;
  }
}

/**
 * Synthesize MP3 bytes for an arbitrary text in a given voice, cached
 * on disk by (keyPrefix, voiceLabel, sha256(text)). Used by the
 * TradeLine template voice-preview route so a tone-flavored greeting
 * derived from the template (name + tone) is generated once and reused.
 *
 * Wave 44 — prefers ElevenLabs Rachel (production voice) and falls back
 * to the supplied OpenAI preset on error / missing key.
 *
 * @param keyPrefix         — short slug used as the filename prefix.
 * @param openaiVoice       — OpenAI TTS preset for the fallback path.
 * @param text              — sentence to synthesize.
 * @param elevenLabsVoiceId — Optional override; defaults to Rachel.
 * @returns Buffer of audio/mpeg bytes, or null if synthesis failed.
 */
export async function getOrCreateSampleForText(
  keyPrefix: string,
  openaiVoice: string,
  text: string,
  elevenLabsVoiceId?: string | null,
): Promise<Buffer | null> {
  // Cache key folds in the *active* provider label so ElevenLabs and
  // OpenAI samples for the same (template, tone, text) don't collide.
  // When ElevenLabs is configured we key by `el_<voiceid>`; otherwise
  // we key by the OpenAI preset.
  const voiceLabel = isElevenLabsAvailable()
    ? `el_${elevenLabsVoiceId || ELEVENLABS_RACHEL_VOICE_ID}`
    : openaiVoice;
  const path = cachePathForText(keyPrefix, voiceLabel, text);

  // Fast path — cached file already on disk.
  try {
    const s = await stat(path);
    if (s.isFile() && s.size > 0) {
      return await readFile(path);
    }
  } catch {
    // Cache miss; fall through to generate.
  }

  if (!isPreviewAvailable()) {
    log.warn("preview unavailable — no TTS key configured", { keyPrefix });
    return null;
  }

  try {
    await mkdir(CACHE_DIR, { recursive: true });
    let buf: Buffer | null = null;
    const elevenId = elevenLabsVoiceId || ELEVENLABS_RACHEL_VOICE_ID;
    if (isElevenLabsAvailable()) {
      buf = await synthesizeElevenLabs(elevenId, text);
      if (!buf) {
        log.info("falling back to OpenAI tts-1 for template preview", {
          keyPrefix,
        });
      }
    }
    if (!buf) {
      buf = await synthesizeOpenAI(openaiVoice, text);
    }
    if (!buf) {
      log.error("all tts providers failed for template", { keyPrefix });
      return null;
    }
    await writeFile(path, buf);
    return buf;
  } catch (err: any) {
    log.error("template voice preview synthesis failed", {
      keyPrefix,
      error: err?.message,
    });
    return null;
  }
}

/**
 * Map a voice catalog row to an OpenAI TTS preset. Kept for the
 * fallback path — ElevenLabs uses the row's `elevenlabs_voice_id`
 * directly so this hashing only applies when OpenAI is taking over.
 *
 * OpenAI's TTS service only exposes 6 fixed voices (no per-voice cloning
 * on this model tier). We pick one deterministically based on the voice's
 * gender + slug hash so each catalog row consistently previews with the
 * same OpenAI voice when fallback engages.
 */
export function pickOpenAIVoice(
  voiceId: string,
  gender: string | null,
): string {
  const female: string[] = ["nova", "shimmer", "alloy"];
  const male: string[] = ["onyx", "echo", "fable"];
  const pool = gender === "male" ? male : gender === "female" ? female : [...female, ...male];
  let hash = 0;
  for (let i = 0; i < voiceId.length; i++) {
    hash = (hash * 31 + voiceId.charCodeAt(i)) | 0;
  }
  return pool[Math.abs(hash) % pool.length];
}

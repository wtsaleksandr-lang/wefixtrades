/**
 * Voice preview cache — generates a short OpenAI TTS sample per voice slot
 * and caches it on disk so subsequent admin-UI Play clicks are instant.
 *
 * The admin TradeLine voices page maps each catalog row to an ElevenLabs
 * voice id, but we don't always have a sample_audio_url filled in. To give
 * Alex an immediate "what does this voice sound like?" cue without paying
 * the ElevenLabs sample-fetch cost on every catalog open, we synthesize a
 * one-line greeting via OpenAI TTS and cache the MP3 by voice slug.
 *
 * Cache layout: /tmp/voice-samples-cache/{voiceId}.mp3
 *   - We use the catalog `id` (slug) as the cache key, NOT the eleven id —
 *     because if an admin re-points a slug to a different eleven voice we
 *     want the cache to refresh on next reload (admin can `Remove-Item` the
 *     file manually; this is a UX preview, not a billable surface).
 *
 * Returns null when the OpenAI key is missing or TTS fails; the route
 * layer turns that into a 503 + frontend toast.
 */

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getOpenAI } from "../openaiClient";
import { createLogger } from "./logger";

const log = createLogger("VoicePreview");

const CACHE_DIR = join(tmpdir(), "voice-samples-cache");
const SAMPLE_TEXT =
  "Hi, thanks for calling. How can I help with your job today?";

/** Absolute path to the cache file for a given voice slug. */
export function cachePathFor(voiceId: string): string {
  return join(CACHE_DIR, `${voiceId}.mp3`);
}

/** True when an OpenAI key is configured somewhere in env. */
export function isPreviewAvailable(): boolean {
  return !!(
    process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  );
}

/**
 * Return MP3 bytes for the given voice slug, generating via OpenAI TTS
 * on first request and serving from disk thereafter.
 *
 * @param voiceId — catalog slug (e.g. "sarah_warm"); used as cache key.
 * @param openaiVoice — OpenAI TTS voice name. OpenAI has its own preset
 *                     names (alloy/echo/fable/onyx/nova/shimmer); the
 *                     route picks one deterministically from the slug.
 * @returns Buffer of audio/mpeg bytes, or null if generation failed.
 */
export async function getOrCreateSample(
  voiceId: string,
  openaiVoice: string,
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
    log.warn("preview unavailable — no OpenAI key", { voiceId });
    return null;
  }

  try {
    await mkdir(CACHE_DIR, { recursive: true });
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
      input: SAMPLE_TEXT,
      response_format: "mp3",
    });
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length === 0) {
      log.error("openai tts returned empty buffer", { voiceId });
      return null;
    }
    await writeFile(path, buf);
    return buf;
  } catch (err: any) {
    log.error("openai tts failed", { voiceId, error: err?.message });
    return null;
  }
}

/**
 * Map a voice catalog row to an OpenAI TTS preset.
 *
 * OpenAI's TTS service only exposes 6 fixed voices (no per-voice cloning
 * on this model tier). We pick one deterministically based on the voice's
 * gender + slug hash so each catalog row consistently previews with the
 * same OpenAI voice, even though the production calls go through
 * ElevenLabs with the row's real elevenlabs_voice_id.
 *
 * This is intentional: the preview tells Alex "roughly what register" the
 * voice has, not "exactly what production sounds like" — that's what the
 * sample_audio_url field is for once a real sample is uploaded.
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

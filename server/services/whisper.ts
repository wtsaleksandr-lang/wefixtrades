/**
 * Thin wrapper around OpenAI Whisper-1 for transcription.
 *
 * Why a shared service instead of inlining the OpenAI call?
 *   - Multiple surfaces will need transcription (mobile Ask tab, future
 *     voicemail-to-text, future portal voice input). Each one should
 *     hit the same model / parameters so we don't get drift in quality
 *     or latency between surfaces.
 *   - Centralized place to swap models (e.g. whisper-1 →
 *     gpt-4o-mini-transcribe) without touching every route.
 *
 * Note: `server/replit_integrations/audio/client.ts` also exports a
 * `speechToText` helper, but it pins `gpt-4o-mini-transcribe` and was
 * built for the audio-chat conversation surface. We deliberately keep
 * THIS module dedicated to whisper-1 because:
 *   - whisper-1 is OpenAI's stable, documented STT model with the
 *     well-known 25MB request cap and verbose_json `duration` field.
 *   - gpt-4o-mini-transcribe does not return a duration in its base
 *     response, which the mobile UI uses to show a "playback length"
 *     before the user confirms the transcript.
 */

import { toFile } from "openai";
import { Buffer } from "node:buffer";
import { getOpenAI } from "../openaiClient";

/** OpenAI's documented hard limit for the /audio/transcriptions endpoint. */
export const WHISPER_MAX_BYTES = 25 * 1024 * 1024;

/** Container formats Whisper accepts directly (no re-encoding needed). */
export type WhisperInputFormat = "m4a" | "mp3" | "mp4" | "mpeg" | "mpga" | "wav" | "webm";

export interface TranscriptionResult {
  /** Plain-text transcript with no timestamps. */
  transcript: string;
  /**
   * Duration of the source audio in seconds, rounded to nearest second.
   * `undefined` if Whisper didn't return one (very short clips can
   * occasionally come back without it).
   */
  durationSec: number | undefined;
}

/**
 * Transcribe an audio buffer with Whisper-1.
 *
 * Caller is responsible for size-limiting the buffer before this is
 * called (we re-check here as a defense-in-depth, but the route layer
 * should reject oversized uploads before they hit OpenAI).
 *
 * `filename` is passed to OpenAI's SDK so the server side can sniff
 * the container — pass the original upload's filename when possible.
 */
export async function transcribeWithWhisper(
  audioBuffer: Buffer,
  filename: string,
): Promise<TranscriptionResult> {
  if (audioBuffer.length === 0) {
    throw new Error("Empty audio buffer");
  }
  if (audioBuffer.length > WHISPER_MAX_BYTES) {
    throw new Error(
      `Audio exceeds Whisper's 25 MB limit (${audioBuffer.length} bytes)`,
    );
  }

  const file = await toFile(audioBuffer, filename);

  // Retry transient failures (429 / 5xx / network) with exponential backoff.
  // Whisper is a one-shot upload — a single retry is enough to absorb a
  // mid-day rate-limit spike without making the caller wait too long.
  const maxAttempts = 3;
  let response: any;
  let lastErr: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      response = await getOpenAI().audio.transcriptions.create({
        file,
        model: "whisper-1",
        // verbose_json gives us a `duration` field; default `json` does not.
        response_format: "verbose_json",
      });
      lastErr = null;
      break;
    } catch (err: any) {
      lastErr = err;
      const status = err?.status ?? err?.response?.status;
      const retriable = status === 429 || (typeof status === "number" && status >= 500 && status < 600);
      if (!retriable || attempt === maxAttempts) throw err;
      // 500ms, 1500ms backoff
      await new Promise((r) => setTimeout(r, 500 * Math.pow(3, attempt - 1)));
    }
  }
  if (lastErr || !response) throw lastErr ?? new Error("Whisper transcription failed");

  // The SDK types `verbose_json` loosely; cast to read `duration`.
  const raw = response as unknown as { text: string; duration?: number };
  const durationSec =
    typeof raw.duration === "number" && Number.isFinite(raw.duration)
      ? Math.max(0, Math.round(raw.duration))
      : undefined;

  return {
    transcript: raw.text ?? "",
    durationSec,
  };
}

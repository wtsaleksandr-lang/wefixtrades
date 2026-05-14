/**
 * Mobile AI voice-input transcription.
 *
 * The mobile Ask tab lets a user hold-to-record a question. This
 * endpoint takes that recording and returns the Whisper transcript so
 * the UI can show it to the user BEFORE they confirm sending it to
 * the chat assistant.
 *
 * ── Why a separate endpoint (transcribe vs. transcribe-and-send) ──
 * Splitting the two steps is a deliberate UX choice:
 *   1. User records, sees text immediately — can edit typos / mis-
 *      hearings before the AI ever sees them.
 *   2. User can cancel a misheard question without burning a chat
 *      turn (and the assistant doesn't get bogus context).
 *   3. The chat endpoint (/api/mobile/ai/chat) stays pure — text in,
 *      text out — and we don't have to fork it for audio paths.
 *
 * Combining transcribe+send in one call would force "send-on-record"
 * which our designers explicitly rejected.
 *
 * ── Why base64-in-JSON instead of multipart/form-data ──
 * Every other binary-upload endpoint in this repo (chat attachments,
 * the existing replit-integrations audio routes, admin CRM
 * deliverables) uses base64-in-JSON to avoid pulling in `multer` /
 * `busboy` / `express-fileupload`. We follow the same convention so
 * the body-parser surface stays uniform across the API.
 *
 * The mobile client base64-encodes the m4a/mp3/wav blob before
 * POSTing — trivial in React Native via `expo-file-system`'s
 * `readAsStringAsync({ encoding: Base64 })`.
 *
 * ── Auth ──
 * `requireSessionOrBearer` — same hybrid mobile auth used by every
 * other /api/mobile/ai/* endpoint.
 *
 * ── Rate limiting ──
 * `voiceTranscribeRateLimiter`: 30 transcriptions/hour per user.
 * See rateLimiter.ts for the cost-envelope rationale.
 */

import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import { requireSessionOrBearer } from "../lib/mobileAuth";
import { transcribeWithWhisper, WHISPER_MAX_BYTES } from "../services/whisper";
import { voiceTranscribeRateLimiter } from "../services/rateLimiter";
import { createLogger } from "../lib/logger";

const log = createLogger("MobileAiVoice");

/**
 * Body parser limit for this route only. We allow 35 MB of JSON so a
 * 25 MB binary still fits once base64-encoded (~33% inflation).
 */
const transcribeBodyParser = express.json({ limit: "35mb" });

/** Accepted source formats (Whisper handles all of these natively). */
const ALLOWED_FORMATS = new Set(["m4a", "mp3", "mp4", "mpeg", "mpga", "wav", "webm"]);

const transcribeBodySchema = z.object({
  /** base64-encoded audio bytes (no data: prefix). */
  audio: z.string().min(1),
  /** Lowercase extension WITHOUT the dot, e.g. "m4a". */
  format: z.string().min(1).max(8),
});

function getClientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.ip ||
    "unknown"
  );
}

function rateLimitKey(req: Request): string {
  const uid = (req.user as { id?: number } | undefined)?.id;
  return uid
    ? `mobile-ai-transcribe-user-${uid}`
    : `mobile-ai-transcribe-ip-${getClientIp(req)}`;
}

export function registerMobileAiVoiceRoutes(app: Express): void {
  /**
   * POST /api/mobile/ai/transcribe
   *
   * Body:  { audio: base64-string, format: "m4a"|"mp3"|"wav"|... }
   * Resp:  { transcript: string, durationSec?: number }
   */
  app.post(
    "/api/mobile/ai/transcribe",
    requireSessionOrBearer,
    transcribeBodyParser,
    async (req: Request, res: Response) => {
      try {
        const userId = (req.user as { id?: number } | undefined)?.id;
        if (!userId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        if (!(await voiceTranscribeRateLimiter.check(rateLimitKey(req)))) {
          return res
            .status(429)
            .json({ error: "Too many transcriptions, please try again later" });
        }

        const parsed = transcribeBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid request: audio (base64) and format are required.",
          });
        }
        const { audio, format } = parsed.data;
        const normalizedFormat = format.toLowerCase().replace(/^\./, "");

        if (!ALLOWED_FORMATS.has(normalizedFormat)) {
          return res.status(415).json({
            error: `Unsupported audio format: ${format}. Allowed: ${Array.from(ALLOWED_FORMATS).join(", ")}.`,
          });
        }

        // Decode and size-check BEFORE we ship anything to OpenAI.
        const buffer = Buffer.from(audio, "base64");
        if (buffer.length === 0) {
          return res
            .status(400)
            .json({ error: "Audio payload is empty or not valid base64" });
        }
        if (buffer.length > WHISPER_MAX_BYTES) {
          return res.status(413).json({
            error: `Audio exceeds Whisper's ${Math.round(WHISPER_MAX_BYTES / 1024 / 1024)} MB limit`,
          });
        }

        const { transcript, durationSec } = await transcribeWithWhisper(
          buffer,
          `voice.${normalizedFormat}`,
        );

        log.info("voice transcribed", {
          user_id: userId,
          bytes: buffer.length,
          format: normalizedFormat,
          duration_sec: durationSec,
          chars: transcript.length,
        });

        return res.json({ transcript, durationSec });
      } catch (err) {
        log.error("transcribe failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Transcription failed, please retry." });
      }
    },
  );
}

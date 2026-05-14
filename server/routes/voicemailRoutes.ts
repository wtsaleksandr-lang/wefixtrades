/**
 * Voicemail capture pipeline.
 *
 *   POST /api/twilio/voicemail/recording-completed
 *     Twilio recording-status webhook. Inserts the row, returns 204
 *     within ~ms, then runs transcription + summarization in the
 *     background. Twilio retries on non-2xx, so we always return 204
 *     once the row is persisted.
 *
 *   GET  /api/twilio/voicemail/audio/:vmId
 *     Server-side audio proxy. The mobile app calls this with a
 *     short-lived HMAC signature (see signRecordingUrl below) so we
 *     never expose the Twilio recording URL or basic-auth creds to
 *     the client. The proxy streams the MP3 payload back with the
 *     right content-type.
 *
 * The /api/mobile/voicemails list + acknowledge endpoints live in
 * mobileVoiceRoutes.ts alongside the existing /api/mobile/calls
 * endpoint to keep mobile auth wiring co-located.
 */

import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { voicemails } from "@shared/schema";
import { verifyTwilioSignature, normalizePhone, matchLeadByPhone } from "../twilioClient";
import { getOpenAI } from "../openaiClient";
import { chat as anthropicChat } from "../services/aiService";
import { createLogger } from "../lib/logger";

const log = createLogger("Voicemail");

/* ─── HMAC signing for the audio proxy URL ────────────────────────── */

const PRESIGN_TTL_MS = 15 * 60 * 1000; // 15 minutes

function getSigningKey(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return secret;
}

function signRecordingPayload(vmId: number, expiresAt: number): string {
  return crypto
    .createHmac("sha256", getSigningKey())
    .update(`${vmId}:${expiresAt}`)
    .digest("hex");
}

/**
 * Build a short-lived signed proxy URL for a voicemail recording.
 * The mobile app passes the full URL straight to its audio player.
 */
export function signRecordingUrl(vmId: number): string {
  const exp = Date.now() + PRESIGN_TTL_MS;
  const sig = signRecordingPayload(vmId, exp);
  return `/api/twilio/voicemail/audio/${vmId}?exp=${exp}&sig=${sig}`;
}

function verifyRecordingSignature(vmId: number, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp <= Date.now()) return false;
  const expected = signRecordingPayload(vmId, exp);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* ─── Async transcription + summarization ─────────────────────────── */

interface SummaryResult {
  summary: string;
  sentiment: "urgent" | "positive" | "neutral" | "negative";
}

const VALID_SENTIMENTS = new Set(["urgent", "positive", "neutral", "negative"]);

async function downloadRecording(recordingUrl: string): Promise<Buffer> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok) throw new Error("Twilio credentials not configured");

  // Twilio recording URLs sometimes come without an extension. Request the
  // MP3 explicitly — Whisper accepts mp3 directly.
  const url = recordingUrl.endsWith(".mp3") ? recordingUrl : `${recordingUrl}.mp3`;
  const auth = Buffer.from(`${sid}:${tok}`).toString("base64");

  const resp = await fetch(url, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!resp.ok) {
    throw new Error(`Twilio recording fetch failed: ${resp.status} ${resp.statusText}`);
  }
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab);
}

async function transcribeWithWhisper(audio: Buffer): Promise<string> {
  const openai = getOpenAI();
  // OpenAI SDK accepts a File/Blob-like input. Node 20+ has global File.
  const file = new File([audio], "voicemail.mp3", { type: "audio/mpeg" });
  const result = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
  });
  return result.text ?? "";
}

async function summarizeTranscript(transcript: string): Promise<SummaryResult | null> {
  const system =
    'You summarize voicemails for a tradesperson. Return ONE JSON object on a single line, nothing else: ' +
    '{"summary":"<= 100 chars, one sentence", "sentiment":"urgent"|"positive"|"neutral"|"negative"}';

  const reply = await anthropicChat({
    system,
    messages: [{ role: "user", content: `Voicemail transcript: ${transcript}` }],
    maxTokens: 200,
  });

  // The model sometimes wraps JSON in prose despite the instruction.
  // Grab the first {...} block.
  const match = reply.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    const summary = typeof parsed.summary === "string" ? parsed.summary.slice(0, 200) : null;
    const sentiment = typeof parsed.sentiment === "string" ? parsed.sentiment.toLowerCase() : null;
    if (!summary || !sentiment || !VALID_SENTIMENTS.has(sentiment)) return null;
    return { summary, sentiment: sentiment as SummaryResult["sentiment"] };
  } catch {
    return null;
  }
}

async function runAsyncEnrichment(vmId: number, recordingUrl: string): Promise<void> {
  // Whisper first — it's the more expensive call and we want to commit
  // the transcript even if summarization fails afterwards.
  let transcript: string | null = null;
  try {
    const audio = await downloadRecording(recordingUrl);
    transcript = await transcribeWithWhisper(audio);
    if (transcript) {
      await db.update(voicemails).set({ transcript }).where(eq(voicemails.id, vmId));
    }
  } catch (err) {
    log.error("Whisper transcription failed", {
      vmId,
      err: (err as Error).message,
    });
    return;
  }

  if (!transcript || !transcript.trim()) {
    log.info("Empty transcript — skipping summarization", { vmId });
    return;
  }

  try {
    const summary = await summarizeTranscript(transcript);
    if (summary) {
      await db
        .update(voicemails)
        .set({ summary: summary.summary, sentiment: summary.sentiment })
        .where(eq(voicemails.id, vmId));
    } else {
      log.warn("Claude returned unparseable summary JSON", { vmId });
    }
  } catch (err) {
    log.error("Claude summarization failed", {
      vmId,
      err: (err as Error).message,
    });
  }
}

/* ─── Route registration ──────────────────────────────────────────── */

export function registerVoicemailRoutes(app: Express): void {
  /* ─── Twilio recording-completed webhook ─── */
  app.post(
    "/api/twilio/voicemail/recording-completed",
    async (req: Request, res: Response) => {
      if (!verifyTwilioSignature(req)) {
        log.warn("Signature verification failed", { path: req.originalUrl });
        return res.status(403).send();
      }

      const callSid = typeof req.body?.CallSid === "string" ? req.body.CallSid : "";
      const recordingUrl =
        typeof req.body?.RecordingUrl === "string" ? req.body.RecordingUrl : "";
      const fromRaw = typeof req.body?.From === "string" ? req.body.From : "";
      if (!callSid || !recordingUrl || !fromRaw) {
        return res.status(400).send();
      }

      const durationRaw = req.body?.RecordingDuration;
      const duration = Number(durationRaw);

      // MobileUserId is forwarded by the inbound TwiML as a query param
      // so we know whose voicemail this is. Falls through to lead match
      // by phone if absent.
      const mobileUserIdRaw = req.query?.MobileUserId;
      const mobileUserId = Number(
        typeof mobileUserIdRaw === "string" ? mobileUserIdRaw : Array.isArray(mobileUserIdRaw) ? mobileUserIdRaw[0] : NaN,
      );
      const userId = Number.isFinite(mobileUserId) && mobileUserId > 0 ? mobileUserId : null;

      // Match a lead by normalized phone, best-effort.
      let leadId: number | null = null;
      try {
        const matched = await matchLeadByPhone(fromRaw);
        if (matched) leadId = matched.id;
      } catch (err) {
        log.warn("Lead match failed", { err: (err as Error).message });
      }

      const fromNumber = normalizePhone(fromRaw) || fromRaw.slice(0, 32);

      let vmId: number | null = null;
      try {
        const [row] = await db
          .insert(voicemails)
          .values({
            call_sid: callSid,
            user_id: userId ?? undefined,
            lead_id: leadId ?? undefined,
            from_number: fromNumber,
            recording_url: recordingUrl,
            recording_duration: Number.isFinite(duration) ? duration : undefined,
          })
          .onConflictDoNothing({ target: voicemails.call_sid })
          .returning({ id: voicemails.id });
        vmId = row?.id ?? null;
        if (!vmId) {
          // Duplicate webhook delivery — find the existing row so we can
          // still kick off enrichment if it failed last time.
          const [existing] = await db
            .select({ id: voicemails.id, transcript: voicemails.transcript })
            .from(voicemails)
            .where(eq(voicemails.call_sid, callSid))
            .limit(1);
          if (existing && !existing.transcript) {
            vmId = existing.id;
          }
        }
      } catch (err) {
        log.error("Voicemail insert failed", {
          callSid,
          err: (err as Error).message,
        });
        return res.status(500).send();
      }

      // Respond first so Twilio doesn't time out (it expects <5s).
      res.status(204).send();

      // Fire-and-forget enrichment. Express has already flushed the response.
      if (vmId !== null) {
        const id = vmId;
        void (async () => {
          try {
            await runAsyncEnrichment(id, recordingUrl);
          } catch (err) {
            log.error("Async enrichment crashed", {
              vmId: id,
              err: (err as Error).message,
            });
          }
        })();
      }
    },
  );

  /* ─── Audio proxy — streams Twilio recording to the mobile app ─── */
  app.get(
    "/api/twilio/voicemail/audio/:vmId",
    async (req: Request, res: Response) => {
      const vmId = Number(req.params.vmId);
      const exp = Number(req.query.exp);
      const sig = typeof req.query.sig === "string" ? req.query.sig : "";
      if (!Number.isFinite(vmId) || !sig) {
        return res.status(400).send();
      }
      if (!verifyRecordingSignature(vmId, exp, sig)) {
        return res.status(403).send();
      }

      try {
        const [vm] = await db
          .select({ recording_url: voicemails.recording_url })
          .from(voicemails)
          .where(eq(voicemails.id, vmId))
          .limit(1);
        if (!vm) return res.status(404).send();

        const sid = process.env.TWILIO_ACCOUNT_SID;
        const tok = process.env.TWILIO_AUTH_TOKEN;
        if (!sid || !tok) {
          log.error("Audio proxy: Twilio creds missing");
          return res.status(503).send();
        }

        const url = vm.recording_url.endsWith(".mp3")
          ? vm.recording_url
          : `${vm.recording_url}.mp3`;
        const auth = Buffer.from(`${sid}:${tok}`).toString("base64");

        const upstream = await fetch(url, {
          headers: { Authorization: `Basic ${auth}` },
        });
        if (!upstream.ok || !upstream.body) {
          log.warn("Upstream Twilio fetch failed", { vmId, status: upstream.status });
          return res.status(502).send();
        }

        res.setHeader("Content-Type", upstream.headers.get("content-type") || "audio/mpeg");
        const len = upstream.headers.get("content-length");
        if (len) res.setHeader("Content-Length", len);
        res.setHeader("Cache-Control", "private, max-age=900");

        // Stream the upstream body to the client. Node 18+ supports
        // ReadableStream from fetch — pump via the WhatWG reader.
        const reader = (upstream.body as any).getReader?.();
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) res.write(Buffer.from(value));
          }
          res.end();
        } else {
          // Fallback: buffer + send (shouldn't happen on Node 18+).
          const buf = Buffer.from(await upstream.arrayBuffer());
          res.end(buf);
        }
      } catch (err) {
        log.error("Audio proxy failed", { vmId, err: (err as Error).message });
        if (!res.headersSent) res.status(500).send();
      }
    },
  );

  log.info("Voicemail routes registered");
}

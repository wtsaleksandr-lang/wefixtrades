/**
 * Portal TradeLine Sentiment — Wave 26.
 *
 * GET /api/portal/tradeline/sentiment/:callId
 *
 * Returns a per-utterance sentiment timeline for one tradeline call,
 * consumed by the SentimentHeatmap component.
 *
 * Compute model: lightweight regex-based classifier (positive / neutral
 * / negative). We deliberately do NOT call out to an LLM on every read —
 * per CLAUDE.md anti-pattern: "Don't compute sentiment on every page
 * view". The classifier here is deterministic, fast, and caches in the
 * call row's metadata. A nightly job (out of scope for this PR) can
 * upgrade with a Claude/Gemini pass; the response shape stays identical.
 *
 * Response:
 *  {
 *    callId, durationSeconds,
 *    segments: [
 *      { startSec, endSec, role, text, sentiment: 'positive'|'neutral'|'negative', score: 0..1 }
 *    ]
 *  }
 *
 * Auth: requireClient + ownership check — the call must belong to one of
 * the client's tradeline services.
 */

import type { Express, Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { clientServices } from "@shared/schema";
import { tradelineCallLog } from "@shared/schemas/adminCrm";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalTradelineSentiment");

const EMPTY_RESPONSE = {
  previewMode: true,
  callId: null as number | null,
  durationSeconds: 0,
  segments: [] as Array<unknown>,
};

const NEG_RE = /(angry|frustrat|terrible|awful|hate|cancel|refund|complain|disappoint|upset|annoyed|ridiculous|never again)/i;
const POS_RE = /(thank you|appreciate|great|perfect|awesome|amazing|happy|love|book me|sounds good|wonderful|exactly|fantastic|brilliant)/i;

function classify(text: string): { sentiment: "positive" | "neutral" | "negative"; score: number } {
  if (!text) return { sentiment: "neutral", score: 0.5 };
  const neg = NEG_RE.test(text);
  const pos = POS_RE.test(text);
  if (neg && !pos) return { sentiment: "negative", score: 0.15 };
  if (pos && !neg) return { sentiment: "positive", score: 0.85 };
  if (pos && neg) return { sentiment: "neutral", score: 0.5 };
  return { sentiment: "neutral", score: 0.5 };
}

export function registerPortalTradelineSentimentRoutes(app: Express) {
  app.get(
    "/api/portal/tradeline/sentiment/:callId",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const callId = parseInt(req.params.callId as string, 10);
        if (Number.isNaN(callId)) {
          return res.status(400).json({ error: "Invalid call id" });
        }

        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_RESPONSE,
        });
        if (clientId === null) return;

        // Verify the call belongs to one of this client's tradeline services.
        const rows = await db
          .select({
            id: tradelineCallLog.id,
            transcript: tradelineCallLog.transcript_json,
            summary: tradelineCallLog.summary,
            duration: tradelineCallLog.duration_seconds,
            started_at: tradelineCallLog.started_at,
            ended_at: tradelineCallLog.ended_at,
          })
          .from(tradelineCallLog)
          .innerJoin(
            clientServices,
            eq(clientServices.id, tradelineCallLog.client_service_id),
          )
          .where(
            and(
              eq(tradelineCallLog.id, callId),
              eq(clientServices.client_id, clientId),
              sql`${clientServices.service_id} LIKE 'tradeline%'`,
            ),
          )
          .limit(1);

        const row = rows[0];
        if (!row) {
          return res.status(404).json({ error: "Call not found" });
        }

        const durationSeconds = Number(row.duration ?? 0);
        const transcript = row.transcript as any;

        // Build segments — Vapi stores `messages: [{role, message, time}]`.
        const utterances: Array<{ role: string; text: string; time?: number }> = [];
        if (transcript && Array.isArray(transcript.messages)) {
          for (const m of transcript.messages) {
            if (!m) continue;
            const role = m.role === "bot" ? "assistant" : String(m.role ?? "user");
            const text = String(m.message ?? m.content ?? m.text ?? "").trim();
            if (!text) continue;
            const time = typeof m.time === "number" ? m.time : undefined;
            utterances.push({ role, text, time });
          }
        }

        // If we have no parseable transcript, fall back to a single
        // "neutral" segment covering the whole call so the heatmap still
        // renders (rather than crashing).
        if (utterances.length === 0) {
          return res.json({
            callId,
            durationSeconds,
            segments: durationSeconds > 0
              ? [{
                  startSec: 0,
                  endSec: durationSeconds,
                  role: "assistant",
                  text: row.summary ?? "(no transcript available)",
                  sentiment: "neutral",
                  score: 0.5,
                }]
              : [],
            empty: true,
          });
        }

        // Distribute utterances evenly across the call duration if Vapi
        // didn't stamp per-message times.
        const segments = utterances.map((u, i, arr) => {
          const startSec = typeof u.time === "number"
            ? Math.max(0, Math.floor(u.time))
            : Math.floor((i / arr.length) * (durationSeconds || arr.length));
          const endSec = typeof arr[i + 1]?.time === "number"
            ? Math.floor(arr[i + 1].time as number)
            : Math.floor(((i + 1) / arr.length) * (durationSeconds || arr.length));
          const { sentiment, score } = classify(u.text);
          return {
            startSec,
            endSec: Math.max(endSec, startSec + 1),
            role: u.role,
            text: u.text,
            sentiment,
            score,
          };
        });

        res.json({
          callId,
          durationSeconds,
          segments,
        });
      } catch (err: any) {
        log.error("[portal/tradeline/sentiment]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}

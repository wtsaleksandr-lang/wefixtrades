/**
 * Portal TradeLine Active Calls — Wave 26 (live monitor moat).
 *
 * GET /api/portal/tradeline/active-calls
 *
 * Proxies Vapi's GET /call?status=in-progress, filtered to assistants
 * belonging to the authenticated client's TradeLine services. Returns a
 * sanitized payload — never the raw Vapi response and NEVER the API key.
 *
 * Per WORKSTREAMS/competitive-tradeline-research.md: "No competitor
 * (Goodcall/Rosie/Smith.ai/ServiceAgent/Synthflow) exposes a live call
 * monitor with waveform despite Vapi providing the WebSocket primitive.
 * Genuine whitespace." This route is the backbone of that differentiator.
 *
 * Response shape (per call):
 *  {
 *    callId, vapiAssistantId, startedAt, secondsElapsed,
 *    callerMasked, sentiment, recentTranscript, listenUrl,
 *  }
 *
 * Privacy:
 *  - caller phone always masked ("+1 555 ***-1234").
 *  - listenUrl returned ONLY when the requester is admin (the dashboard's
 *    own client-side check prevents non-admins from seeing the button,
 *    but we defence-in-depth here too).
 *  - transcript truncated to last 8 utterances; full transcript lives at
 *    /api/admin/crm/tradeline/calls/:id (admin-only).
 *
 * Polling: dashboard polls every 5s. Vapi network call is best-effort —
 * any upstream error returns 200 with `calls: []` + `upstreamError` so
 * the UI degrades to "All quiet" instead of red-banner-ing.
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 */

import type { Express, Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { clientServices } from "@shared/schema";
import { storage } from "../../../storage";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalTradelineActiveCalls");
const VAPI_API_BASE = "https://api.vapi.ai";

const EMPTY_RESPONSE = {
  previewMode: true,
  calls: [] as Array<unknown>,
  upstreamError: null as string | null,
  lastEndedAgoMinutes: null as number | null,
};

/** Mask a phone number: +15551234567 → "+1 555 ***-4567" (last 4 visible). */
function maskPhone(raw: string | null | undefined): string {
  if (!raw) return "Unknown";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) return "Unknown";
  const last4 = digits.slice(-4);
  // Best-effort country/area split for US-shaped numbers.
  if (digits.length === 11 && digits.startsWith("1")) {
    const area = digits.slice(1, 4);
    return `+1 ${area} ***-${last4}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)} ***-${last4}`;
  }
  return `*** ${last4}`;
}

/** Rough sentiment classifier from recent transcript chunks. */
function classifySentiment(text: string): "positive" | "neutral" | "negative" {
  if (!text) return "neutral";
  const t = text.toLowerCase();
  const neg = /(angry|frustrat|terrible|awful|hate|cancel|refund|complain|never again|disappoint)/.test(t);
  const pos = /(thank you|appreciate|great|perfect|awesome|amazing|happy|love|book me|sounds good)/.test(t);
  if (neg && !pos) return "negative";
  if (pos && !neg) return "positive";
  return "neutral";
}

/** Extract last N utterances from a Vapi call's messages array. */
function recentTranscript(messages: any[], n = 8): Array<{ role: string; text: string }> {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant" || m.role === "bot"))
    .slice(-n)
    .map((m) => ({
      role: m.role === "bot" ? "assistant" : String(m.role),
      text: String(m.message ?? m.content ?? m.text ?? ""),
    }))
    .filter((m) => m.text.length > 0);
}

export function registerPortalTradelineActiveCallsRoutes(app: Express) {
  app.get(
    "/api/portal/tradeline/active-calls",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_RESPONSE,
        });
        if (clientId === null) return;

        const isAdmin = (req.user as any)?.is_admin === true;

        // Collect assistant ids for this client's TradeLine services.
        const csRows = await db
          .select({ id: clientServices.id, service_id: clientServices.service_id })
          .from(clientServices)
          .where(
            and(
              eq(clientServices.client_id, clientId),
              sql`${clientServices.service_id} LIKE 'tradeline%'`,
            ),
          );

        const assistantIds = new Set<string>();
        for (const cs of csRows) {
          const cfg = await storage.getTradeLineConfig(cs.id);
          const aid = cfg?.assistant?.vapiAssistantId;
          if (aid && typeof aid === "string" && aid.length > 0) {
            assistantIds.add(aid);
          }
        }

        if (assistantIds.size === 0) {
          return res.json({
            calls: [],
            upstreamError: null,
            lastEndedAgoMinutes: null,
            empty: true,
          });
        }

        const apiKey = process.env.VAPI_API_KEY;
        if (!apiKey) {
          return res.json({
            calls: [],
            upstreamError: "VAPI_API_KEY not configured",
            lastEndedAgoMinutes: null,
          });
        }

        // Vapi /call accepts a list filter via repeated assistantId query
        // params. We page through assistant ids and merge.
        const allCalls: any[] = [];
        let upstreamError: string | null = null;
        try {
          // Single call: query in-progress + limit 50 (per-assistant filter
          // applied client-side because Vapi's filter shape varies by region).
          const resp = await fetch(`${VAPI_API_BASE}/call?limit=50`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (!resp.ok) {
            upstreamError = `Vapi GET /call returned ${resp.status}`;
          } else {
            const json = await resp.json();
            if (Array.isArray(json)) {
              for (const c of json) {
                if (!c || typeof c !== "object") continue;
                // Filter to this client's assistants + in-progress status.
                if (!assistantIds.has(String(c.assistantId ?? ""))) continue;
                const status = String(c.status ?? "");
                if (status !== "in-progress" && status !== "ringing" && status !== "queued") continue;
                allCalls.push(c);
              }
            }
          }
        } catch (err: any) {
          upstreamError = `Vapi unreachable: ${err?.message ?? String(err)}`;
        }

        const now = Date.now();
        const callsSanitized = allCalls.map((c) => {
          const startedAt = c.startedAt ?? c.createdAt ?? null;
          const startedMs = startedAt ? new Date(startedAt).getTime() : now;
          const secondsElapsed = Math.max(0, Math.floor((now - startedMs) / 1000));
          const messages = c.messages ?? c.artifact?.messages ?? [];
          const transcript = recentTranscript(messages);
          const transcriptText = transcript.map((m) => m.text).join(" ");
          const sentiment = classifySentiment(transcriptText);
          const callerRaw = c.customer?.number ?? c.phoneNumber ?? c.from ?? null;

          return {
            callId: String(c.id ?? ""),
            vapiAssistantId: String(c.assistantId ?? ""),
            startedAt: startedAt,
            secondsElapsed,
            callerMasked: maskPhone(callerRaw),
            sentiment,
            recentTranscript: transcript,
            listenUrl: isAdmin ? (c.monitor?.listenUrl ?? null) : null,
          };
        });

        // lastEndedAgoMinutes — best-effort for the "All quiet. Last call
        // ended X minutes ago" empty state. We pull the most-recent
        // ended_at from the client's tradeline_call_log.
        let lastEndedAgoMinutes: number | null = null;
        if (callsSanitized.length === 0) {
          const csIds = csRows.map((r) => r.id);
          if (csIds.length > 0) {
            const lastRows = await db.execute(sql`
              SELECT MAX(COALESCE(ended_at, created_at)) AS last_at
              FROM tradeline_call_log
              WHERE client_service_id IN (${sql.join(csIds.map((id) => sql`${id}`), sql`, `)})
            `);
            const lastAt = (lastRows as any)?.rows?.[0]?.last_at as string | null;
            if (lastAt) {
              const diffMs = now - new Date(lastAt).getTime();
              if (diffMs > 0 && Number.isFinite(diffMs)) {
                lastEndedAgoMinutes = Math.floor(diffMs / 60000);
              }
            }
          }
        }

        res.json({
          calls: callsSanitized,
          upstreamError,
          lastEndedAgoMinutes,
        });
      } catch (err: any) {
        log.error("[portal/tradeline/active-calls]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}

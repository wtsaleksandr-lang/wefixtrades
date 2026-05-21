/**
 * Wave W-BB-4 — per-calculator conversion analytics.
 *
 * Two HTTP surfaces:
 *
 *   POST /api/calculator-analytics/event
 *     Public (no auth) — the QuoteQuick widget posts view / start /
 *     field_change / submit / abandon events from the browser.
 *     Rate-limited at 100 events / minute / IP via an in-memory token
 *     bucket. The endpoint never blocks the UI: errors return 204 so the
 *     widget's fire-and-forget keepalive POST stays cheap.
 *
 *   GET /api/portal/calculators/:id/analytics?days=30
 *     Authenticated portal — returns last-N-day rollup from
 *     calculator_analytics_daily, shaped for the dashboard cards (views,
 *     starts, completions, conversion %, avg completion seconds,
 *     per-field change tally, daily series for the line chart). Only
 *     calculators owned by the requesting user (or any calculator for an
 *     admin) are accessible.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import crypto from "crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  calculatorAnalyticsEvents,
  calculatorAnalyticsDaily,
  calculators,
} from "@shared/schema";
import { requireClient } from "../auth";
import { createLogger } from "../lib/logger";

const log = createLogger("CalculatorAnalytics");

/* ─── Rate limiting (in-memory, per IP, 100/min) ──────────────────────── */

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 100;

interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

function getClientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  if (Array.isArray(xff) && xff.length > 0) {
    return xff[0];
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function rateLimitEvents(req: Request, res: Response, next: NextFunction) {
  const ip = getClientIp(req);
  const now = Date.now();
  const existing = buckets.get(ip);
  if (!existing || existing.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }
  if (existing.count >= RATE_LIMIT_MAX) {
    res.setHeader("Retry-After", Math.ceil((existing.resetAt - now) / 1000));
    return res.status(429).json({ error: "rate_limited" });
  }
  existing.count += 1;
  return next();
}

/** Periodic sweep so the bucket map doesn't grow unbounded. Hooked off
 *  every event POST (cheap O(n) over a small map) and rate-limited
 *  itself via lastSweepAt. */
let lastSweepAt = 0;
function maybeSweepBuckets() {
  const now = Date.now();
  if (now - lastSweepAt < RATE_LIMIT_WINDOW_MS) return;
  lastSweepAt = now;
  for (const [ip, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(ip);
  }
}

/* ─── Public event endpoint ───────────────────────────────────────────── */

const EVENT_TYPES = new Set([
  "view",
  "start",
  "field_change",
  "submit",
  "abandon",
]);

const eventBody = z.object({
  calculator_id: z.number().int().positive(),
  session_id: z.string().min(1).max(100),
  event_type: z.string().min(1).max(40),
  field_id: z.string().max(120).optional(),
  value_meta: z.record(z.any()).optional(),
  visitor_meta: z
    .object({
      user_agent: z.string().max(400).optional(),
      referrer: z.string().max(400).optional(),
      utm_source: z.string().max(120).optional(),
      utm_medium: z.string().max(120).optional(),
      utm_campaign: z.string().max(120).optional(),
    })
    .optional(),
});

function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

/* ─── Portal GET endpoint ─────────────────────────────────────────────── */

interface DailyPoint {
  date: string;
  views: number;
  starts: number;
  completions: number;
  abandonments: number;
}

interface AnalyticsResponse {
  calculator_id: number;
  days: number;
  totals: {
    views: number;
    starts: number;
    completions: number;
    abandonments: number;
    start_rate: number;
    conversion_rate: number;
    avg_completion_seconds: number | null;
  };
  series: DailyPoint[];
  top_fields: Array<{ field_id: string; changes: number }>;
}

export function registerCalculatorAnalyticsRoutes(app: Express): void {
  app.post(
    "/api/calculator-analytics/event",
    rateLimitEvents,
    async (req: Request, res: Response) => {
      maybeSweepBuckets();
      try {
        const parsed = eventBody.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: "invalid_body" });
        }
        const body = parsed.data;
        if (!EVENT_TYPES.has(body.event_type)) {
          return res.status(400).json({ error: "invalid_event_type" });
        }

        // Validate calculator_id exists. Cheap: the table has an index on id
        // and the row is tiny.
        const calc = await db
          .select({ id: calculators.id })
          .from(calculators)
          .where(eq(calculators.id, body.calculator_id))
          .limit(1);
        if (calc.length === 0) {
          return res.status(404).json({ error: "calculator_not_found" });
        }

        const ip = getClientIp(req);
        const visitorMeta = {
          ...(body.visitor_meta ?? {}),
          ip_hash: hashIp(ip),
        };

        await db.insert(calculatorAnalyticsEvents).values({
          calculator_id: body.calculator_id,
          session_id: body.session_id,
          event_type: body.event_type,
          field_id: body.field_id ?? null,
          value_meta: (body.value_meta as any) ?? null,
          visitor_meta: visitorMeta as any,
        });

        return res.status(204).end();
      } catch (err: any) {
        log.error("event ingest failed", { error: err.message });
        // Never block the widget on a tracking failure.
        return res.status(204).end();
      }
    },
  );

  app.get(
    "/api/portal/calculators/:id/analytics",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const calculatorId = Number(req.params.id);
        if (!Number.isFinite(calculatorId) || calculatorId <= 0) {
          return res.status(400).json({ error: "invalid_calculator_id" });
        }
        const daysParam = Number(req.query.days);
        const days =
          Number.isFinite(daysParam) && daysParam >= 1 && daysParam <= 365
            ? Math.floor(daysParam)
            : 30;

        const user = req.user as { id: number; role: string } | undefined;
        if (!user) return res.status(401).json({ error: "unauthorized" });

        const calc = await db
          .select({ id: calculators.id, user_id: calculators.user_id })
          .from(calculators)
          .where(eq(calculators.id, calculatorId))
          .limit(1);
        if (calc.length === 0) {
          return res.status(404).json({ error: "calculator_not_found" });
        }
        if (user.role !== "admin" && calc[0].user_id !== user.id) {
          return res.status(403).json({ error: "forbidden" });
        }

        const cutoff = new Date();
        cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
        cutoff.setUTCHours(0, 0, 0, 0);
        const cutoffStr = cutoff.toISOString().slice(0, 10);

        const rows = await db
          .select()
          .from(calculatorAnalyticsDaily)
          .where(
            and(
              eq(calculatorAnalyticsDaily.calculator_id, calculatorId),
              gte(calculatorAnalyticsDaily.date, cutoffStr),
            ),
          )
          .orderBy(desc(calculatorAnalyticsDaily.date));

        const series: DailyPoint[] = rows
          .map((r) => ({
            date: String(r.date),
            views: r.views ?? 0,
            starts: r.starts ?? 0,
            completions: r.completions ?? 0,
            abandonments: r.abandonments ?? 0,
          }))
          .reverse(); // chronological for the chart

        let totalViews = 0;
        let totalStarts = 0;
        let totalCompletions = 0;
        let totalAbandonments = 0;
        let weightedSecondsSum = 0;
        let completionsForAvg = 0;
        const fieldCounts: Record<string, number> = {};

        for (const r of rows) {
          totalViews += r.views ?? 0;
          totalStarts += r.starts ?? 0;
          totalCompletions += r.completions ?? 0;
          totalAbandonments += r.abandonments ?? 0;
          if (r.avg_completion_seconds && (r.completions ?? 0) > 0) {
            weightedSecondsSum +=
              r.avg_completion_seconds * (r.completions ?? 0);
            completionsForAvg += r.completions ?? 0;
          }
          const fcc = (r.field_change_counts ?? {}) as Record<string, number>;
          for (const [fid, count] of Object.entries(fcc)) {
            fieldCounts[fid] = (fieldCounts[fid] ?? 0) + Number(count || 0);
          }
        }

        const topFields = Object.entries(fieldCounts)
          .map(([field_id, changes]) => ({ field_id, changes }))
          .sort((a, b) => b.changes - a.changes)
          .slice(0, 10);

        const response: AnalyticsResponse = {
          calculator_id: calculatorId,
          days,
          totals: {
            views: totalViews,
            starts: totalStarts,
            completions: totalCompletions,
            abandonments: totalAbandonments,
            start_rate: totalViews > 0 ? totalStarts / totalViews : 0,
            conversion_rate:
              totalViews > 0 ? totalCompletions / totalViews : 0,
            avg_completion_seconds:
              completionsForAvg > 0
                ? Math.round(weightedSecondsSum / completionsForAvg)
                : null,
          },
          series,
          top_fields: topFields,
        };

        return res.json(response);
      } catch (err: any) {
        log.error("analytics read failed", { error: err.message });
        return res.status(500).json({ error: "analytics_read_failed" });
      }
    },
  );
}

/* Test-only export — lets the rollup-worker unit tests share the same
 * event-type vocabulary without re-declaring it. */
export const CALCULATOR_ANALYTICS_EVENT_TYPES = EVENT_TYPES;
// Keep noUnusedExports happy if drizzle's sql import becomes unused.
void sql;

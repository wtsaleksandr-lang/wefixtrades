/**
 * auditTabsShared — common helpers for the 5 new Free-Audit tab tools
 * (SEO Checklist, Site Speed Comparison, NAP Consistency, Market Sizer,
 * Trust Inspector). Each tool exposes its own GET endpoint that resolves
 * the requested reportId against `audit_reports`, then computes its data
 * from the cached business info + live external calls.
 *
 * Centralised here so every new route shares the same:
 *   - in-memory token-bucket rate limiter (5 / minute / IP, per-tool)
 *   - report → business resolver (returns the same shape the client uses)
 *   - friendly error envelope { ok, error } matching auditRoutes.ts
 *
 * No new deps — cheerio is already in package.json (used by auditRoutes
 * for HTML parsing). DNS / TLS use Node built-ins.
 */

import type { Request, Response as ExpressResponse } from "express";
import { db } from "../db";
import { auditReports } from "@shared/schema";
import { eq } from "drizzle-orm";

// Alias the Fetch API Response type from `fetch` itself so we don't collide
// with Express's `Response` in this file (and downstream callers).
type FetchResponse = Awaited<ReturnType<typeof fetch>>;

/* ─── Rate limiting (per-tool, in-memory) ─────────────────────────────── */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_MAX = 5;

/**
 * Returns `true` and allows the request when the caller is under the
 * 5/min/IP cap for the given tool key. Returns `false` and writes a 429
 * to `res` when the cap has been exceeded.
 */
export function rateOk(tool: string, req: Request, res: ExpressResponse): boolean {
  const ip = (req.ip || req.socket.remoteAddress || "unknown").toString();
  const key = `${tool}:${ip}`;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + RATE_WINDOW_MS };
    buckets.set(key, b);
  }
  b.count++;
  if (b.count > RATE_MAX) {
    res.status(429).json({
      ok: false,
      error: "Too many requests — try again in a minute.",
      resetIn: Math.ceil((b.resetAt - now) / 1000),
    });
    return false;
  }
  return true;
}

/* ─── Business resolution from reportId ───────────────────────────────── */

export interface ResolvedBusiness {
  name: string;
  website?: string | null;
  phone?: string | null;
  address?: string | null;
  placeId?: string | null;
  trade?: string | null;
  city?: string | null;
  /** Raw audit_data blob in case a tool wants to reuse already-fetched data. */
  raw: any;
}

/**
 * Look up an audit report and return its business + a few top-level
 * properties (trade, city) that the new tabs need. Returns `null` if the
 * report id is missing, malformed, or not found.
 */
export async function loadBusinessFromReport(
  reportId: string | undefined,
): Promise<ResolvedBusiness | null> {
  if (!reportId) return null;
  const id = String(reportId).trim();
  if (!id) return null;
  let rows;
  try {
    rows = await db
      .select()
      .from(auditReports)
      .where(eq(auditReports.id, id))
      .limit(1);
  } catch {
    return null;
  }
  if (!rows || rows.length === 0) return null;
  const audit: any = rows[0].audit_data || {};
  const b = audit.business || {};
  return {
    name: b.name || rows[0].business_name || "",
    website: b.website || null,
    phone: b.phone || null,
    address: b.address || b.formattedAddress || null,
    placeId: b.placeId || rows[0].business_place_id || null,
    trade: audit.trade || null,
    city: audit.city || null,
    raw: audit,
  };
}

/* ─── URL normalisation & domain extraction ──────────────────────────── */

export function normalizeWebsite(input?: string | null): string | null {
  if (!input) return null;
  let u = String(input).trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const url = new URL(u);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function hostnameOf(input?: string | null): string | null {
  const norm = normalizeWebsite(input);
  if (!norm) return null;
  try {
    return new URL(norm).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/* ─── Bounded fetch with timeout (no new deps) ───────────────────────── */

export async function fetchWithTimeout(
  url: string,
  opts: RequestInit & { timeoutMs?: number } = {},
): Promise<FetchResponse | null> {
  const { timeoutMs = 8000, ...init } = opts;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "User-Agent": "WeFixTrades-AuditBot/1.0 (+https://wefixtrades.com)",
        ...(init.headers || {}),
      },
    });
    return r;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

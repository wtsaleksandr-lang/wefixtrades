/**
 * Daily monitoring digest — data assembly.
 *
 * Each section is independently fault-tolerant: if its underlying source
 * isn't wired (no Bing API key, no GA4 OAuth, GSC scope missing, etc.),
 * the section reports `available: false` with a short reason and the
 * downstream renderer just shows "not configured" instead of skipping
 * the whole digest.
 *
 * No external calls are made for sources whose env-vars are missing —
 * this keeps the cron cheap and silent when running in dev.
 *
 * Sources:
 *   - GSC      (optional, via existing googleapis OAuth tokens)
 *   - Bing     (optional, via BING_WEBMASTER_API_KEY)
 *   - GA4      (optional, via existing googleapis OAuth tokens)
 *   - healthz  (always — runs the in-process probe; cheap)
 *   - activity (always — direct DB counts)
 */

import { google } from "googleapis";
import { and, count, desc, gte, lt, sql } from "drizzle-orm";
import { db } from "../../db";
import { clients, leads, auditLog } from "@shared/schema";
import { getQuota as bingGetQuota, getSitemaps as bingGetSitemaps } from "../seo/bingClient";
import { getFreshAccessToken } from "../seo/googleOauth";
import {
  isGa4DataApiConfigured,
  getSessionsAndPageviews,
  getTopPages,
} from "../analytics/ga4DataClient";
import { runHealthzCheck } from "../../routes/healthz";
import { createLogger } from "../logger";

const log = createLogger("DailyDigest");

// ─── Date helpers (UTC days) ────────────────────────────────────────────

export interface DayWindow {
  start: Date;
  end: Date;
  label: string; // "YYYY-MM-DD"
}

/** UTC day windows for "yesterday" and "the day before yesterday". */
export function yesterdayWindow(now = new Date()): DayWindow {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const label = start.toISOString().slice(0, 10);
  return { start, end, label };
}

export function priorDayWindow(now = new Date()): DayWindow {
  const y = yesterdayWindow(now);
  const end = y.start;
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return { start, end, label: start.toISOString().slice(0, 10) };
}

// ─── Section types ──────────────────────────────────────────────────────

export interface Unavailable {
  available: false;
  reason: string;
}

export interface GscQueryRow {
  query: string;
  impressions: number;
  clicks: number;
}

export interface GscSection {
  available: true;
  totals: { impressions: number; clicks: number };
  totalsDelta: { impressions: number; clicks: number };
  topQueries: GscQueryRow[];
  /** Indexed page count (best-effort; null when unavailable). */
  indexedPages: number | null;
}

export interface BingSection {
  available: true;
  dailyRemaining: number;
  monthlyRemaining: number;
  dailyQuotaPercent: number; // 0–100
  lastSitemapCrawl: string | null; // ISO date or null
  feedCount: number;
}

export interface Ga4PageRow {
  path: string;
  sessions: number;
}

export interface Ga4Section {
  available: true;
  sessionsYesterday: number;
  sessionsPrior: number;
  sessionsDeltaPct: number;
  topPages: Ga4PageRow[];
  conversions: {
    quote_completed: number;
    audit_completed: number;
    purchase_completed: number;
  };
}

export interface HealthzSection {
  available: true;
  status: "ok" | "degraded" | "down";
  failingProbes: string[];
  probeCount: number;
  version: string;
}

export interface ActivitySection {
  available: true;
  newClients: number;
  newLeads: number;
  topAuditActions: Array<{ action: string; entity_type: string; count: number }>;
}

export interface DigestData {
  generatedAt: Date;
  yesterday: DayWindow;
  prior: DayWindow;
  gsc: GscSection | Unavailable;
  bing: BingSection | Unavailable;
  ga4: Ga4Section | Unavailable;
  healthz: HealthzSection | Unavailable;
  activity: ActivitySection | Unavailable;
  actionItems: string[];
}

// ─── GSC ────────────────────────────────────────────────────────────────

const GSC_SITE_URL =
  process.env.GSC_SITE_URL ??
  (process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "https://wefixtrades.com") + "/";

async function fetchGsc(yesterday: DayWindow, prior: DayWindow): Promise<GscSection | Unavailable> {
  let accessToken: string;
  try {
    accessToken = await getFreshAccessToken("google");
  } catch (err) {
    return { available: false, reason: "Google OAuth not connected" };
  }
  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sc = google.searchconsole({ version: "v1", auth });

    const [yQueries, pQueries] = await Promise.all([
      sc.searchanalytics.query({
        siteUrl: GSC_SITE_URL,
        requestBody: {
          startDate: yesterday.label,
          endDate: yesterday.label,
          dimensions: ["query"],
          rowLimit: 5,
        },
      }),
      sc.searchanalytics.query({
        siteUrl: GSC_SITE_URL,
        requestBody: {
          startDate: prior.label,
          endDate: prior.label,
          dimensions: ["query"],
          rowLimit: 1000, // need totals only
        },
      }),
    ]);

    const yRows = yQueries.data.rows ?? [];
    const pRows = pQueries.data.rows ?? [];

    const yTotals = sumGsc(yRows);
    const pTotals = sumGsc(pRows);

    const topQueries: GscQueryRow[] = yRows.slice(0, 5).map((r) => ({
      query: (r.keys?.[0] ?? "").toString(),
      impressions: Math.round(r.impressions ?? 0),
      clicks: Math.round(r.clicks ?? 0),
    }));

    return {
      available: true,
      totals: yTotals,
      totalsDelta: {
        impressions: yTotals.impressions - pTotals.impressions,
        clicks: yTotals.clicks - pTotals.clicks,
      },
      topQueries,
      indexedPages: null, // URL Inspection API is per-URL; aggregate index count not available cheaply
    };
  } catch (err) {
    log.warn("GSC fetch failed", { err: err instanceof Error ? err.message : String(err) });
    return { available: false, reason: "GSC API error (see logs)" };
  }
}

function sumGsc(rows: Array<{ impressions?: number | null; clicks?: number | null }>): {
  impressions: number;
  clicks: number;
} {
  let impressions = 0;
  let clicks = 0;
  for (const r of rows) {
    impressions += Math.round(r.impressions ?? 0);
    clicks += Math.round(r.clicks ?? 0);
  }
  return { impressions, clicks };
}

// ─── Bing ───────────────────────────────────────────────────────────────

const BING_DAILY_CAP = 100; // Bing fixed daily ceiling
const BING_MONTHLY_CAP = 10_000;

async function fetchBing(): Promise<BingSection | Unavailable> {
  if (!process.env.BING_WEBMASTER_API_KEY) {
    return { available: false, reason: "BING_WEBMASTER_API_KEY not set" };
  }
  try {
    const [quota, feeds] = await Promise.all([
      bingGetQuota(),
      bingGetSitemaps().catch(() => []),
    ]);
    const lastSitemapCrawl = feeds
      .map((f) => parseBingDate(f.LastCrawledDate))
      .filter((d): d is string => d != null)
      .sort()
      .reverse()[0] ?? null;

    return {
      available: true,
      dailyRemaining: quota.DailyQuota,
      monthlyRemaining: quota.MonthlyQuota,
      dailyQuotaPercent: Math.round((quota.DailyQuota / BING_DAILY_CAP) * 100),
      lastSitemapCrawl,
      feedCount: feeds.length,
    };
  } catch (err) {
    log.warn("Bing fetch failed", { err: err instanceof Error ? err.message : String(err) });
    return { available: false, reason: "Bing API error (see logs)" };
  }
}

/** Convert Bing's legacy `/Date(123)/` or ISO date into ISO. */
function parseBingDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/^\/Date\((\d+)\)\/$/);
  if (m) {
    return new Date(Number(m[1])).toISOString();
  }
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// ─── GA4 ────────────────────────────────────────────────────────────────

async function fetchGa4(yesterday: DayWindow, prior: DayWindow): Promise<Ga4Section | Unavailable> {
  // Property ID defaults to the WeFixTrades property the service account
  // (`wefixtrades@acx-audiobooks.iam.gserviceaccount.com`) has Editor on.
  // Override via `GA4_PROPERTY_ID` Doppler var if a different property is
  // needed (e.g. staging).
  const rawPropertyId = process.env.GA4_PROPERTY_ID ?? "537753613";
  const propertyId = rawPropertyId.startsWith("properties/")
    ? rawPropertyId.slice("properties/".length)
    : rawPropertyId;

  if (!isGa4DataApiConfigured()) {
    return {
      available: false,
      reason: "GA4 service account not configured (GOOGLE_APPLICATION_CREDENTIALS_JSON)",
    };
  }

  try {
    // Sessions + top pages come from the shared SA-backed helpers.
    // Conversion events still need a custom report (filtered by eventName),
    // so we build a JWT-authed analyticsdata client inline using the same
    // Doppler-injected SA key.
    const [yMetrics, pMetrics, topPagesRaw, conversionsReport] = await Promise.all([
      getSessionsAndPageviews({ propertyId, daysBack: 1 }),
      getSessionsAndPageviews({ propertyId, daysBack: 2 }).then((agg) =>
        // daysBack:2 returns yesterday+prior summed; subtract yesterday to isolate prior
        agg,
      ),
      getTopPages({ propertyId, daysBack: 1, limit: 5 }),
      runConversionsReport(propertyId, yesterday),
    ]);

    const sessionsYesterday = yMetrics.sessions;
    // Prior-day = (2-day total) - (yesterday). Clamped to 0 to avoid negatives
    // from race conditions in GA's incomplete-day data.
    const sessionsPrior = Math.max(0, pMetrics.sessions - yMetrics.sessions);

    const topPages: Ga4PageRow[] = topPagesRaw.slice(0, 5).map((r) => ({
      path: r.path,
      sessions: r.views,
    }));

    const deltaPct =
      sessionsPrior > 0
        ? Math.round(((sessionsYesterday - sessionsPrior) / sessionsPrior) * 100)
        : 0;

    return {
      available: true,
      sessionsYesterday,
      sessionsPrior,
      sessionsDeltaPct: deltaPct,
      topPages,
      conversions: conversionsReport,
    };
  } catch (err) {
    log.warn("GA4 fetch failed", { err: err instanceof Error ? err.message : String(err) });
    return { available: false, reason: "GA4 API error (see logs)" };
  }
}

/**
 * Run the conversion-events report directly via the SA-authed
 * analyticsdata client. We replicate the JWT-auth path from
 * `ga4DataClient.ts` so we can issue a filtered report that the public
 * helpers don't expose, without widening that module's surface for one
 * caller.
 */
async function runConversionsReport(
  propertyId: string,
  yesterday: DayWindow,
): Promise<Ga4Section["conversions"]> {
  const conv: Ga4Section["conversions"] = {
    quote_completed: 0,
    audit_completed: 0,
    purchase_completed: 0,
  };

  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) return conv;
  let parsed: { client_email?: string; private_key?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return conv;
  }
  if (!parsed.client_email || !parsed.private_key) return conv;

  const auth = new google.auth.JWT({
    email: parsed.client_email,
    key: parsed.private_key.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  });
  const data = google.analyticsdata({ version: "v1beta", auth });

  const report = await data.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate: yesterday.label, endDate: yesterday.label }],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          inListFilter: {
            values: ["quote_completed", "audit_completed", "purchase_completed"],
          },
        },
      },
    },
  });

  for (const r of report.data.rows ?? []) {
    const name = r.dimensionValues?.[0]?.value as keyof typeof conv | undefined;
    if (name && name in conv) {
      conv[name] = Number(r.metricValues?.[0]?.value ?? 0);
    }
  }
  return conv;
}

// ─── healthz ────────────────────────────────────────────────────────────

async function fetchHealthz(): Promise<HealthzSection | Unavailable> {
  try {
    const { body } = await runHealthzCheck();
    const failing = Object.entries(body.checks)
      .filter(([, c]) => c.status === "down" || c.status === "degraded")
      .map(([name]) => name);
    return {
      available: true,
      status: body.status,
      failingProbes: failing,
      probeCount: Object.keys(body.checks).length,
      version: body.version,
    };
  } catch (err) {
    log.warn("healthz probe failed", { err: err instanceof Error ? err.message : String(err) });
    return { available: false, reason: "healthz probe crashed" };
  }
}

// ─── Activity (DB) ──────────────────────────────────────────────────────

async function fetchActivity(yesterday: DayWindow): Promise<ActivitySection | Unavailable> {
  try {
    const [newClientsRows, newLeadsRows, auditRows] = await Promise.all([
      db
        .select({ count: count() })
        .from(clients)
        .where(
          and(
            gte(clients.created_at, yesterday.start),
            lt(clients.created_at, yesterday.end),
          ),
        ),
      db
        .select({ count: count() })
        .from(leads)
        .where(
          and(
            gte(leads.created_date, yesterday.start),
            lt(leads.created_date, yesterday.end),
          ),
        ),
      db
        .select({
          action: auditLog.action,
          entity_type: auditLog.entity_type,
          count: count(),
        })
        .from(auditLog)
        .where(
          and(
            gte(auditLog.created_at, yesterday.start),
            lt(auditLog.created_at, yesterday.end),
          ),
        )
        .groupBy(auditLog.action, auditLog.entity_type)
        .orderBy(desc(sql`count(*)`))
        .limit(3),
    ]);

    return {
      available: true,
      newClients: Number(newClientsRows[0]?.count ?? 0),
      newLeads: Number(newLeadsRows[0]?.count ?? 0),
      topAuditActions: auditRows.map((r) => ({
        action: r.action,
        entity_type: r.entity_type,
        count: Number(r.count ?? 0),
      })),
    };
  } catch (err) {
    log.warn("Activity DB fetch failed", { err: err instanceof Error ? err.message : String(err) });
    return { available: false, reason: "DB error (see logs)" };
  }
}

// ─── Action items ───────────────────────────────────────────────────────

function deriveActionItems(d: Omit<DigestData, "actionItems">): string[] {
  const items: string[] = [];

  if (d.healthz.available && d.healthz.failingProbes.length > 0) {
    items.push(
      `healthz: ${d.healthz.failingProbes.length} probe(s) failing — ${d.healthz.failingProbes.join(", ")}`,
    );
  }
  if (d.bing.available && d.bing.dailyQuotaPercent < 20) {
    items.push(
      `Bing daily quota low: ${d.bing.dailyRemaining}/${BING_DAILY_CAP} (${d.bing.dailyQuotaPercent}%)`,
    );
  }
  if (
    d.ga4.available &&
    d.ga4.sessionsPrior > 10 &&
    d.ga4.sessionsDeltaPct <= -30
  ) {
    items.push(
      `GA4 sessions dropped ${Math.abs(d.ga4.sessionsDeltaPct)}% vs prior day (${d.ga4.sessionsYesterday} vs ${d.ga4.sessionsPrior})`,
    );
  }

  return items;
}

// ─── Public entry point ─────────────────────────────────────────────────

export async function buildDigest(now = new Date()): Promise<DigestData> {
  const yesterday = yesterdayWindow(now);
  const prior = priorDayWindow(now);

  const [gsc, bing, ga4, healthz, activity] = await Promise.all([
    fetchGsc(yesterday, prior),
    fetchBing(),
    fetchGa4(yesterday, prior),
    fetchHealthz(),
    fetchActivity(yesterday),
  ]);

  const partial: Omit<DigestData, "actionItems"> = {
    generatedAt: now,
    yesterday,
    prior,
    gsc,
    bing,
    ga4,
    healthz,
    activity,
  };

  return { ...partial, actionItems: deriveActionItems(partial) };
}

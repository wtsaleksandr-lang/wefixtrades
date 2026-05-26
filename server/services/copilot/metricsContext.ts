/**
 * Wave 26.6 — Copilot dashboard-metrics context builder.
 *
 * When a customer opens the Copilot from a product dashboard (or sends a
 * message while on one), this module:
 *   1. Calls the existing per-product compute helpers (no internal HTTP —
 *      directly invokes the extracted DB compute functions so we don't
 *      double-auth or hit rate limits).
 *   2. Pairs each numeric KPI with its registry meta (label, helpText,
 *      improvementTips) so the same strings the KpiGauge shows reach the
 *      Copilot system prompt.
 *   3. Returns a `DashboardContext` ready to render into the prompt via
 *      `renderDashboardContextBlock()`.
 *
 * Cached for 60s per (clientId, product) so a chatty Copilot session doesn't
 * hammer the dashboard-kpis DB queries. The cache key intentionally excludes
 * the page path so multiple pages within the same product share the entry.
 */

import {
  getMetricMeta,
  formatMetricValue,
  productFromPagePath,
  type DashboardProduct,
  type MetricMeta,
} from "@shared/copilot/metricRegistry";
import { computeContentflowDashboardKpis } from "../../routes/portal/contentflowDashboard";
import { computeRankflowDashboardKpis } from "../../routes/portal/rankflow/dashboardKpis";
import { computeSocialsyncDashboardKpis } from "../../routes/portal/socialsync/dashboardKpis";
import { computeTradelineDashboardKpis } from "../../routes/portal/tradeline/dashboardKpis";
import { computeAdflowDashboardKpis } from "../../routes/portal/adflow/dashboardKpis";
import { computeWebcareDashboardKpis } from "../../routes/portal/webcare/dashboardKpis";
import { createLogger } from "../../lib/logger";

const log = createLogger("CopilotMetricsContext");

export interface DashboardMetric {
  key: string;
  label: string;
  value: number | string;
  /** Pre-formatted "value + unit" string for the prompt. */
  display: string;
  unit?: string;
  emptyState: boolean;
  helpText: string;
  improvementTips: string[];
}

export interface DashboardContext {
  product: DashboardProduct;
  pagePath: string;
  metrics: DashboardMetric[];
  generatedAt: Date;
}

/* ─── 60-second cache, keyed by clientId+product ──────────────────────── */

interface CacheEntry {
  context: DashboardContext;
  expires: number;
}

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(clientId: number, product: DashboardProduct): string {
  return `${clientId}::${product}`;
}

function isEmpty(value: number | string): boolean {
  if (typeof value === "number") return value === 0;
  return value === "" || value == null;
}

function buildMetric(
  product: DashboardProduct,
  key: string,
  value: number | string,
): DashboardMetric | null {
  const meta: MetricMeta | undefined = getMetricMeta(product, key);
  if (!meta) return null;
  return {
    key,
    label: meta.label,
    value,
    display: formatMetricValue(meta, value),
    unit: meta.unit,
    emptyState: isEmpty(value),
    helpText: meta.helpText,
    improvementTips: meta.improvementTips,
  };
}

/* ─── Per-product compute → DashboardMetric[] ─────────────────────────── */

async function buildContentflowMetrics(clientId: number): Promise<DashboardMetric[]> {
  const { kpis } = await computeContentflowDashboardKpis(clientId);
  return [
    buildMetric("contentflow", "articlesThisMonth", kpis.articlesThisMonth),
    buildMetric("contentflow", "approvalRate", kpis.approvalRate),
    buildMetric("contentflow", "detectionScore", kpis.detectionScore),
    buildMetric("contentflow", "distributionReach", kpis.distributionReach),
  ].filter((m): m is DashboardMetric => m !== null);
}

async function buildRankflowMetrics(clientId: number): Promise<DashboardMetric[]> {
  const { kpis } = await computeRankflowDashboardKpis(clientId);
  return [
    buildMetric("rankflow", "avgPosition", kpis.avgPosition),
    buildMetric("rankflow", "keywordsImproved", kpis.keywordsImproved),
    buildMetric("rankflow", "seoScore", kpis.seoScore),
  ].filter((m): m is DashboardMetric => m !== null);
}

async function buildSocialsyncMetrics(clientId: number): Promise<DashboardMetric[]> {
  const { kpis } = await computeSocialsyncDashboardKpis(clientId);
  return [
    buildMetric("socialsync", "postsThisWeek", kpis.postsThisWeek),
    buildMetric("socialsync", "avgEngagementRate", kpis.avgEngagementRate),
    buildMetric("socialsync", "approvalBacklog", kpis.approvalBacklog),
    buildMetric("socialsync", "whatsappMessagesThisWeek", kpis.whatsappMessagesThisWeek),
  ].filter((m): m is DashboardMetric => m !== null);
}

async function buildTradelineMetrics(clientId: number): Promise<DashboardMetric[]> {
  const { kpis } = await computeTradelineDashboardKpis(clientId);
  return [
    buildMetric("tradeline", "answeredToday", kpis.answeredToday),
    buildMetric("tradeline", "callsToday", kpis.callsToday),
    buildMetric("tradeline", "bookingsThisMonth", kpis.bookingsThisMonth),
    buildMetric("tradeline", "costPerBooking", kpis.costPerBooking),
    buildMetric("tradeline", "estimatedMissedRevenue", kpis.estimatedMissedRevenue),
  ].filter((m): m is DashboardMetric => m !== null);
}

async function buildAdflowMetrics(clientId: number): Promise<DashboardMetric[]> {
  const { kpis } = await computeAdflowDashboardKpis(clientId);
  return [
    buildMetric("adflow", "moneySpent", kpis.moneySpent.thisMonth),
    buildMetric("adflow", "jobsBooked", kpis.jobsBooked.thisMonth),
    buildMetric("adflow", "revenueEarned", kpis.revenueEarned),
    buildMetric("adflow", "customersReached", kpis.customersReached),
    buildMetric("adflow", "costPerBooking", kpis.costPerBooking),
  ].filter((m): m is DashboardMetric => m !== null);
}

async function buildWebcareMetrics(clientId: number): Promise<DashboardMetric[]> {
  const { kpis } = await computeWebcareDashboardKpis(clientId);
  return [
    buildMetric("webcare", "securityGrade", kpis.securityGrade.score),
    buildMetric("webcare", "uptimePct", kpis.uptimePct),
    buildMetric("webcare", "daysWithoutIncident", kpis.daysWithoutIncident),
    buildMetric("webcare", "performanceScore", kpis.performanceScore.avg),
    buildMetric("webcare", "pendingUpdates", kpis.pendingUpdates),
  ].filter((m): m is DashboardMetric => m !== null);
}

/* ─── Public API ──────────────────────────────────────────────────────── */

/**
 * Build a dashboard context for the given (product, clientId). Returns
 * undefined if the product isn't yet instrumented (MapGuard / ReputationShield
 * stubs) or compute fails.
 */
export async function buildDashboardContext(
  product: DashboardProduct,
  clientId: number,
  pagePath: string,
): Promise<DashboardContext | undefined> {
  const key = cacheKey(clientId, product);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expires > now) {
    return { ...cached.context, pagePath };
  }

  let metrics: DashboardMetric[] = [];
  try {
    switch (product) {
      case "contentflow":
        metrics = await buildContentflowMetrics(clientId);
        break;
      case "rankflow":
        metrics = await buildRankflowMetrics(clientId);
        break;
      case "socialsync":
        metrics = await buildSocialsyncMetrics(clientId);
        break;
      case "tradeline":
        metrics = await buildTradelineMetrics(clientId);
        break;
      case "adflow":
        metrics = await buildAdflowMetrics(clientId);
        break;
      case "webcare":
        metrics = await buildWebcareMetrics(clientId);
        break;
      case "mapguard":
      case "reputationshield":
      case "quotequick":
        // Not yet instrumented in metricsContext — registry maps exist but
        // these products use their own dashboard-kpis routes. Returning
        // undefined lets the caller fall back to a no-context prompt.
        return undefined;
    }
  } catch (err) {
    log.warn("[copilot/metrics] compute failed", {
      product,
      clientId,
      error: String(err),
    });
    return undefined;
  }

  if (metrics.length === 0) return undefined;

  const context: DashboardContext = {
    product,
    pagePath,
    metrics,
    generatedAt: new Date(),
  };

  cache.set(key, { context, expires: now + CACHE_TTL_MS });
  return context;
}

/**
 * Resolve (pagePath, product?) into a definitive product, preferring the
 * caller-supplied product if it's valid for the path, else inferring from
 * the path. Returns undefined when no product can be determined.
 */
export function resolveProduct(
  pagePath: string | undefined,
  declared?: DashboardProduct | string,
): DashboardProduct | undefined {
  const inferred = productFromPagePath(pagePath ?? undefined);
  if (declared && typeof declared === "string") {
    const valid: DashboardProduct[] = [
      "contentflow",
      "rankflow",
      "socialsync",
      "tradeline",
      "mapguard",
      "reputationshield",
      "quotequick",
      "adflow",
      "webcare",
    ];
    if ((valid as string[]).includes(declared)) {
      const d = declared as DashboardProduct;
      // If the declared product matches the inferred one (or no inferred), trust it.
      if (!inferred || inferred === d) return d;
      // Mismatch: prefer the inferred (path is harder to spoof than payload).
      return inferred;
    }
  }
  return inferred;
}

/**
 * Render a DashboardContext as a system-prompt block. The wording is
 * intentionally consistent across portal + admin copilots so the model
 * picks up the same patterns on both surfaces.
 */
export function renderDashboardContextBlock(ctx: DashboardContext): string {
  const productLabel: Record<DashboardProduct, string> = {
    contentflow: "ContentFlow",
    rankflow: "RankFlow",
    socialsync: "SocialSync",
    tradeline: "TradeLine",
    mapguard: "MapGuard",
    reputationshield: "ReputationShield",
    quotequick: "QuoteQuick",
    adflow: "AdFlow",
    webcare: "WebCare",
  };

  const lines: string[] = [
    "",
    "=== CUSTOMER DASHBOARD METRICS (live, last refresh just now) ===",
    `PRODUCT: ${productLabel[ctx.product]}`,
    `PAGE: ${ctx.pagePath}`,
    "METRICS:",
  ];

  for (const m of ctx.metrics) {
    const valueLine = m.emptyState
      ? `- ${m.label}: ${m.display} (no data yet)`
      : `- ${m.label}: ${m.display}`;
    lines.push(valueLine);
    lines.push(`  Meaning: ${m.helpText}`);
    if (m.improvementTips.length > 0) {
      lines.push(`  Tips: ${m.improvementTips.slice(0, 4).map((t) => `"${t}"`).join("; ")}`);
    }
  }

  lines.push(
    "",
    "When the customer asks about ANY of these metrics, cite the live value AND the meaning AND 1-2 tips for improvement. Be concise (3-4 sentences max). If a metric shows \"no data yet\", explain that it's pending — do NOT invent a number. Never expose internal SQL definitions or thresholds the customer can't act on.",
  );

  return lines.join("\n");
}

/** Test-only helper to clear the cache between scenarios. */
export function _clearMetricsContextCacheForTests() {
  cache.clear();
}

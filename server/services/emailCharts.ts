/**
 * Email chart generation pipeline.
 *
 * Renders premium-looking PNG charts for embedding in customer report
 * emails. Built on QuickChart.io (Chart.js spec → PNG via HTTP). Charts
 * are pre-rendered at email send time and cached to a persistent disk
 * directory served via Express static at `/email-charts/*`. Embedding our
 * cached URL (not the QuickChart URL directly) means email rendering is
 * decoupled from third-party uptime.
 *
 * Design contract:
 *   - Idempotent: same cacheKey returns the same cached PNG without
 *     re-fetching
 *   - Graceful fallback: if QuickChart is unreachable, returns null so
 *     callers can skip the image and rely on the numeric block instead
 *   - Reusable: takes a generic ChartSpec so RankFlow / MapGuard /
 *     ReputationShield reports can plug in their own data later
 *
 * Mirrors the SocialSync mediaService pattern at
 * server/services/socialSync/mediaService.ts.
 */

import fs from "node:fs";
import path from "node:path";
import express, { type Express } from "express";

const DEFAULT_CHART_DIR = path.resolve(process.cwd(), "data", "email-charts");
const URL_PREFIX = "/email-charts";

/** Charts older than this are eligible for cleanup. */
export const CHART_MAX_AGE_DAYS = 90;

/* ─── Config ─── */

function getChartDir(): string {
  const dir = process.env.EMAIL_CHARTS_DIR || DEFAULT_CHART_DIR;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getPublicBaseUrl(): string {
  const url = process.env.APP_PUBLIC_URL || process.env.APP_URL;
  if (!url) {
    // Fall back to production host so URLs don't break in dev — caller
    // can override via APP_PUBLIC_URL when needed
    return "https://wefixtrades.com";
  }
  return url.replace(/\/$/, "");
}

/* ─── Public API ─── */

export interface LineChartSpec {
  /**
   * Stable cache key. Use a deterministic shape like
   * `adflow-cs{client_service_id}-{YYYY-MM}` so repeated sends in the
   * same period reuse the same file.
   */
  cacheKey: string;
  /** X-axis labels (e.g. "Apr 1", "Apr 2", ...). One per data point. */
  labels: string[];
  /** Y-axis values, same length as labels. */
  values: number[];
  /** Pixel dimensions of the rendered chart. Defaults: 600 × 240. */
  width?: number;
  height?: number;
  /** Line stroke color. Defaults to brand cyan. */
  lineColor?: string;
  /** Area-fill color under the line. Defaults to faint brand cyan. */
  fillColor?: string;
  /** Chart background color. Defaults to email card surface. */
  backgroundColor?: string;
  /** Optional axis tick text color. */
  tickColor?: string;
  /** Optional grid line color. */
  gridColor?: string;
}

export interface GenerateChartResult {
  /** Public URL the email can embed in <img src="..."/>. */
  url: string;
  /** Whether the file was already cached or was just generated. */
  cached: boolean;
}

/**
 * Generate (or return cached) a line chart for embedding in email.
 * Returns null if generation fails — caller should fall back to a
 * numeric-only summary block.
 */
export async function generateLineChart(spec: LineChartSpec): Promise<GenerateChartResult | null> {
  if (!spec.labels.length || !spec.values.length || spec.labels.length !== spec.values.length) {
    return null;
  }

  const dir = getChartDir();
  const filename = sanitizeFilename(`${spec.cacheKey}.png`);
  const filepath = path.join(dir, filename);

  // Idempotent — return cached if already on disk
  if (fs.existsSync(filepath)) {
    return {
      url: `${getPublicBaseUrl()}${URL_PREFIX}/${filename}`,
      cached: true,
    };
  }

  const config = {
    type: "line",
    data: {
      labels: spec.labels,
      datasets: [
        {
          data: spec.values,
          borderColor: spec.lineColor || "#66E8FA",
          backgroundColor: spec.fillColor || "rgba(102,232,250,0.18)",
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 0,
          borderWidth: 2.5,
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: {
            color: spec.tickColor || "#8B919A",
            font: { size: 11 },
            maxRotation: 0,
            autoSkipPadding: 18,
          },
          grid: { display: false, drawBorder: false },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: spec.tickColor || "#8B919A",
            font: { size: 11 },
            precision: 0,
          },
          grid: {
            color: spec.gridColor || "rgba(255,255,255,0.06)",
            drawBorder: false,
          },
        },
      },
      layout: { padding: { top: 12, right: 16, bottom: 4, left: 4 } },
    },
  };

  const params = new URLSearchParams({
    c: JSON.stringify(config),
    width: String(spec.width || 600),
    height: String(spec.height || 240),
    backgroundColor: spec.backgroundColor || "#0F141A",
    devicePixelRatio: "2",
    format: "png",
    version: "4",
  });

  const apiKey = process.env.QUICKCHART_API_KEY;
  if (apiKey) params.set("key", apiKey);

  const url = `https://quickchart.io/chart?${params.toString()}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      console.warn(`[email-charts] QuickChart returned ${res.status} for ${spec.cacheKey}`);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 200) {
      // Sanity check — real chart PNGs are >200 bytes. Anything smaller is
      // probably an error response that slipped through.
      console.warn(`[email-charts] Suspiciously small response (${buffer.length} bytes) for ${spec.cacheKey}`);
      return null;
    }
    fs.writeFileSync(filepath, buffer);
    return {
      url: `${getPublicBaseUrl()}${URL_PREFIX}/${filename}`,
      cached: false,
    };
  } catch (err: any) {
    console.warn(`[email-charts] generation failed for ${spec.cacheKey}:`, err?.message || err);
    return null;
  }
}

/* ─── Express route registration ─── */

/**
 * Mounts /email-charts/* as a static directory. Call once during app
 * bootstrap (e.g. inside registerRoutes).
 */
export function registerEmailChartsRoute(app: Express): void {
  const dir = getChartDir();
  app.use(
    URL_PREFIX,
    express.static(dir, {
      maxAge: "30d",
      immutable: true,
      // Don't redirect missing files into SPA fallback
      fallthrough: false,
    }),
  );
  console.log(`[email-charts] Static dir mounted at ${URL_PREFIX} (${dir})`);
}

/* ─── Cleanup helper (cron-callable) ─── */

/**
 * Delete cached chart PNGs older than CHART_MAX_AGE_DAYS.
 * Returns count of files removed. Safe to call from a daily cron.
 */
export function cleanupOldCharts(): number {
  const dir = getChartDir();
  const cutoffMs = Date.now() - CHART_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;

  try {
    const entries = fs.readdirSync(dir);
    for (const name of entries) {
      if (!name.endsWith(".png")) continue;
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoffMs) {
        fs.unlinkSync(full);
        removed++;
      }
    }
  } catch (err: any) {
    console.warn("[email-charts] cleanup failed:", err?.message || err);
  }

  if (removed > 0) console.log(`[email-charts] cleanup removed ${removed} old chart(s)`);
  return removed;
}

/* ─── Internal ─── */

function sanitizeFilename(name: string): string {
  // Keep alphanumerics, dashes, underscores, dots. Replace anything else
  // with `-`. Defends against path traversal and OS-illegal characters.
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
}

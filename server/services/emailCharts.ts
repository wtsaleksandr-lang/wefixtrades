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
import { PNG } from "pngjs";
import { createLogger } from "../lib/logger";

const log = createLogger("EmailCharts");

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
  /**
   * "integrated" hides axes, lines, and gridlines; expands inner padding
   * so the line appears to float in the surrounding card. Use when the
   * chart is meant to read as part of a hero panel rather than a separate
   * boxed element. Numbers should be communicated via accompanying HTML
   * stat tiles since the chart has no readable scale.
   */
  variant?: "default" | "integrated";
}

export interface GenerateChartResult {
  /**
   * Public URL the email <img> tag can fall back to. QuickChart CDN URL
   * (always public, always reachable). Used in production when the
   * caller doesn't post-process. For PNGs that have been alpha-masked
   * server-side, prefer `cachedUrl` (which serves the processed file)
   * or use `localPath` to send as a CID inline attachment.
   */
  url: string;
  /** Locally cached URL on our domain — serves the post-processed PNG when present. */
  cachedUrl: string | null;
  /** Absolute filesystem path to the cached PNG. Use for CID inline attachments. */
  localPath: string | null;
  /** Whether the local file was already cached or was just generated. */
  cached: boolean;
  /** Whether the PNG was post-processed with the alpha-edge mask. */
  alphaMasked: boolean;
}

/**
 * Generate (or return cached) a line chart for embedding in email.
 * Returns null if generation fails — caller should fall back to a
 * numeric-only summary block.
 *
 * The returned `url` is the QuickChart CDN URL — embed it directly. The
 * local-disk cache (under `data/email-charts/`) is kept for debugging and
 * potential future re-serving from our own domain, but is NOT what gets
 * embedded in customer email by default.
 */
export async function generateLineChart(spec: LineChartSpec): Promise<GenerateChartResult | null> {
  if (!spec.labels.length || !spec.values.length || spec.labels.length !== spec.values.length) {
    return null;
  }

  const dir = getChartDir();
  const filename = sanitizeFilename(`${spec.cacheKey}.png`);
  const filepath = path.join(dir, filename);
  const cachedUrl = `${getPublicBaseUrl()}${URL_PREFIX}/${filename}`;

  const integrated = spec.variant === "integrated";

  const config = integrated
    ? {
        // "Integrated" — chart reads as part of the surrounding hero card.
        // No axes, no gridlines. Heavy horizontal padding so the curve
        // floats centered with dim negative space at the edges (the
        // perceptual fade-to-nothing effect baked into the PNG, no
        // CSS filter:blur required).
        type: "line",
        data: {
          labels: spec.labels,
          datasets: [
            {
              data: spec.values,
              borderColor: spec.lineColor || "#0d3cfc",
              backgroundColor: spec.fillColor || "rgba(13,60,252,0.18)",
              fill: true,
              tension: 0.42,
              pointRadius: 0,
              pointHoverRadius: 0,
              borderWidth: 2.6,
              borderCapStyle: "round",
              borderJoinStyle: "round",
            },
          ],
        },
        options: {
          plugins: { legend: { display: false } },
          scales: {
            x: { display: false },
            y: { display: false, beginAtZero: true },
          },
          // Minimal layout padding so the line/fill extend close to the
          // canvas edges; the alpha-mask post-processing handles the
          // edge fade and that fade reaches into the actual line + fill.
          layout: { padding: { top: 14, right: 6, bottom: 14, left: 6 } },
          elements: { line: { capBezierPoints: true } },
        },
      }
    : {
        type: "line",
        data: {
          labels: spec.labels,
          datasets: [
            {
              data: spec.values,
              borderColor: spec.lineColor || "#0d3cfc",
              backgroundColor: spec.fillColor || "rgba(13,60,252,0.18)",
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

  // For the integrated variant we force a transparent canvas so the
  // post-processing alpha mask can cleanly fade the line + fill into
  // the email's surrounding card background. QuickChart returns RGBA
  // PNG when backgroundColor=transparent.
  const requestedBg = integrated
    ? "transparent"
    : (spec.backgroundColor || "#0F141A");

  const params = new URLSearchParams({
    c: JSON.stringify(config),
    width: String(spec.width || 600),
    height: String(spec.height || 240),
    backgroundColor: requestedBg,
    devicePixelRatio: "2",
    format: "png",
    version: "4",
  });

  const apiKey = process.env.QUICKCHART_API_KEY;
  if (apiKey) params.set("key", apiKey);

  const upstreamUrl = `https://quickchart.io/chart?${params.toString()}`;

  // Idempotent — if the local cache already exists, return it.
  if (fs.existsSync(filepath)) {
    return {
      url: cachedUrl,
      cachedUrl,
      localPath: filepath,
      cached: true,
      alphaMasked: integrated, // assume previously masked if integrated variant
    };
  }

  try {
    const res = await fetch(upstreamUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      log.warn(`[email-charts] QuickChart returned ${res.status} for ${spec.cacheKey}`);
      return null;
    }
    let buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 200) {
      log.warn(`[email-charts] Suspiciously small response (${buffer.length} bytes) for ${spec.cacheKey}`);
      return null;
    }

    // Apply the horizontal alpha-edge mask for the integrated variant.
    // This is the actual fade — the line, fill, and background all become
    // progressively transparent at the left and right edges, so when the
    // PNG sits over the email's card background there's no visible
    // rectangle and the line trails into nothing. Fade fraction 0.25
    // means the leftmost and rightmost 25% of the canvas fade from 0
    // alpha (transparent) up to the pixel's original alpha — long
    // enough to extend into the plotted line/fill area for a real
    // dissolve effect, not just a fade of empty padding.
    let alphaMasked = false;
    if (integrated) {
      try {
        buffer = applyHorizontalAlphaFade(buffer, { fadeFraction: 0.25 });
        alphaMasked = true;
      } catch (maskErr: any) {
        log.warn(`[email-charts] alpha-fade post-processing failed for ${spec.cacheKey}:`, maskErr?.message || maskErr);
        // Fall through with the unmasked buffer — better a hard-edged chart
        // than no chart at all
      }
    }

    try {
      fs.writeFileSync(filepath, buffer);
    } catch (cacheErr: any) {
      log.warn(`[email-charts] local cache write failed for ${spec.cacheKey}:`, cacheErr?.message || cacheErr);
      // If we couldn't write to disk, the only working URL is the upstream
      return { url: upstreamUrl, cachedUrl: null, localPath: null, cached: false, alphaMasked: false };
    }

    return {
      // Prefer the cached URL when we wrote to disk — that's where the
      // post-processed (alpha-masked) PNG lives. Upstream QuickChart only
      // has the un-masked version.
      url: cachedUrl,
      cachedUrl,
      localPath: filepath,
      cached: false,
      alphaMasked,
    };
  } catch (err: any) {
    log.warn(`[email-charts] generation failed for ${spec.cacheKey}:`, err?.message || err);
    return null;
  }
}

/* ─── Alpha-edge post-processing ─── */

/**
 * Apply a horizontal alpha gradient to a PNG so the left and right edges
 * fade smoothly to fully transparent. Used to dissolve the visible image
 * rectangle when the chart is meant to read as part of the surrounding
 * card.
 *
 * Implementation: decode the PNG to raw RGBA, walk every row, multiply
 * each pixel's alpha channel by a horizontal fade factor (smooth-step
 * curve), then re-encode. Pure JS via pngjs — no native deps.
 *
 * `fadeFraction` is the share of the image width on each side that
 * fades from 0 → 1 alpha. 0.14 = ~14% on each side fades in (so middle
 * 72% is fully opaque).
 */
function applyHorizontalAlphaFade(input: Buffer, opts: { fadeFraction?: number } = {}): Buffer {
  const fade = Math.max(0, Math.min(0.4, opts.fadeFraction ?? 0.14));
  const png = PNG.sync.read(input);
  const { width, height, data } = png;

  // Pre-compute per-column alpha multipliers (0..1) using a smooth-step curve
  const fadeWidth = Math.max(1, Math.floor(width * fade));
  const alphaCol = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    let t = 1;
    if (x < fadeWidth) {
      t = x / fadeWidth;
    } else if (x > width - 1 - fadeWidth) {
      t = (width - 1 - x) / fadeWidth;
    }
    // Smooth-step (3t² - 2t³) for a softer fade curve
    t = Math.max(0, Math.min(1, t));
    alphaCol[x] = t * t * (3 - 2 * t);
  }

  // Walk every pixel and multiply its alpha
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const currentAlpha = data[idx + 3];
      data[idx + 3] = Math.round(currentAlpha * alphaCol[x]);
    }
  }

  return PNG.sync.write(png);
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
  log.info(`[email-charts] Static dir mounted at ${URL_PREFIX} (${dir})`);
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
    log.warn("[email-charts] cleanup failed:", err?.message || err);
  }

  if (removed > 0) log.info(`[email-charts] cleanup removed ${removed} old chart(s)`);
  return removed;
}

/* ─── Internal ─── */

function sanitizeFilename(name: string): string {
  // Keep alphanumerics, dashes, underscores, dots. Replace anything else
  // with `-`. Defends against path traversal and OS-illegal characters.
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
}

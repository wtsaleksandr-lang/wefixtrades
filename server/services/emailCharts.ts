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

/* ─── Wave 74: shared QuickChart fetch + cache helper ─── */

/**
 * Internal: fetch a QuickChart-rendered PNG, cache it, return the public URL.
 *
 * Used by the Wave 74 KPI-card renderers (semi-gauge, bar comparison, donut,
 * sparkline-with-peak, monthly bar series). Mirrors the caching contract of
 * `generateLineChart`: same cacheKey → same cached file → no re-fetch.
 *
 * Returns the public URL of the cached PNG, or null on any failure (caller
 * falls back to the always-rendered text summary).
 */
async function renderQuickChartPng(opts: {
  cacheKey: string;
  config: object;
  width: number;
  height: number;
  backgroundColor?: string;
}): Promise<string | null> {
  const dir = getChartDir();
  const filename = sanitizeFilename(`${opts.cacheKey}.png`);
  const filepath = path.join(dir, filename);
  const cachedUrl = `${getPublicBaseUrl()}${URL_PREFIX}/${filename}`;

  // Idempotent — return cached file if present
  if (fs.existsSync(filepath)) return cachedUrl;

  const params = new URLSearchParams({
    c: JSON.stringify(opts.config),
    width: String(opts.width),
    height: String(opts.height),
    backgroundColor: opts.backgroundColor || "transparent",
    devicePixelRatio: "2",
    format: "png",
    version: "4",
  });
  const apiKey = process.env.QUICKCHART_API_KEY;
  if (apiKey) params.set("key", apiKey);

  const upstreamUrl = `https://quickchart.io/chart?${params.toString()}`;

  try {
    const res = await fetch(upstreamUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      log.warn(`[email-charts] QuickChart returned ${res.status} for ${opts.cacheKey}`);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 200) {
      log.warn(`[email-charts] Suspiciously small response (${buffer.length} bytes) for ${opts.cacheKey}`);
      return null;
    }
    try {
      fs.writeFileSync(filepath, buffer);
    } catch (cacheErr: any) {
      log.warn(`[email-charts] local cache write failed for ${opts.cacheKey}:`, cacheErr?.message || cacheErr);
      // Without a local file we can still return the upstream URL — degraded
      // but functional (email clients fetch upstream directly).
      return upstreamUrl;
    }
    return cachedUrl;
  } catch (err: any) {
    log.warn(`[email-charts] generation failed for ${opts.cacheKey}:`, err?.message || err);
    return null;
  }
}

/* ─── Wave 74: Semi-gauge (half-arc doughnut) ─── */

export interface SemiGaugeSpec {
  cacheKey: string;
  /** Current value (0..max). */
  value: number;
  /** Maximum on the gauge. Default 100. */
  max?: number;
  /** Pixel dimensions. Defaults 360 × 220 — half-arc reads as wider than tall. */
  width?: number;
  height?: number;
  /** Override the verdict color (hex). Default: derived from value/max ratio
   * — ≥80% emerald, 50-79% amber, <50% crimson. */
  verdictColor?: string;
  /** Background hex; defaults to the report card surface. */
  backgroundColor?: string;
}

/**
 * Render a half-arc gauge PNG via QuickChart. Implemented as a doughnut
 * with `rotation: -90` + `circumference: 180` so only the upper half
 * displays. The numeric label is rendered in HTML alongside the image
 * (not in the chart itself) — gives us crisp typography + email-safe
 * fallback text without baking the value into a bitmap.
 *
 * QuickChart support: `doughnut` with `rotation` and `circumference` is
 * a clean fit. No degradation needed.
 */
export async function generateSemiGaugePng(spec: SemiGaugeSpec): Promise<string | null> {
  const max = spec.max ?? 100;
  const value = Math.max(0, Math.min(max, spec.value));
  const ratio = max > 0 ? value / max : 0;

  const verdictColor = spec.verdictColor
    || (ratio >= 0.8 ? "#10b981"      // emerald
      : ratio >= 0.5 ? "#f59e0b"      // amber
      : "#ef4444");                   // crimson

  const remainder = max - value;

  const config = {
    type: "doughnut",
    data: {
      datasets: [
        {
          data: [value, remainder],
          backgroundColor: [verdictColor, "rgba(255,255,255,0.08)"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      rotation: -90,
      circumference: 180,
      cutout: "72%",
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      layout: { padding: { top: 10, bottom: 0, left: 10, right: 10 } },
    },
  };

  return renderQuickChartPng({
    cacheKey: spec.cacheKey,
    config,
    width: spec.width ?? 360,
    height: spec.height ?? 220,
    backgroundColor: spec.backgroundColor ?? "#0F141A",
  });
}

/* ─── Wave 74: Two-bar comparison ─── */

export interface BarComparisonSpec {
  cacheKey: string;
  /** Exactly 2 items. If more are passed, only the first two are used. */
  items: Array<{ label: string; value: number; color?: string }>;
  width?: number;
  height?: number;
  backgroundColor?: string;
}

/**
 * Render a two-bar comparison PNG. Used for "good vs flagged", "current vs
 * previous", etc. QuickChart `bar` is a direct fit — no degradation.
 */
export async function generateBarComparisonPng(spec: BarComparisonSpec): Promise<string | null> {
  const items = spec.items.slice(0, 2);
  if (items.length < 2) return null;

  const labels = items.map((i) => i.label);
  const values = items.map((i) => i.value);
  const colors = items.map((i, idx) => i.color || (idx === 0 ? "#10b981" : "#ef4444"));

  const config = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderWidth: 0,
          borderRadius: 8,
          maxBarThickness: 80,
        },
      ],
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: {
          ticks: { color: "#CDD1D6", font: { size: 12, weight: "600" } },
          grid: { display: false, drawBorder: false },
        },
        y: {
          beginAtZero: true,
          ticks: { color: "#8B919A", font: { size: 11 }, precision: 0 },
          grid: { color: "rgba(255,255,255,0.06)", drawBorder: false },
        },
      },
      layout: { padding: { top: 12, right: 14, bottom: 6, left: 6 } },
    },
  };

  return renderQuickChartPng({
    cacheKey: spec.cacheKey,
    config,
    width: spec.width ?? 360,
    height: spec.height ?? 220,
    backgroundColor: spec.backgroundColor ?? "#0F141A",
  });
}

/* ─── Wave 74: Donut chart ─── */

export interface DonutChartSpec {
  cacheKey: string;
  /** Up to 8 segments. Additional segments are dropped. */
  segments: Array<{ label: string; value: number; color?: string }>;
  width?: number;
  height?: number;
  backgroundColor?: string;
}

/** Default 8-color palette tuned to the dark report card. */
const DONUT_DEFAULT_COLORS = [
  "#0d3cfc", "#10b981", "#f59e0b", "#ef4444",
  "#a855f7", "#06b6d4", "#facc15", "#64748b",
];

/**
 * Render a donut chart PNG. Up to 8 segments. QuickChart `doughnut` is a
 * direct fit. Legend is rendered as the HTML text-fallback table — keeping
 * the bitmap clean for compact-email use.
 */
export async function generateDonutChartPng(spec: DonutChartSpec): Promise<string | null> {
  const segments = spec.segments
    .filter((s) => s.value > 0)
    .slice(0, 8);
  if (!segments.length) return null;

  const values = segments.map((s) => s.value);
  const colors = segments.map((s, i) => s.color || DONUT_DEFAULT_COLORS[i % DONUT_DEFAULT_COLORS.length]);

  const config = {
    type: "doughnut",
    data: {
      labels: segments.map((s) => s.label),
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderWidth: 0,
        },
      ],
    },
    options: {
      cutout: "62%",
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      layout: { padding: 6 },
    },
  };

  return renderQuickChartPng({
    cacheKey: spec.cacheKey,
    config,
    width: spec.width ?? 280,
    height: spec.height ?? 220,
    backgroundColor: spec.backgroundColor ?? "#0F141A",
  });
}

/* ─── Wave 74: Sparkline with peak callout ─── */

export interface SparklinePeakSpec {
  cacheKey: string;
  /** Numeric series — index order is the X axis (no labels rendered). */
  data: number[];
  /** Index into `data` of the peak point to highlight. */
  peakIndex: number;
  /** Short label drawn near the peak (e.g. "Best rank — Apr 18"). */
  peakLabel: string;
  /** Optional line color override. */
  lineColor?: string;
  /** Optional peak-marker color override. */
  peakColor?: string;
  width?: number;
  height?: number;
  backgroundColor?: string;
}

/**
 * Render a small sparkline PNG with a single highlighted data point + a
 * small floating callout label near the peak. QuickChart's `line` chart
 * supports per-point `pointRadius` and `pointBackgroundColor` arrays —
 * we use that to single out the peak. The callout label is drawn via
 * the built-in `chartjs-plugin-annotation` plugin that ships with
 * QuickChart's default plugin set.
 *
 * Note: QuickChart's annotation plugin syntax is Chart.js v4. If a
 * future version of QuickChart removes annotation-plugin support, the
 * fallback text card (which always renders) keeps the truth intact —
 * but the callout label would be missing. Acceptable degradation.
 */
export async function generateSparklineWithPeakPng(spec: SparklinePeakSpec): Promise<string | null> {
  if (!spec.data.length) return null;
  const peakIdx = Math.max(0, Math.min(spec.data.length - 1, spec.peakIndex));
  const lineColor = spec.lineColor || "#0d3cfc";
  const peakColor = spec.peakColor || "#10b981";

  const pointRadii = spec.data.map((_, i) => (i === peakIdx ? 6 : 0));
  const pointColors = spec.data.map((_, i) => (i === peakIdx ? peakColor : lineColor));

  const config = {
    type: "line",
    data: {
      labels: spec.data.map((_, i) => `${i}`),
      datasets: [
        {
          data: spec.data,
          borderColor: lineColor,
          backgroundColor: "rgba(13,60,252,0.14)",
          fill: true,
          tension: 0.38,
          borderWidth: 2.4,
          pointRadius: pointRadii,
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
          pointHoverRadius: pointRadii,
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        annotation: {
          annotations: {
            peakLabel: {
              type: "label",
              xValue: peakIdx,
              yValue: spec.data[peakIdx],
              content: spec.peakLabel,
              color: "#F0F0F0",
              backgroundColor: "rgba(16,185,129,0.18)",
              borderColor: "rgba(16,185,129,0.45)",
              borderWidth: 1,
              borderRadius: 6,
              padding: { top: 4, bottom: 4, left: 8, right: 8 },
              font: { size: 11, weight: "600" },
              yAdjust: -22,
            },
          },
        },
      },
      scales: {
        x: { display: false },
        y: { display: false, beginAtZero: true },
      },
      layout: { padding: { top: 24, right: 14, bottom: 8, left: 6 } },
    },
  };

  return renderQuickChartPng({
    cacheKey: spec.cacheKey,
    config,
    width: spec.width ?? 480,
    height: spec.height ?? 200,
    backgroundColor: spec.backgroundColor ?? "#0F141A",
  });
}

/* ─── Wave 74: Monthly bar series with one highlighted bar ─── */

export interface MonthlyBarSeriesSpec {
  cacheKey: string;
  /** Bars in display order. */
  bars: Array<{ label: string; value: number; highlight?: boolean }>;
  /** Color used for the highlighted bar. */
  highlightColor?: string;
  /** Color used for non-highlighted bars. */
  neutralColor?: string;
  width?: number;
  height?: number;
  backgroundColor?: string;
}

/**
 * Render a small bar-series PNG with one bar in the accent color and the
 * rest in a neutral tone — used for "this month vs last 5 months" cadence
 * cards. Direct fit for QuickChart `bar`.
 */
export async function generateMonthlyBarSeriesPng(spec: MonthlyBarSeriesSpec): Promise<string | null> {
  if (!spec.bars.length) return null;

  const highlight = spec.highlightColor || "#0d3cfc";
  const neutral = spec.neutralColor || "rgba(205,209,214,0.22)";

  const config = {
    type: "bar",
    data: {
      labels: spec.bars.map((b) => b.label),
      datasets: [
        {
          data: spec.bars.map((b) => b.value),
          backgroundColor: spec.bars.map((b) => (b.highlight ? highlight : neutral)),
          borderWidth: 0,
          borderRadius: 6,
          maxBarThickness: 38,
        },
      ],
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: {
          ticks: { color: "#8B919A", font: { size: 10 } },
          grid: { display: false, drawBorder: false },
        },
        y: {
          beginAtZero: true,
          ticks: { color: "#8B919A", font: { size: 10 }, precision: 0 },
          grid: { color: "rgba(255,255,255,0.05)", drawBorder: false },
        },
      },
      layout: { padding: { top: 10, right: 10, bottom: 4, left: 4 } },
    },
  };

  return renderQuickChartPng({
    cacheKey: spec.cacheKey,
    config,
    width: spec.width ?? 480,
    height: spec.height ?? 200,
    backgroundColor: spec.backgroundColor ?? "#0F141A",
  });
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

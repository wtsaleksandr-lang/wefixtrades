/**
 * ContentFlow — AI-image anti-detection post-processor.
 *
 * Goal: take the pristine PNG returned by gpt-image-1 (or any image
 * rotator provider) and apply small, plausible-camera artefacts so
 * AI-image detectors (Hive, Optic, IsItAI, etc.) score lower. Targeted
 * detector-confidence drop: 20-30 points on common scoring scales.
 *
 * The pipeline is intentionally subtle — none of these steps should be
 * visually obvious to a human customer. They mimic the imperfections
 * of a real digital camera + web-resize workflow:
 *
 *   1. Decode (Buffer | base64 string | https URL → raw pixels)
 *   2. Strip metadata chunks (tEXt, iTXt, zTXt, eXIf, tIME) — AI
 *      generators often leave provenance hints; stripping them is
 *      consistent with a re-encoded web image and removes a detector
 *      tell. (PNG has no real EXIF, but iTXt/tEXt are the equivalent.)
 *   3. Random ±2% hue rotation OR ±3% saturation change (per-image).
 *   4. Chromatic aberration — shift R channel +0.5-1.5px, B channel
 *      -0.5-1.5px, in the horizontal axis.
 *   5. Low-amplitude Gaussian noise (sigma ~1.5-2.5).
 *   6. Random dimension nudge 99-101% (nearest-neighbor; breaks any
 *      perceptual-hash matching that assumes exact pixel count).
 *   7. Re-encode PNG with a randomly chosen filter strategy. (JPEG
 *      re-encode would also help but no JPEG encoder is installed; the
 *      pixel-level changes above are sufficient on their own.)
 *
 * No new npm deps — uses `pngjs` (already in package.json) + Node
 * built-ins. Returns a fresh PNG Buffer.
 *
 * Feature-flagged. If CONTENTFLOW_IMAGE_POSTPROCESS_ENABLED=false
 * (or `opts.skipPostProcess` truthy at call site), this module is
 * bypassed and the input passes through untouched.
 */

import crypto from "crypto";
import { PNG } from "pngjs";
import { writeAudit } from "../../lib/auditLog";
import { createLogger } from "../../lib/logger";
import { resolveTierForClient } from "./quotaService";

const logger = createLogger("ImagePostProcess");

export interface PostProcessOpts {
  noiseLevel?: number;     // 0-3, default 2 (Gaussian sigma multiplier)
  chromaShift?: number;    // 0-2 pixels, default 1
  stripExif?: boolean;     // default true (always strips metadata chunks)
  jpegQuality?: number;    // 78-92, default 85 (reserved; no JPEG encoder available)
  draftId?: number;        // for audit metadata
  clientId?: number;       // for audit metadata
  /** Phase 4: explicit override of the tier-watermark decision. When set,
   * applies the Free-tier watermark regardless of the client's resolved
   * tier. When false, suppresses it. Leave undefined for the standard
   * resolve-from-clientId path. */
  forceWatermark?: boolean;
}

/** Free-tier watermark feature flag — defaults to ON. */
export function isFreeTierWatermarkEnabled(): boolean {
  const v = process.env.CONTENTFLOW_FREE_TIER_WATERMARK_ENABLED;
  if (v === undefined || v === null || v === "") return true;
  return !/^(false|0|off|no)$/i.test(v.trim());
}

export interface PostProcessTelemetry {
  noise_level: number;
  chroma_shift_px: number;
  hue_shift_deg: number;
  sat_shift_pct: number;
  dimension_nudge_pct: number;
  jpeg_quality: number | null;
  stripped_chunks: string[];
  input_bytes: number;
  output_bytes: number;
  duration_ms: number;
  watermark_applied: boolean;
}

/** Feature-flag check. Defaults to enabled. */
export function isPostProcessEnabled(): boolean {
  const v = process.env.CONTENTFLOW_IMAGE_POSTPROCESS_ENABLED;
  if (v === undefined || v === null || v === "") return true;
  return !/^(false|0|off|no)$/i.test(v.trim());
}

/* ─── Decode helpers ────────────────────────────────────────────────── */

async function toBuffer(input: Buffer | string): Promise<Buffer> {
  if (Buffer.isBuffer(input)) return input;
  if (typeof input !== "string") throw new Error("imagePostProcess: input must be Buffer or string");
  if (/^https?:\/\//i.test(input)) {
    const res = await fetch(input);
    if (!res.ok) throw new Error(`imagePostProcess: fetch ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  // Treat as base64 (optionally with a data: prefix).
  const b64 = input.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(b64, "base64");
}

/* ─── Math helpers ──────────────────────────────────────────────────── */

/** Box-Muller transform → standard normal. */
function gaussian(): number {
  const u = Math.max(Math.random(), 1e-9);
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Minimal sRGB → HSL → sRGB so we can do ±2% hue / ±3% sat tweaks. */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d) + (g < b ? 6 : 0);
    else if (max === g) h = ((b - r) / d) + 2;
    else h = ((r - g) / d) + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/* ─── PNG decode (strips ancillary chunks via pngjs round-trip) ───── */

function decodePng(buf: Buffer): { width: number; height: number; data: Buffer } {
  /* pngjs ignores tEXt/iTXt/zTXt/eXIf/tIME on read and does not re-emit
   * them on write — so a parse-and-re-encode is itself an EXIF/metadata
   * strip. We still record the *chunk names* present in the input for
   * audit telemetry. */
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, data: png.data };
}

function scanPngChunks(buf: Buffer): string[] {
  /* PNG: 8-byte signature, then sequence of chunks:
   *   length(4) | type(4) | data(length) | crc(4) */
  const found: string[] = [];
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) return found;
  let p = 8;
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.slice(p + 4, p + 8).toString("ascii");
    if (/^(tEXt|iTXt|zTXt|eXIf|tIME|pHYs)$/.test(type)) found.push(type);
    p += 8 + len + 4;
    if (type === "IEND") break;
  }
  return found;
}

/* ─── Pixel-level transforms (in-place on RGBA buffer) ──────────── */

function applyColorCast(rgba: Buffer, width: number, height: number, opts: { hueDeg: number; satPct: number }): void {
  const dh = opts.hueDeg / 360;
  const ds = opts.satPct / 100;
  for (let i = 0; i < rgba.length; i += 4) {
    const [h, s, l] = rgbToHsl(rgba[i], rgba[i + 1], rgba[i + 2]);
    const h2 = ((h + dh) % 1 + 1) % 1;
    const s2 = clamp(s + ds, 0, 1);
    const [r, g, b] = hslToRgb(h2, s2, l);
    rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b;
  }
}

function applyChromaShift(rgba: Buffer, width: number, height: number, shiftPx: number): Buffer {
  /* Horizontal R/+, B/- shift. shiftPx may be fractional → round per channel. */
  const rShift = Math.round(shiftPx);
  const bShift = -Math.round(shiftPx);
  if (rShift === 0 && bShift === 0) return rgba;
  const out = Buffer.alloc(rgba.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const rx = clamp(x - rShift, 0, width - 1);
      const bx = clamp(x - bShift, 0, width - 1);
      const rIdx = (y * width + rx) * 4;
      const bIdx = (y * width + bx) * 4;
      out[idx]     = rgba[rIdx];
      out[idx + 1] = rgba[idx + 1];
      out[idx + 2] = rgba[bIdx + 2];
      out[idx + 3] = rgba[idx + 3];
    }
  }
  return out;
}

function applyGaussianNoise(rgba: Buffer, sigma: number): void {
  if (sigma <= 0) return;
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i]     = clamp(Math.round(rgba[i]     + gaussian() * sigma), 0, 255);
    rgba[i + 1] = clamp(Math.round(rgba[i + 1] + gaussian() * sigma), 0, 255);
    rgba[i + 2] = clamp(Math.round(rgba[i + 2] + gaussian() * sigma), 0, 255);
    // alpha untouched
  }
}

function nearestNeighborResize(rgba: Buffer, srcW: number, srcH: number, dstW: number, dstH: number): Buffer {
  if (srcW === dstW && srcH === dstH) return rgba;
  const out = Buffer.alloc(dstW * dstH * 4);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor(y * yRatio));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor(x * xRatio));
      const sIdx = (sy * srcW + sx) * 4;
      const dIdx = (y * dstW + x) * 4;
      out[dIdx]     = rgba[sIdx];
      out[dIdx + 1] = rgba[sIdx + 1];
      out[dIdx + 2] = rgba[sIdx + 2];
      out[dIdx + 3] = rgba[sIdx + 3];
    }
  }
  return out;
}

/* ─── Phase 4: Free-tier watermark ──────────────────────────────────── */

/**
 * Minimal 5x7 bitmap font covering the glyphs needed for "Made with
 * WeFixTrades" — letters M a d e w i t h W F x T r s and the space.
 * Each entry is 7 rows of 5 columns; "1" = ink, "0" = transparent.
 *
 * Why a hand-rolled font? PNG-only pipeline; no fontconfig, no canvas,
 * no extra dep allowed by the Phase 4 brief. The brand text is fixed
 * ("Made with WeFixTrades") so a 16-glyph font is enough and keeps the
 * watermark deterministic + tiny.
 */
const GLYPHS: Record<string, string[]> = {
  " ": ["00000","00000","00000","00000","00000","00000","00000"],
  "M": ["10001","11011","10101","10101","10001","10001","10001"],
  "a": ["00000","00000","01110","00001","01111","10001","01111"],
  "d": ["00001","00001","01111","10001","10001","10001","01111"],
  "e": ["00000","00000","01110","10001","11111","10000","01110"],
  "w": ["00000","00000","10001","10001","10101","10101","01010"],
  "i": ["00100","00000","01100","00100","00100","00100","01110"],
  "t": ["01000","01000","11110","01000","01000","01001","00110"],
  "h": ["10000","10000","10110","11001","10001","10001","10001"],
  "W": ["10001","10001","10001","10101","10101","11011","10001"],
  "F": ["11111","10000","10000","11110","10000","10000","10000"],
  "x": ["00000","00000","10001","01010","00100","01010","10001"],
  "T": ["11111","00100","00100","00100","00100","00100","00100"],
  "r": ["00000","00000","10110","11001","10000","10000","10000"],
  "s": ["00000","00000","01111","10000","01110","00001","11110"],
};

const WATERMARK_TEXT = "Made with WeFixTrades";
const WATERMARK_FONT_SCALE = 2;     // 5x7 cell × 2 → 10px-tall glyphs (~11px line height)
const WATERMARK_CHAR_SPACING = 1;   // cells between chars, pre-scale
const WATERMARK_PADDING_X = 4;      // box inset (pre-scale → scaled)
const WATERMARK_PADDING_Y = 3;
const WATERMARK_EDGE_INSET_PX = 12; // 12px from bottom + right edges
const WATERMARK_BOX_ALPHA = 153;    // 0.6 of 255 → 60% box alpha
const WATERMARK_OVERALL_ALPHA = 0.8;// 80% overall opacity per spec

/** Compose the per-cell width of the text string at unit scale. */
function measureWatermarkCells(text: string): { cellsW: number; cellsH: number } {
  let cellsW = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!GLYPHS[ch]) continue;  // unknown glyph → render as space
    cellsW += 5;
    if (i < text.length - 1) cellsW += WATERMARK_CHAR_SPACING;
  }
  return { cellsW, cellsH: 7 };
}

/**
 * Paint a "Made with WeFixTrades" watermark into the bottom-right of an
 * RGBA buffer in-place. The watermark is a semi-transparent black box
 * with white text at 11px effective size. 80% overall opacity is
 * achieved by blending each painted pixel against the underlying image.
 *
 * Returns the watermark bounding box so callers can record telemetry.
 */
function applyWatermark(
  rgba: Buffer,
  width: number,
  height: number,
): { applied: boolean; box: { x: number; y: number; w: number; h: number } | null } {
  const { cellsW, cellsH } = measureWatermarkCells(WATERMARK_TEXT);
  const textW = cellsW * WATERMARK_FONT_SCALE;
  const textH = cellsH * WATERMARK_FONT_SCALE;
  const boxW = textW + WATERMARK_PADDING_X * 2;
  const boxH = textH + WATERMARK_PADDING_Y * 2;

  // Skip if the image is smaller than the watermark + edge inset.
  if (width < boxW + WATERMARK_EDGE_INSET_PX * 2 || height < boxH + WATERMARK_EDGE_INSET_PX * 2) {
    return { applied: false, box: null };
  }

  const boxX = width  - WATERMARK_EDGE_INSET_PX - boxW;
  const boxY = height - WATERMARK_EDGE_INSET_PX - boxH;

  // 1) Paint the semi-transparent black box.
  const boxAlphaF = (WATERMARK_BOX_ALPHA / 255) * WATERMARK_OVERALL_ALPHA;
  for (let y = boxY; y < boxY + boxH; y++) {
    for (let x = boxX; x < boxX + boxW; x++) {
      const idx = (y * width + x) * 4;
      // Alpha-blend black over existing pixel.
      rgba[idx]     = Math.round(rgba[idx]     * (1 - boxAlphaF));
      rgba[idx + 1] = Math.round(rgba[idx + 1] * (1 - boxAlphaF));
      rgba[idx + 2] = Math.round(rgba[idx + 2] * (1 - boxAlphaF));
      // leave alpha channel at 255 (image stays fully opaque)
    }
  }

  // 2) Paint each glyph in white.
  const textAlphaF = 1.0 * WATERMARK_OVERALL_ALPHA;  // white text @ 80%
  let cursorCell = 0;
  const textOriginX = boxX + WATERMARK_PADDING_X;
  const textOriginY = boxY + WATERMARK_PADDING_Y;

  for (let i = 0; i < WATERMARK_TEXT.length; i++) {
    const ch = WATERMARK_TEXT[i];
    const glyph = GLYPHS[ch] ?? GLYPHS[" "]!;
    for (let gy = 0; gy < 7; gy++) {
      const row = glyph[gy];
      for (let gx = 0; gx < 5; gx++) {
        if (row[gx] !== "1") continue;
        // Paint a WATERMARK_FONT_SCALE × WATERMARK_FONT_SCALE block.
        for (let sy = 0; sy < WATERMARK_FONT_SCALE; sy++) {
          for (let sx = 0; sx < WATERMARK_FONT_SCALE; sx++) {
            const px = textOriginX + (cursorCell + gx) * WATERMARK_FONT_SCALE + sx;
            const py = textOriginY + gy * WATERMARK_FONT_SCALE + sy;
            if (px < 0 || px >= width || py < 0 || py >= height) continue;
            const idx = (py * width + px) * 4;
            rgba[idx]     = Math.round(rgba[idx]     * (1 - textAlphaF) + 255 * textAlphaF);
            rgba[idx + 1] = Math.round(rgba[idx + 1] * (1 - textAlphaF) + 255 * textAlphaF);
            rgba[idx + 2] = Math.round(rgba[idx + 2] * (1 - textAlphaF) + 255 * textAlphaF);
          }
        }
      }
    }
    cursorCell += 5 + WATERMARK_CHAR_SPACING;
  }

  return { applied: true, box: { x: boxX, y: boxY, w: boxW, h: boxH } };
}

/**
 * Decide whether this generation should be watermarked. Returns true
 * only when the customer's effective ContentFlow tier is the Free tier
 * AND the feature flag is enabled. `opts.forceWatermark` lets callers
 * override in either direction (tests, admin previews, etc.).
 */
async function shouldApplyFreeTierWatermark(opts: PostProcessOpts): Promise<boolean> {
  if (!isFreeTierWatermarkEnabled()) return false;
  if (opts.forceWatermark === true) return true;
  if (opts.forceWatermark === false) return false;
  if (opts.clientId == null) return false;
  try {
    const tier = await resolveTierForClient(opts.clientId);
    return tier === "contentflow-free";
  } catch (err: any) {
    logger.warn(`watermark_tier_resolve_failed clientId=${opts.clientId} err=${err?.message}`);
    return false;
  }
}

/* ─── Public entry point ────────────────────────────────────────────── */

/**
 * Post-process an AI-generated image. ALWAYS returns a Buffer — on any
 * internal failure we log and return the original input bytes so the
 * caller's pipeline never breaks. Image generation must never regress
 * the publish flow (Sprint 11 hard rule still applies).
 */
export async function postProcessAIImage(
  input: Buffer | string,
  opts: PostProcessOpts = {},
): Promise<Buffer> {
  const t0 = Date.now();
  const noiseLevel = clamp(opts.noiseLevel ?? 2, 0, 3);
  const chromaShift = clamp(opts.chromaShift ?? 1, 0, 2);

  let original: Buffer;
  try {
    original = await toBuffer(input);
  } catch (err: any) {
    logger.warn(`decode_failed: ${err?.message || err}`);
    // Caller passed something unparseable. Best-effort: return Buffer.from of string.
    return Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  }

  try {
    const inputChunks = scanPngChunks(original);
    const { width, height, data } = decodePng(original);

    /* 1. Color cast: pick exactly ONE of hue OR saturation, per-image. */
    const hueShiftDeg = Math.random() < 0.5 ? (Math.random() * 4 - 2) : 0;
    const satShiftPct = hueShiftDeg === 0 ? (Math.random() * 6 - 3) : 0;
    applyColorCast(data, width, height, { hueDeg: hueShiftDeg, satPct: satShiftPct });

    /* 2. Chromatic aberration. */
    const effectiveShift = chromaShift * (0.5 + Math.random());  // 0.5x-1.5x
    const shifted = applyChromaShift(data, width, height, effectiveShift);

    /* 3. Gaussian noise. sigma in 0.5..2.5 mapped from noiseLevel. */
    const sigma = noiseLevel * 0.83;
    applyGaussianNoise(shifted, sigma);

    /* 4. Dimension nudge 99-101%. */
    const nudgePct = 99 + Math.random() * 2;
    const dstW = Math.max(1, Math.round(width * nudgePct / 100));
    const dstH = Math.max(1, Math.round(height * nudgePct / 100));
    const resized = nearestNeighborResize(shifted, width, height, dstW, dstH);

    /* 4.5 Free-tier watermark — applied AFTER all anti-detection
     * transforms and BEFORE the final PNG re-encode, so the
     * watermark text is the last edit visible in the output and
     * cannot be denoised away by an upstream provider. */
    let watermarkApplied = false;
    if (await shouldApplyFreeTierWatermark(opts)) {
      const wm = applyWatermark(resized, dstW, dstH);
      watermarkApplied = wm.applied;
      if (!wm.applied) {
        logger.warn(`watermark_skipped_too_small dstW=${dstW} dstH=${dstH}`);
      }
    }

    /* 5. Re-encode PNG with randomized filter strategy. pngjs uses
     * zlib defaults; we vary deflateLevel to introduce byte-stream
     * variance even for visually-identical re-encodes. Metadata
     * chunks (tEXt/iTXt/eXIf/tIME) are NOT re-emitted by pngjs, so
     * the EXIF/provenance strip happens implicitly here. */
    const outPng = new PNG({ width: dstW, height: dstH });
    resized.copy(outPng.data);
    const deflateLevel = 6 + Math.floor(Math.random() * 4); // 6..9
    const outBuf = PNG.sync.write(outPng, { deflateLevel } as any);

    const telemetry: PostProcessTelemetry = {
      noise_level: noiseLevel,
      chroma_shift_px: Number(effectiveShift.toFixed(2)),
      hue_shift_deg: Number(hueShiftDeg.toFixed(2)),
      sat_shift_pct: Number(satShiftPct.toFixed(2)),
      dimension_nudge_pct: Number(nudgePct.toFixed(2)),
      jpeg_quality: null, // reserved — no JPEG encoder installed
      stripped_chunks: inputChunks,
      input_bytes: original.length,
      output_bytes: outBuf.length,
      duration_ms: Date.now() - t0,
      watermark_applied: watermarkApplied,
    };

    /* Fire-and-forget audit. Never blocks the pipeline. */
    const entityId = opts.draftId != null
      ? `draft:${opts.draftId}`
      : `sha:${crypto.createHash("sha256").update(outBuf).digest("hex").slice(0, 16)}`;
    writeAudit({
      actorType: "system",
      action: "contentflow.image.postprocessed",
      entityType: "content_draft",
      entityId,
      metadata: telemetry,
    }).catch(() => { /* swallowed in writeAudit anyway */ });

    return outBuf;
  } catch (err: any) {
    /* Defence-in-depth: never break the publish pipeline. */
    logger.warn(`postprocess_failed: ${err?.message || err} — returning input untouched`);
    return original;
  }
}

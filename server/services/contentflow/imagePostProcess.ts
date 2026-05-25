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

const logger = createLogger("ImagePostProcess");

export interface PostProcessOpts {
  noiseLevel?: number;     // 0-3, default 2 (Gaussian sigma multiplier)
  chromaShift?: number;    // 0-2 pixels, default 1
  stripExif?: boolean;     // default true (always strips metadata chunks)
  jpegQuality?: number;    // 78-92, default 85 (reserved; no JPEG encoder available)
  draftId?: number;        // for audit metadata
  clientId?: number;       // for audit metadata
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

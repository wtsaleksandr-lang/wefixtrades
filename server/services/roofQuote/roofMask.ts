/**
 * Roof-ONLY AI re-render mask helpers — faithful TypeScript port of
 * `spikes/roof-quote/airoof.mjs` (the proven spike). The math is UNCHANGED;
 * only the module shape (ESM `.mjs` → TS) is adapted.
 *
 * The guarantee these helpers give (that a plain Kontext img2img cannot): the
 * render changes ONLY the target house's roof. Achieved two ways, BOTH applied:
 *   1. MASKED inpaint (Flux Fill) — the model can only repaint white-mask (roof) px.
 *   2. POST-COMPOSITE — paste the inpaint result back through the SAME mask onto
 *      the ORIGINAL satellite bytes, so every non-roof pixel is provably the
 *      original (even if the model bled outside the mask or re-encoded the frame).
 *
 * Mask source = the building-footprint lat/lng ring projected onto a TOP-DOWN
 * Static-Maps satellite image. Both are Web Mercator → the ring maps to satellite
 * pixels EXACTLY, so alignment is by construction (no learned segmentation, no drift).
 */
import { PNG } from "pngjs";

const TILE = 256;

// Footprint ring point: either [lng, lat] (GeoJSON order) or { lat, lng }.
export type RingPoint = [number, number] | { lat: number; lng: number };

// Web Mercator world coordinate (in 256-px tile units at zoom 0) for a lat/lng.
// Google Static Maps uses exactly this projection; scale by 2^zoom for pixel coords.
function project(lat: number, lng: number): { x: number; y: number } {
  const siny = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return {
    x: TILE * (0.5 + lng / 360),
    y: TILE * (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)),
  };
}

// Map a lat/lng to a PIXEL in a Static-Maps image of size (w×h) centred on
// (cLat,cLng) at `zoom`, rendered at `scale` (1 or 2). Origin top-left. Pure
// Web-Mercator inverse of the static-map framing — exact, deterministic, no network.
export function latLngToPixel(
  lat: number,
  lng: number,
  cLat: number,
  cLng: number,
  zoom: number,
  w: number,
  h: number,
  scale: number,
): { x: number; y: number } {
  const wp = project(lat, lng);
  const cp = project(cLat, cLng);
  const sc = Math.pow(2, zoom) * scale;
  return {
    x: (wp.x - cp.x) * sc + w / 2,
    y: (wp.y - cp.y) * sc + h / 2,
  };
}

export interface RoofMask {
  png: PNG;
  buf: Buffer;
  whiteFrac: number;
  points: Array<{ x: number; y: number }>;
}

// Build a binary roof MASK PNG (white = repaint, black = keep) by filling the
// footprint polygon (lat/lng ring) projected into the static-map pixel space.
// `ring` = [[lng,lat],...] (GeoJSON order) OR [{lat,lng}] — both accepted. Optional
// `feather` dilates the white region by N px so the inpaint covers eave edges
// cleanly (kept small to stay roof-only).
export function buildRoofMask(
  ring: RingPoint[],
  cLat: number,
  cLng: number,
  zoom: number,
  w: number,
  h: number,
  scale: number,
  feather = 0,
): RoofMask {
  const pts = ring.map((p) => {
    const lat = Array.isArray(p) ? p[1] : p.lat;
    const lng = Array.isArray(p) ? p[0] : p.lng;
    return latLngToPixel(lat, lng, cLat, cLng, zoom, w, h, scale);
  });
  const png = new PNG({ width: w, height: h });
  // even-odd point-in-polygon scanline fill
  const inside = (x: number, y: number): boolean => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
      if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  let whiteCount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const on = inside(x + 0.5, y + 0.5);
      const idx = (y * w + x) << 2;
      const v = on ? 255 : 0;
      png.data[idx] = v;
      png.data[idx + 1] = v;
      png.data[idx + 2] = v;
      png.data[idx + 3] = 255;
      if (on) whiteCount++;
    }
  }
  if (feather > 0) whiteCount += dilate(png, w, h, feather);
  return { png, buf: PNG.sync.write(png), whiteFrac: whiteCount / (w * h), points: pts };
}

// Simple square-kernel dilation of the white region (grow the mask by `r` px).
// Returns the number of pixels newly turned white (so the caller can update whiteFrac).
function dilate(png: PNG, w: number, h: number, r: number): number {
  const src = Buffer.from(png.data);
  const isWhite = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) << 2] > 127;
  let grown = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) << 2;
      if (src[idx] > 127) continue;
      let grow = false;
      for (let dy = -r; dy <= r && !grow; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (isWhite(x + dx, y + dy)) {
            grow = true;
            break;
          }
      if (grow) {
        png.data[idx] = png.data[idx + 1] = png.data[idx + 2] = 255;
        grown++;
      }
    }
  }
  return grown;
}

export interface CompositeResult {
  buf: Buffer;
  changedFrac: number;
}

// Composite the inpaint RESULT back through the mask onto the ORIGINAL image:
// out = mask ? result : original. GUARANTEES non-roof pixels are byte-for-byte the
// original. All three buffers are PNG. Result/original are auto-resized only if
// dims differ (nearest-neighbour).
export function compositeThroughMask(origBuf: Buffer, resultBuf: Buffer, maskPng: PNG): CompositeResult {
  const orig = PNG.sync.read(origBuf);
  const res = PNG.sync.read(resultBuf);
  const w = orig.width, h = orig.height;
  const out = new PNG({ width: w, height: h });
  const sampleRes = (x: number, y: number): number => {
    // nearest-neighbour sample of result at orig (x,y) in case the model returned a different size
    const rx = res.width === w ? x : Math.min(res.width - 1, Math.round((x / w) * res.width));
    const ry = res.height === h ? y : Math.min(res.height - 1, Math.round((y / h) * res.height));
    return (ry * res.width + rx) << 2;
  };
  let changed = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) << 2;
      const m = maskPng.data[i] > 127;
      if (m) {
        const rIdx = sampleRes(x, y);
        out.data[i] = res.data[rIdx];
        out.data[i + 1] = res.data[rIdx + 1];
        out.data[i + 2] = res.data[rIdx + 2];
        out.data[i + 3] = 255;
        changed++;
      } else {
        out.data[i] = orig.data[i];
        out.data[i + 1] = orig.data[i + 1];
        out.data[i + 2] = orig.data[i + 2];
        out.data[i + 3] = 255;
      }
    }
  }
  return { buf: PNG.sync.write(out), changedFrac: changed / (w * h) };
}

export interface DiffResult {
  outsideMeanDiff: number;
  outsideMaxDiff: number;
  insideMeanDiff: number;
  outsideFrac: number;
}

// Pixel-diff proof: mean abs per-channel diff over the NON-mask (should-be-unchanged)
// region vs the mask (roof, should-change) region. Used by the verification harness to
// PROVE roof-only (composited outsideMeanDiff/maxDiff must be 0).
export function diffOutsideMask(aBuf: Buffer, bBuf: Buffer, maskPng: PNG): DiffResult {
  const a = PNG.sync.read(aBuf), b = PNG.sync.read(bBuf);
  const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
  let outSum = 0, outN = 0, inSum = 0, inN = 0, outMax = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ia = (y * a.width + x) << 2, ib = (y * b.width + x) << 2;
      const im = (y * maskPng.width + x) << 2;
      const d =
        (Math.abs(a.data[ia] - b.data[ib]) +
          Math.abs(a.data[ia + 1] - b.data[ib + 1]) +
          Math.abs(a.data[ia + 2] - b.data[ib + 2])) /
        3;
      if (maskPng.data[im] > 127) {
        inSum += d;
        inN++;
      } else {
        outSum += d;
        outN++;
        if (d > outMax) outMax = d;
      }
    }
  }
  return {
    outsideMeanDiff: outN ? outSum / outN : 0,
    outsideMaxDiff: outMax,
    insideMeanDiff: inN ? inSum / inN : 0,
    outsideFrac: outN / (w * h),
  };
}

export { PNG };

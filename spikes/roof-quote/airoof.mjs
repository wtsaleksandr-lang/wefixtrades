// ── Roof-ONLY AI re-render helpers ──────────────────────────────────────────
// The guarantee that prior Kontext attempts could not give: the render changes ONLY
// the target house's roof. Achieved two ways, BOTH applied (belt-and-suspenders):
//   1. MASKED inpaint (Flux Fill) — the model can only repaint white-mask (roof) pixels.
//   2. POST-COMPOSITE — we paste the inpaint result back through the SAME mask onto the
//      ORIGINAL satellite bytes, so every non-roof pixel is provably the original (even if
//      the model bled outside the mask, or returned a slightly re-encoded frame).
// Mask source = the building-footprint lat/lng ring projected onto a TOP-DOWN Static-Maps
// satellite image. Both are Web Mercator → the ring maps to satellite pixels EXACTLY, so
// alignment is by construction (no learned segmentation, no drift).
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");

const TILE = 256;

// Web Mercator world coordinate (in 256-px tile units at zoom 0) for a lat/lng.
// Google Static Maps uses exactly this projection; scale by 2^zoom for pixel coords.
function project(lat, lng) {
  const siny = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return {
    x: TILE * (0.5 + lng / 360),
    y: TILE * (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)),
  };
}

// Map a lat/lng to a PIXEL in a Static-Maps image of size (w×h) centred on (cLat,cLng) at
// `zoom`, rendered at `scale` (1 or 2). Origin top-left. Pure Web-Mercator inverse of the
// static-map framing — exact, deterministic, no network.
export function latLngToPixel(lat, lng, cLat, cLng, zoom, w, h, scale) {
  const wp = project(lat, lng);
  const cp = project(cLat, cLng);
  const sc = Math.pow(2, zoom) * scale;
  return {
    x: (wp.x - cp.x) * sc + w / 2,
    y: (wp.y - cp.y) * sc + h / 2,
  };
}

// Build a binary roof MASK PNG (white = repaint, black = keep) by filling the footprint
// polygon (lat/lng ring) projected into the static-map pixel space. `ring` = [[lng,lat],...]
// (GeoJSON order) OR [{lat,lng}] — both accepted. Optional `feather` dilates the white
// region by N px so the inpaint covers eave edges cleanly (kept small to stay roof-only).
export function buildRoofMask(ring, cLat, cLng, zoom, w, h, scale, feather = 0) {
  const pts = ring.map((p) => {
    const lat = Array.isArray(p) ? p[1] : p.lat;
    const lng = Array.isArray(p) ? p[0] : p.lng;
    return latLngToPixel(lat, lng, cLat, cLng, zoom, w, h, scale);
  });
  const png = new PNG({ width: w, height: h });
  // even-odd point-in-polygon scanline fill
  const inside = (x, y) => {
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
      png.data[idx] = v; png.data[idx + 1] = v; png.data[idx + 2] = v; png.data[idx + 3] = 255;
      if (on) whiteCount++;
    }
  }
  if (feather > 0) dilate(png, w, h, feather, () => whiteCount++);
  return { png, buf: PNG.sync.write(png), whiteFrac: whiteCount / (w * h), points: pts };
}

// Simple square-kernel dilation of the white region (grow the mask by `r` px).
function dilate(png, w, h, r, onGrow) {
  const src = Buffer.from(png.data);
  const isWhite = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[((y * w + x) << 2)] > 127;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) << 2;
      if (src[idx] > 127) continue;
      let grow = false;
      for (let dy = -r; dy <= r && !grow; dy++)
        for (let dx = -r; dx <= r; dx++) if (isWhite(x + dx, y + dy)) { grow = true; break; }
      if (grow) { png.data[idx] = png.data[idx + 1] = png.data[idx + 2] = 255; if (onGrow) onGrow(); }
    }
  }
}

// Composite the inpaint RESULT back through the mask onto the ORIGINAL image:
// out = mask ? result : original. GUARANTEES non-roof pixels are byte-for-byte the original.
// All three buffers are PNG. Result/original are auto-resized only if dims differ (nearest).
export function compositeThroughMask(origBuf, resultBuf, maskPng) {
  const orig = PNG.sync.read(origBuf);
  const res = PNG.sync.read(resultBuf);
  const w = orig.width, h = orig.height;
  const out = new PNG({ width: w, height: h });
  const sampleRes = (x, y) => {
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
        const r = sampleRes(x, y);
        out.data[i] = res.data[r]; out.data[i + 1] = res.data[r + 1];
        out.data[i + 2] = res.data[r + 2]; out.data[i + 3] = 255;
        changed++;
      } else {
        out.data[i] = orig.data[i]; out.data[i + 1] = orig.data[i + 1];
        out.data[i + 2] = orig.data[i + 2]; out.data[i + 3] = 255;
      }
    }
  }
  return { buf: PNG.sync.write(out), changedFrac: changed / (w * h) };
}

// Pixel-diff proof: mean abs per-channel diff over the NON-mask (should-be-unchanged) region
// vs the mask (roof, should-change) region. Used by the verification harness to PROVE roof-only.
export function diffOutsideMask(aBuf, bBuf, maskPng) {
  const a = PNG.sync.read(aBuf), b = PNG.sync.read(bBuf);
  const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
  let outSum = 0, outN = 0, inSum = 0, inN = 0, outMax = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ia = (y * a.width + x) << 2, ib = (y * b.width + x) << 2;
      const im = (y * maskPng.width + x) << 2;
      const d = (Math.abs(a.data[ia] - b.data[ib]) + Math.abs(a.data[ia + 1] - b.data[ib + 1]) + Math.abs(a.data[ia + 2] - b.data[ib + 2])) / 3;
      if (maskPng.data[im] > 127) { inSum += d; inN++; }
      else { outSum += d; outN++; if (d > outMax) outMax = d; }
    }
  }
  return {
    outsideMeanDiff: outN ? outSum / outN : 0,
    outsideMaxDiff: outMax,
    insideMeanDiff: inN ? inSum / inN : 0,
    outsideFrac: outN / (w * h),
  };
}

// Render a red-overlay diff visualization PNG: original with non-mask changed pixels tinted red.
export function diffViz(aBuf, bBuf, maskPng, thresh = 12) {
  const a = PNG.sync.read(aBuf), b = PNG.sync.read(bBuf);
  const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ia = (y * a.width + x) << 2, ib = (y * b.width + x) << 2;
      const im = (y * maskPng.width + x) << 2;
      const d = (Math.abs(a.data[ia] - b.data[ib]) + Math.abs(a.data[ia + 1] - b.data[ib + 1]) + Math.abs(a.data[ia + 2] - b.data[ib + 2])) / 3;
      const o = (y * w + x) << 2;
      out.data[o] = a.data[ia]; out.data[o + 1] = a.data[ia + 1]; out.data[o + 2] = a.data[ia + 2]; out.data[o + 3] = 255;
      if (maskPng.data[im] <= 127 && d > thresh) { out.data[o] = 255; out.data[o + 1] = 0; out.data[o + 2] = 0; } // non-roof change → RED
    }
  }
  return PNG.sync.write(out);
}

export { PNG };

// Roof mask via GLOBAL dark-roof threshold (NOT connected flood-fill).
// The showroom base is one AI house: WHITE lap siding, uniform CHARCOAL roof. Because every
// roof facet shares the same dark, low-chroma tone, we select ALL such pixels GLOBALLY — every
// plane at once regardless of connectivity (main planes + left garage wing + dormer/cross-gable
// junction). This fixes the flood-fill's gap (it missed facets not 8-connected to the seed).
//
// Selection rule per pixel:
//   include  = dark + low-chroma (charcoal roof tone)  AND  inside the roof BAND (above the
//              wall-top/eave line, within the house's horizontal extent).
//   exclude  = sky (blue), foliage (green), white walls/fascia/gutter (bright or chromatic),
//              and small dark NON-roof specks (door, window interiors, lamp) below the eave —
//              handled by the band bound + dropping small connected components.
// Then morphological close (fill vent/ridge glint holes) + a small erode (pull strictly inside
// the eave so ZERO wall bleed) + drop components < MIN_COMP.
//
// usage: node showroom-mask-global.mjs <basePng> <outMaskPng> <outOverlayPng>
// env (defaults tuned for scripts/showroom-assets/base.png 1216x832):
//   LUM_LO(35) LUM_HI(165)  roof luminance window (charcoal: ~50..150; white walls/lamp > 165)
//   CHROMA_MAX(16)          max(R,G,B)-min(R,G,B) below this = neutral (roof). walls have warm tint
//   BAND "t,b,l,r"          roof bounding box (top,bottom,left,right) — fences off ground/sky edges
//   EXCLUDE "x0,y0,x1,y1;.."hard keep-out rects (e.g. a non-roof dark speck above the eave)
//   ERODE(2) CLOSE(3) MIN_COMP(1500)
import fs from "node:fs";
import { PNG } from "pngjs";

const BASE = process.argv[2], OUTMASK = process.argv[3], OUTOV = process.argv[4];
if (!BASE || !OUTMASK || !OUTOV) { console.error("usage: <basePng> <outMaskPng> <outOverlayPng>"); process.exit(1); }

const base = PNG.sync.read(fs.readFileSync(BASE));
const W = base.width, H = base.height, D = base.data;

// Defaults below are the LOCKED, verified values for scripts/showroom-assets/base.png (1216x832):
// every facet covered (main planes + dormer/cross-gable + ridge caps + left garage wing incl. its
// shadowed return-slope), ZERO white-wall bleep. See SHADOW_LUM/SHADOW_CHROMA note above eligible().
const LUM_LO = Number(process.env.LUM_LO || 8);     // catch near-black ridge-cap/shadow; true black holes ok (roof)
const LUM_HI = Number(process.env.LUM_HI || 170);   // above this = white walls / lamp / sky
const CHROMA_MAX = Number(process.env.CHROMA_MAX || 16); // mid-value neutral window (rejects warm walls)
const ERODE = Number(process.env.ERODE || 2);       // pull strictly inside the eave (no wall lap)
const CLOSE = Number(process.env.CLOSE || 7);       // bridge the dark garage/main valley + ridge seams
const MIN_COMP = Number(process.env.MIN_COMP || 3000); // drop door/window/lamp specks
// Roof band: top,bottom,left,right. Bottom = the wall-top/eave line (no roof pixel below it).
const BANDARG = process.env.BAND || "190,400,98,1160";
const [BT, BB, BL, BR] = BANDARG.split(",").map(Number);
const EXCL = (process.env.EXCLUDE || "").split(";").filter(Boolean).map((s) => s.split(",").map(Number));
function excluded(x, y) { return EXCL.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1); }
function inBand(x, y) { return x >= BL && x <= BR && y >= BT && y <= BB && !excluded(x, y); }

// roof-eligible: dark+neutral charcoal tone, inside band.
// Value-dependent chroma: a roof in deep SHADOW (garage return-slope, ridge-cap valley) is dark
// AND picks up a blue cast — chroma 24-48 there — yet is unmistakably roof, not sky (sky is BRIGHT,
// lum>168, already cut). So for dark pixels we allow a looser blue chroma; for mid/bright pixels we
// keep the tight neutral window that rejects the warm white walls.
const SHADOW_LUM = Number(process.env.SHADOW_LUM || 100);   // lum below this = shadowed roof
const SHADOW_CHROMA = Number(process.env.SHADOW_CHROMA || 55); // looser chroma allowance there
function eligible(x, y) {
  if (!inBand(x, y)) return false;
  const i = (y * W + x) << 2, r = D[i], g = D[i + 1], b = D[i + 2];
  const lum = (r + g + b) / 3;
  if (lum < LUM_LO || lum > LUM_HI) return false; // too dark (true black) or too bright (walls/lamp)
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), chroma = mx - mn;
  const dark = lum < SHADOW_LUM;
  const chromaCap = dark ? SHADOW_CHROMA : CHROMA_MAX;
  if (chroma > chromaCap) return false;            // chromatic warm wall (mid) / non-blue (dark)
  // foliage guard always tight (green-dominant roof never happens):
  if (g - Math.max(r, b) > CHROMA_MAX) return false; // green foliage
  // bright blue-dominant guard (sky) — only matters for non-dark pixels (dark blue = shadowed roof):
  if (!dark && b - r > CHROMA_MAX) return false;
  return true;
}

const mask = new PNG({ width: W, height: H });
let raw = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) << 2;
  const v = eligible(x, y) ? 255 : 0;
  mask.data[i] = mask.data[i + 1] = mask.data[i + 2] = v; mask.data[i + 3] = 255;
  if (v) raw++;
}

function dilate(src, r) { const out = Buffer.from(src); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) << 2; if (src[i] > 127) continue; let o = false; for (let dy = -r; dy <= r && !o; dy++) for (let dx = -r; dx <= r; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; if (src[(ny * W + nx) << 2] > 127) { o = true; break; } } if (o) out[i] = out[i + 1] = out[i + 2] = 255; } return out; }
function erode(src, r) { const out = Buffer.from(src); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) << 2; if (src[i] <= 127) continue; let keep = true; for (let dy = -r; dy <= r && keep; dy++) for (let dx = -r; dx <= r; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || src[(ny * W + nx) << 2] <= 127) { keep = false; break; } } if (!keep) out[i] = out[i + 1] = out[i + 2] = 0; } return out; }

// Close (dilate->erode) to fill interior vent/ridge-glint holes, then erode to pull inside eave.
let m = dilate(mask.data, CLOSE); m = erode(m, CLOSE);
m = erode(m, ERODE);
m.copy(mask.data);

// Drop connected components smaller than MIN_COMP (stray dark specks: door, window, lamp, shadow).
if (MIN_COMP > 0) {
  const buf = mask.data, seen = new Uint8Array(W * H), st = [];
  const comps = [];
  for (let p0 = 0; p0 < W * H; p0++) {
    if (seen[p0] || buf[p0 << 2] <= 127) continue;
    st.length = 0; st.push(p0); seen[p0] = 1; const c = [p0];
    while (st.length) { const p = st.pop(); const x = p % W, y = (p / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const np = ny * W + nx; if (seen[np] || buf[np << 2] <= 127) continue; seen[np] = 1; st.push(np); c.push(np); } }
    comps.push(c);
    if (c.length < MIN_COMP) for (const p of c) { const i = p << 2; buf[i] = buf[i + 1] = buf[i + 2] = 0; }
  }
  comps.sort((a, b) => b.length - a.length);
  console.log("components kept (>=" + MIN_COMP + "):", comps.filter(c => c.length >= MIN_COMP).map(c => c.length).join(", "));
}

let white = 0; for (let p = 0; p < W * H; p++) if (mask.data[p << 2] > 127) white++;
console.log("raw eligible", raw, "-> final roof px", white, "frac", (white / (W * H)).toFixed(4));
fs.writeFileSync(OUTMASK, PNG.sync.write(mask));

const ov = new PNG({ width: W, height: H }); base.data.copy(ov.data);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) << 2; if (mask.data[i] > 127) { ov.data[i] = 255; ov.data[i + 1] = 30; ov.data[i + 2] = 30; } }
fs.writeFileSync(OUTOV, PNG.sync.write(ov));
console.log("wrote", OUTMASK, "+", OUTOV);

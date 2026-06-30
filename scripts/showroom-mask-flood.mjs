// Roof mask via SEEDED FLOOD FILL through neutral-dark roof pixels.
// Robust + image-agnostic for "dark roof over light walls" bases: starts from roof seed
// point(s), grows 8-connected ONLY through near-neutral, mid-dark pixels, and is BLOCKED by
// every bright pixel (white eave/gutter/gable/wall), blue sky and green foliage. Because a
// white eave/gutter separates the roof from the walls below, the flood naturally STOPS at the
// eaveline and never reaches siding -> zero wall bleed by construction.
//
// usage: node showroom-mask-flood.mjs <SR> <stem> <seedsCSV "x,y;x,y"> [band "t,b,l,r"]
// env: LUM_LO, LUM_HI(190), NEUTRAL(18), ERODE(2), EXCLUDE "x0,y0,x1,y1;...", MERGE=1
//
// CANONICAL showroom base+mask (scripts/showroom-assets/base.png + mask.png) were produced by:
//   LUM_LO=42 NEUTRAL=22 ERODE=1 \
//   EXCLUDE="120,150,355,278;835,150,1015,206" \
//   node scripts/showroom-mask-flood.mjs <SR> sg \
//     "480,260;220,310;760,290;860,300;920,300;980,300;1010,300;320,300" "172,400,138,1050"
//   then drop connected components < 2000px (kept 2: main+right hip = 125779, garage wing = 22406).
// Base sg = scripts/showroom-gen-base2 g3sgable-0 (flux-1.1-pro, seed via showroom-gen-base2.mjs).
import fs from "node:fs";
import { PNG } from "pngjs";

const SR = process.argv[2];
const STEM = process.argv[3];
const SEEDS = (process.argv[4] || "").split(";").filter(Boolean).map((s) => s.split(",").map(Number));
// optional hard band rectangle "top,bottom,left,right" to fence the flood off foliage/ground.
const BANDARG = process.argv[5];
if (!SR || !STEM || !SEEDS.length) { console.error('usage <SR> <stem> "x,y;x,y" [t,b,l,r]'); process.exit(1); }

const base = PNG.sync.read(fs.readFileSync(`${SR}/${STEM}.png`));
const W = base.width, H = base.height;
const D = base.data;
function rgb(x, y) { const i = (y * W + x) << 2; return [D[i], D[i + 1], D[i + 2]]; }
const [BT, BB, BL, BR] = BANDARG ? BANDARG.split(",").map(Number) : [0, H - 1, 0, W - 1];
// EXCLUDE="x0,y0,x1,y1;..." hard keep-out rectangles (e.g. a pine tree poking above the roof
// ridge whose dark neutral pixels would otherwise flood-connect to the roof).
const EXCL = (process.env.EXCLUDE || "").split(";").filter(Boolean).map((s) => s.split(",").map(Number));
function excluded(x, y) { return EXCL.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1); }
function inBand(x, y) { return x >= BL && x <= BR && y >= BT && y <= BB && !excluded(x, y); }

// A pixel is "roof-eligible" if near-neutral and in the roof luminance window.
const LUM_LO = Number(process.env.LUM_LO||42), LUM_HI = 190, NEUTRAL = Number(process.env.NEUTRAL||18);
function eligible(x, y) {
  const [r, g, b] = rgb(x, y);
  const lum = (r + g + b) / 3;
  if (lum < LUM_LO || lum > LUM_HI) return false;        // bright walls/eaves & near-black both out
  if (Math.abs(b - r) >= NEUTRAL) return false;           // blue sky
  if ((g - Math.max(r, b)) >= NEUTRAL) return false;      // green foliage
  return true;
}

// Flood fill (8-connected) from seeds through eligible pixels.
const on = new Uint8Array(W * H);
const stack = [];
for (const [sx, sy] of SEEDS) {
  if (!eligible(sx, sy)) { console.warn("seed not eligible:", sx, sy, rgb(sx, sy)); continue; }
  const p0 = sy * W + sx; if (!on[p0]) { on[p0] = 1; stack.push(p0); }
}
while (stack.length) {
  const p = stack.pop(); const x = p % W, y = (p / W) | 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const np = ny * W + nx; if (on[np]) continue;
    if (inBand(nx, ny) && eligible(nx, ny)) { on[np] = 1; stack.push(np); }
  }
}

// Build mask, then close small interior holes (vents/skylight glints) WITHOUT crossing the
// flood boundary outward: close = dilate then erode, but constrained so we never extend past
// the original eligible region by more than the close radius is fine since holes are interior.
const mask = new PNG({ width: W, height: H });
for (let p = 0; p < W * H; p++) { const i = p << 2; const v = on[p] ? 255 : 0; mask.data[i] = mask.data[i + 1] = mask.data[i + 2] = v; mask.data[i + 3] = 255; }

function dilate(src, r) { const out = Buffer.from(src); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) << 2; if (src[i] > 127) continue; let o = false; for (let dy = -r; dy <= r && !o; dy++) for (let dx = -r; dx <= r; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; if (src[(ny * W + nx) << 2] > 127) { o = true; break; } } if (o) out[i] = out[i + 1] = out[i + 2] = 255; } return out; }
function erode(src, r) { const out = Buffer.from(src); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) << 2; if (src[i] <= 127) continue; let keep = true; for (let dy = -r; dy <= r && keep; dy++) for (let dx = -r; dx <= r; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || src[(ny * W + nx) << 2] <= 127) { keep = false; break; } } if (!keep) out[i] = out[i + 1] = out[i + 2] = 0; } return out; }

let m = dilate(mask.data, 3); m = erode(m, 3);   // fill interior vent/glint holes
m = erode(m, Number(process.env.ERODE||2));      // pull strictly inside the roof edge (no eave lap)
m.copy(mask.data);

// MERGE=1: OR this pass into the existing <stem>-mask.png (union multiple roof planes across
// hip ridges that the eligible-pixel graph leaves disconnected). RAW=1 skips the erode pull-in
// for an intermediate union pass (final pass should erode).
if (process.env.MERGE === "1" && fs.existsSync(`${SR}/${STEM}-mask.png`)) {
  const prev = PNG.sync.read(fs.readFileSync(`${SR}/${STEM}-mask.png`));
  for (let p = 0; p < W * H; p++) { const i = p << 2; if (prev.data[i] > 127) { mask.data[i] = mask.data[i + 1] = mask.data[i + 2] = 255; } }
}

// Drop connected components smaller than MIN_COMP px (stray tree-trunk/shadow specks). Runs AFTER
// the optional merge so a small valid plane that was unioned in survives if above MIN_COMP.
const MIN_COMP = Number(process.env.MIN_COMP || 2000);
if (MIN_COMP > 0) {
  const buf = mask.data, seen = new Uint8Array(W * H), st2 = [];
  for (let p0 = 0; p0 < W * H; p0++) {
    if (seen[p0] || buf[p0 << 2] <= 127) continue;
    st2.length = 0; st2.push(p0); seen[p0] = 1; const c = [p0];
    while (st2.length) { const p = st2.pop(); const x = p % W, y = (p / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const np = ny * W + nx; if (seen[np] || buf[np << 2] <= 127) continue; seen[np] = 1; st2.push(np); c.push(np); } }
    if (c.length < MIN_COMP) for (const p of c) { const i = p << 2; buf[i] = buf[i + 1] = buf[i + 2] = 0; }
  }
}

let white = 0; for (let p = 0; p < W * H; p++) if (mask.data[p << 2] > 127) white++;
console.log(`${STEM} roof px`, white, "frac", (white / (W * H)).toFixed(4));
fs.writeFileSync(`${SR}/${STEM}-mask.png`, PNG.sync.write(mask));

const ov = new PNG({ width: W, height: H }); base.data.copy(ov.data);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) << 2; if (mask.data[i] > 127) { ov.data[i] = 255; ov.data[i + 1] = 30; ov.data[i + 2] = 30; } }
fs.writeFileSync(`${SR}/${STEM}-mask-overlay.png`, PNG.sync.write(ov));
console.log(`wrote ${STEM}-mask.png + overlay`);

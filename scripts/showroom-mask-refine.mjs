// Refine a roof mask so the HARD-composite edge is a clean roof silhouette (kills the
// jagged/notched edge hallucination). Steps:
//   1. Fill interior holes (roof vents, ridge glints, the dark peak notch) — any 0-region
//      NOT connected to the image border becomes 255. So the whole roof is solid.
//   2. Morphological smoothing (open then close with a round-ish SE) to erase 1-2px stair
//      steps along the ridge / rake edges without moving the true boundary.
//   3. Optional final erode (EDGE_ERODE, default 1) to sit strictly inside the true roof
//      silhouette so the hard composite never bites a sky pixel at the boundary.
// The composite stays byte-locked (outsideMax=0): outside pixels are untouched; we only
// shape WHERE the roof/sky boundary falls so it is smooth, not ragged.
//
// usage: node showroom-mask-refine.mjs <inMask> <outMask> [basePngForOverlay outOverlay]
import fs from "node:fs";
import { PNG } from "pngjs";

const IN = process.argv[2], OUT = process.argv[3], BASE = process.argv[4], OV = process.argv[5];
if (!IN || !OUT) { console.error("usage: <inMask> <outMask> [base overlay]"); process.exit(1); }
const m = PNG.sync.read(fs.readFileSync(IN));
const W = m.width, H = m.height;
const on = new Uint8Array(W * H);
for (let p = 0; p < W * H; p++) on[p] = m.data[p << 2] > 127 ? 1 : 0;

// 1) Fill interior holes: flood the 0-region from the border; any 0 not reached is a hole -> fill.
const reachable = new Uint8Array(W * H);
const st = [];
for (let x = 0; x < W; x++) { for (const y of [0, H - 1]) { const p = y * W + x; if (!on[p] && !reachable[p]) { reachable[p] = 1; st.push(p); } } }
for (let y = 0; y < H; y++) { for (const x of [0, W - 1]) { const p = y * W + x; if (!on[p] && !reachable[p]) { reachable[p] = 1; st.push(p); } } }
while (st.length) {
  const p = st.pop(), x = p % W, y = (p / W) | 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const np = ny * W + nx; if (on[np] || reachable[np]) continue; reachable[np] = 1; st.push(np);
  }
}
let holes = 0;
for (let p = 0; p < W * H; p++) if (!on[p] && !reachable[p]) { on[p] = 1; holes++; }

// morphology helpers on the Uint8Array
function dil(src, r) { const o = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (src[y * W + x]) { o[y * W + x] = 1; continue; } let hit = 0; for (let dy = -r; dy <= r && !hit; dy++) for (let dx = -r; dx <= r; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; if (dx * dx + dy * dy > r * r) continue; if (src[ny * W + nx]) { hit = 1; break; } } o[y * W + x] = hit; } return o; }
function ero(src, r) { const o = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (!src[y * W + x]) { o[y * W + x] = 0; continue; } let keep = 1; for (let dy = -r; dy <= r && keep; dy++) for (let dx = -r; dx <= r; dx++) { const nx = x + dx, ny = y + dy; if (dx * dx + dy * dy > r * r) continue; if (nx < 0 || ny < 0 || nx >= W || ny >= H || !src[ny * W + nx]) { keep = 0; break; } } o[y * W + x] = keep; } return o; }

// 2) smoothing: close (dil->ero) fills tiny inlets, open (ero->dil) trims tiny spurs.
const CLOSE = Number(process.env.RCLOSE || 3);
const OPEN = Number(process.env.ROPEN || 2);
let cur = on;
cur = ero(dil(cur, CLOSE), CLOSE);   // close
cur = dil(ero(cur, OPEN), OPEN);     // open
// 3) final erode strictly inside the true silhouette (no sky bite at hard-composite edge)
const EDGE_ERODE = Number(process.env.EDGE_ERODE || 1);
if (EDGE_ERODE > 0) cur = ero(cur, EDGE_ERODE);

let white = 0;
for (let p = 0; p < W * H; p++) { const v = cur[p] ? 255 : 0; m.data[p << 2] = m.data[(p << 2) + 1] = m.data[(p << 2) + 2] = v; m.data[(p << 2) + 3] = 255; if (v) white++; }
fs.writeFileSync(OUT, PNG.sync.write(m));
console.log("holes filled", holes, "-> final roof px", white, "frac", (white / (W * H)).toFixed(4));

if (BASE && OV) {
  const b = PNG.sync.read(fs.readFileSync(BASE));
  const ov = new PNG({ width: W, height: H }); b.data.copy(ov.data);
  for (let p = 0; p < W * H; p++) if (m.data[p << 2] > 127) { ov.data[p << 2] = 255; ov.data[(p << 2) + 1] = 30; ov.data[(p << 2) + 2] = 30; }
  fs.writeFileSync(OV, PNG.sync.write(ov));
  console.log("overlay", OV);
}

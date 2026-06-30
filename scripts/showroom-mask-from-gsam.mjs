// Derive the roof-ENVELOPE mask from grounded_sam's green-tinted annotation, then
// SUBTRACT the gable triangles + dormer faces (hand polygons) to get roof-SLOPES only.
// Outputs roof-mask.png (white=roof) + mask-overlay.png for verification.
import fs from "node:fs";
import { PNG } from "pngjs";

const SR = process.argv[2];
const base = PNG.sync.read(fs.readFileSync(SR + "/base.png"));
const ann = PNG.sync.read(fs.readFileSync(SR + "/gsam-ann.png")); // annotated (green tint = roof), re-encoded to true PNG
const W = base.width, H = base.height;
if (ann.width !== W || ann.height !== H) console.warn("dim mismatch", ann.width, ann.height, "vs", W, H);

// The grounded_sam highlight is a translucent yellow-green tint BLENDED over the base.
// Detect by DIFF vs base (vegetation is green in BOTH images so its diff ~0; only the
// overlay shifts gray roof toward green/yellow): green up AND blue down vs the base pixel.
function isHighlight(i) {
  const b = ann.data[i + 2], bb = base.data[i + 2];
  const dB = b - bb;
  // The translucent yellow-green overlay's strongest, most specific signature is a large
  // DROP in the blue channel vs base (vegetation/siding/sky have dB ~0). Threshold from probe.
  return dB < -25;
}

// ---- gable / dormer exclusion polygons (REAL px, 1216x832). Read off base-grid2/roofband.
// Generous triangles that fully cover the front-facing gable faces + their dormer faces.
// Apexes/base from the gridded crop (roofband.jpg, crop offset y=80).
// Gable-face exclusion triangles (REAL px). Apexes/bases read off roofband.jpg (y-offset 80).
// Kept slightly TIGHT to the shake faces so we don't eat the gray hip slopes beside them.
const LEFT_GABLE = [[205, 378], [345, 178], [495, 378]];
const RIGHT_GABLE = [[710, 378], [855, 162], [1005, 378]];
const polys = [LEFT_GABLE, RIGHT_GABLE];

function inPoly(px, py, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function inAnyGable(x, y) { return polys.some((p) => inPoly(x + 0.5, y + 0.5, p)); }

// Hard ROOF-BAND gate: the roof lives in this band. Excludes the grounded_sam text-label box
// (top-left sky) and any stray below-eave pixels. Read off the gridded base.
const ROOF_TOP = 195, ROOF_BOTTOM = 378, ROOF_LEFT = 90, ROOF_RIGHT = 1130;
function inBand(x, y) { return y >= ROOF_TOP && y <= ROOF_BOTTOM && x >= ROOF_LEFT && x <= ROOF_RIGHT; }

const mask = new PNG({ width: W, height: H });
let white = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) << 2;
    const on = isHighlight(i) && !inAnyGable(x, y) && inBand(x, y);
    const v = on ? 255 : 0;
    mask.data[i] = mask.data[i + 1] = mask.data[i + 2] = v; mask.data[i + 3] = 255;
    if (on) white++;
  }
}
console.log("roof-slope px (pre-morph)", white, "frac", (white / (W * H)).toFixed(4));

// Morphological CLOSE (dilate r, then erode r) to fill JPEG-noise holes + smooth edges,
// re-applying the gable & band gates after dilation so we never grow ONTO a gable.
function dilate(src, r) {
  const out = Buffer.from(src);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) << 2; if (src[i] > 127) continue;
    let grow = false;
    for (let dy = -r; dy <= r && !grow; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (src[(ny * W + nx) << 2] > 127) { grow = true; break; }
    }
    if (grow && !inAnyGable(x, y) && inBand(x, y)) { out[i] = out[i + 1] = out[i + 2] = 255; }
  }
  return out;
}
function erode(src, r) {
  const out = Buffer.from(src);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) << 2; if (src[i] <= 127) continue;
    let keep = true;
    for (let dy = -r; dy <= r && keep; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || src[(ny * W + nx) << 2] <= 127) { keep = false; break; }
    }
    if (!keep) { out[i] = out[i + 1] = out[i + 2] = 0; }
  }
  return out;
}
let d = dilate(mask.data, 4);
d = erode(d, 4);
// final eave feather: one extra dilate (gated) so the inpaint covers the shingle edge cleanly.
d = dilate(d, 2);
d.copy(mask.data);
white = 0; for (let p = 0; p < W * H; p++) if (mask.data[p << 2] > 127) white++;
console.log("roof-slope px (post-morph)", white, "frac", (white / (W * H)).toFixed(4));
fs.writeFileSync(SR + "/roof-mask.png", PNG.sync.write(mask));

// overlay for verification (roof tinted red, gable polys outlined cyan)
const ov = new PNG({ width: W, height: H });
base.data.copy(ov.data);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) << 2;
  if (mask.data[i] > 127) { ov.data[i] = 255; ov.data[i + 1] = 30; ov.data[i + 2] = 30; }
}
// draw gable poly edges
function line(p, q) {
  const steps = Math.max(Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1]));
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(p[0] + (q[0] - p[0]) * s / steps), y = Math.round(p[1] + (q[1] - p[1]) * s / steps);
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = (y * W + x) << 2; ov.data[i] = 0; ov.data[i + 1] = 255; ov.data[i + 2] = 255;
  }
}
for (const poly of polys) for (let k = 0; k < poly.length; k++) line(poly[k], poly[(k + 1) % poly.length]);
fs.writeFileSync(SR + "/mask-overlay.png", PNG.sync.write(ov));
console.log("wrote roof-mask.png + mask-overlay.png");

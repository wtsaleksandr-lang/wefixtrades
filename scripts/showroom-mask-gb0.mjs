// Roof mask for genbase-0. Its roof is a DISTINCT dark-brown surface (unlike hip-2 where roof
// and gable shared a color), so direct COLOR segmentation is reliable here: dark + warm/neutral
// (not blue sky) + inside the roof band, minus the two cream gable faces and the dark windows.
import fs from "node:fs";
import { PNG } from "pngjs";

const SR = process.argv[2];
const base = PNG.sync.read(fs.readFileSync(SR + "/gb0.png"));
const W = base.width, H = base.height;
function at(x, y) { const i = (y * W + x) << 2; return [base.data[i], base.data[i + 1], base.data[i + 2]]; }

// Dark-brown roof classifier: low luminance, NOT blue-dominant (sky/shadow), warm-to-neutral.
function isRoof(r, g, b) {
  const lum = (r + g + b) / 3;
  const blueBias = b - r;
  // dark brown shingle: lum < ~135, and not strongly blue (blueBias small). Brown => R>=B-ish.
  if (lum < 138 && blueBias < 18) return true;
  // mid-tone sunlit roof patches stay warm-neutral & still darker than cream siding (~190+)
  if (lum < 156 && blueBias < 4 && (r - b) > 0) return true;
  return false;
}

// Roof band (REAL px). Read off gb0-roofband.jpg (crop y-offset 100). Main roof y~120..360;
// extended to 408 to catch the lower porch/bay-window roof bands.
const ROOF_TOP = 120, ROOF_BOTTOM = 408, ROOF_LEFT = 150, ROOF_RIGHT = 1110;
function inBand(x, y) { return y >= ROOF_TOP && y <= ROOF_BOTTOM && x >= ROOF_LEFT && x <= ROOF_RIGHT; }

// Second-story SIDING+WINDOW exclusion band: the cream wall + dark windows below the front
// dormer roofline. Covers the whole inter-window / under-window strip so no siding gets recolored.
// [x0,y0,x1,y1] read off the gridded band. Generous.
const WINDOWS = [
  [280, 285, 590, 358],  // second-story cream wall + windows under the dormer ridge (siding, not roof)
  [415, 350, 575, 378],  // inter-dormer cream wall strip below the windows (was leaking onto siding)
];
function inWindow(x, y) { return WINDOWS.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1); }

// Cream gable-face exclusion triangles (these are SIDING, lighter, so color mostly skips them,
// but add polys to be safe against shadowed shake). Apex/base read off the gridded band.
// Enlarged a touch beyond the visible shake so the mask never laps onto the cream gable face
// (Kontext recolors strongly; a 1-2px lap shows as a patch after composite).
const LEFT_GABLE = [[210, 332], [330, 198], [460, 332]];
// Right vent-gable face is taller/wider than first modeled; its shadowed cream shake below the
// apex was reading as dark roof. Extend the base down to the eave (~y388).
const RIGHT_GABLE = [[748, 388], [858, 188], [958, 388]];
const polys = [LEFT_GABLE, RIGHT_GABLE];
function inPoly(px, py, p) { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const xi = p[i][0], yi = p[i][1], xj = p[j][0], yj = p[j][1]; if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c; } return c; }
function inGable(x, y) { return polys.some((p) => inPoly(x + 0.5, y + 0.5, p)); }

const mask = new PNG({ width: W, height: H });
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const [r, g, b] = at(x, y);
  const on = inBand(x, y) && isRoof(r, g, b) && !inGable(x, y) && !inWindow(x, y);
  const i = (y * W + x) << 2; const v = on ? 255 : 0;
  mask.data[i] = mask.data[i + 1] = mask.data[i + 2] = v; mask.data[i + 3] = 255;
}

// Morphological close (dilate r, erode r) to fill window/vent holes inside the roof, then a
// 2px feather. Gated so we never grow onto a gable or out of band.
function dilate(src, r) { const out = Buffer.from(src); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) << 2; if (src[i] > 127) continue; let g = false; for (let dy = -r; dy <= r && !g; dy++) for (let dx = -r; dx <= r; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; if (src[(ny * W + nx) << 2] > 127) { g = true; break; } } if (g && !inGable(x, y) && inBand(x, y) && !inWindow(x, y)) out[i] = out[i + 1] = out[i + 2] = 255; } return out; }
function erode(src, r) { const out = Buffer.from(src); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) << 2; if (src[i] <= 127) continue; let k = true; for (let dy = -r; dy <= r && k; dy++) for (let dx = -r; dx <= r; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || src[(ny * W + nx) << 2] <= 127) { k = false; break; } } if (!k) out[i] = out[i + 1] = out[i + 2] = 0; } return out; }
let d = dilate(mask.data, 5); d = erode(d, 5); d = dilate(d, 2); d.copy(mask.data);

// Drop small isolated components (stray siding specks). Keep only blobs >= MIN_AREA px.
function dropSmall(buf, minArea) {
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let p0 = 0; p0 < W * H; p0++) {
    if (seen[p0] || buf[p0 << 2] <= 127) continue;
    stack.length = 0; stack.push(p0); seen[p0] = 1; const comp = [p0];
    while (stack.length) {
      const p = stack.pop(); const x = p % W, y = (p / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const np = ny * W + nx; if (seen[np] || buf[np << 2] <= 127) continue;
        seen[np] = 1; stack.push(np); comp.push(np);
      }
    }
    if (comp.length < minArea) for (const p of comp) { const i = p << 2; buf[i] = buf[i + 1] = buf[i + 2] = 0; }
  }
}
dropSmall(mask.data, 400);
let white = 0; for (let p = 0; p < W * H; p++) if (mask.data[p << 2] > 127) white++;
console.log("gb0 roof px", white, "frac", (white / (W * H)).toFixed(4));
fs.writeFileSync(SR + "/gb0-mask.png", PNG.sync.write(mask));

const ov = new PNG({ width: W, height: H }); base.data.copy(ov.data);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) << 2; if (mask.data[i] > 127) { ov.data[i] = 255; ov.data[i + 1] = 30; ov.data[i + 2] = 30; } }
fs.writeFileSync(SR + "/gb0-mask-overlay.png", PNG.sync.write(ov));
console.log("wrote gb0-mask.png + overlay");

// Masked-inpaint showroom renderer. Reuses the SAME engine as the prod top-down path
// (server/services/roofQuote/roofQuoteService.ts fluxFillInpaint + roofMask.compositeThroughMask):
// Flux-Fill-Pro inpaint constrained to the white roof mask, then composite the result back
// through that mask onto the ORIGINAL base so EVERY non-roof pixel is byte-identical.
//
//   PHASE 1 (heroes):  node showroom-render-masked.mjs heroes <baseStem> <maskPng> <outDir>
//   single:            node showroom-render-masked.mjs one    <baseStem> <maskPng> <outDir> <matId> <colorIdx>
//   PHASE 2 (full):    node showroom-render-masked.mjs full   <baseStem> <maskPng> <outDir>
//
// <baseStem> = path to base PNG (e.g. .../base.png). Output saved as .jpg (re-encoded from PNG).
// Run under: doppler run --scope "C:\Users\Owner" -p wefixtrades -c prd -- node ...
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { PNG } from "pngjs";

// PNG -> JPG via system ffmpeg (no node deps; keeps the shared/junctioned node_modules untouched).
// The internal pipeline is PNG-only (pngjs composite); we re-encode the final frame to .jpg here.
function pngToJpg(pngPath, jpgPath, q = Number(process.env.JPG_Q || 3)) {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", pngPath, "-q:v", String(q), jpgPath], { stdio: ["ignore", "ignore", "pipe"] });
  if (r.status !== 0) throw new Error("ffmpeg_jpg_failed:" + (r.stderr ? r.stderr.toString().slice(0, 200) : r.status));
}

const MODE = process.argv[2], BASE = process.argv[3], MASK = process.argv[4], OUT = process.argv[5];
if (!MODE || !BASE || !MASK || !OUT) { console.error("usage: <mode> <basePng> <maskPng> <outDir> [matId colorIdx]"); process.exit(1); }
const REPLICATE = process.env.REPLICATE_API_TOKEN || "";
if (!REPLICATE) { console.error("no REPLICATE_API_TOKEN"); process.exit(1); }

// ── ROOF_CATALOG mirror (id + per-color AI prompt) — must match roof3d.html ~L4735-4783.
const ROOF_CATALOG = [
  { id: "arch", colors: [
    { n: "Weathered Wood", p: "weathered-wood architectural asphalt shingles, warm light gray-brown wood-shake tone" },
    { n: "Charcoal", p: "charcoal-black architectural asphalt shingles" },
    { n: "Pewter Gray", p: "pewter light-gray architectural asphalt shingles" },
    { n: "Barkwood", p: "barkwood dark natural-brown architectural asphalt shingles" },
    { n: "Driftwood", p: "driftwood weathered gray-brown architectural asphalt shingles" },
    { n: "Estate Gray", p: "medium estate-gray architectural asphalt shingles" },
    { n: "Hickory", p: "hickory rich walnut-brown architectural asphalt shingles" },
    { n: "Slate Blend", p: "blue-gray slate-blend architectural asphalt shingles" },
    { n: "Onyx Black", p: "true onyx-black architectural asphalt shingles" },
    { n: "Hunter Green", p: "deep hunter-green architectural asphalt shingles" } ] },
  { id: "3tab", colors: [
    { n: "Charcoal", p: "charcoal-gray 3-tab asphalt shingles" },
    { n: "Weathered Wood", p: "weathered-wood 3-tab asphalt shingles" },
    { n: "Driftwood", p: "driftwood gray-brown 3-tab asphalt shingles" },
    { n: "Silver Gray", p: "silver-gray 3-tab asphalt shingles" },
    { n: "Autumn Brown", p: "autumn-brown 3-tab asphalt shingles" },
    { n: "Slate Gray", p: "slate-gray 3-tab asphalt shingles" } ] },
  { id: "metal", colors: [
    { n: "Matte Black", p: "matte black standing-seam metal roof" },
    { n: "Charcoal", p: "charcoal-gray standing-seam metal roof" },
    { n: "Slate Gray", p: "slate-gray standing-seam metal roof" },
    { n: "Dark Bronze", p: "dark bronze standing-seam metal roof" },
    { n: "Galvalume", p: "bare galvalume silver metallic standing-seam metal roof" },
    { n: "Regal Blue", p: "regal blue standing-seam metal roof" },
    { n: "Forest Green", p: "forest-green standing-seam metal roof" },
    { n: "Colonial Red", p: "colonial red standing-seam metal roof" },
    { n: "Copper", p: "copper-metallic standing-seam metal roof" } ] },
  { id: "clay", colors: [
    { n: "Natural Red", p: "natural red terracotta clay barrel roof tiles" },
    { n: "Sand", p: "sand-buff clay barrel roof tiles" },
    { n: "Brown Blend", p: "brown-blend clay barrel roof tiles" },
    { n: "Tobacco", p: "tobacco-brown clay barrel roof tiles" },
    { n: "Burgundy", p: "burgundy-blend clay barrel roof tiles" },
    { n: "Aged Mission", p: "aged-mission multi-tone clay barrel roof tiles" } ] },
  { id: "slate", colors: [
    { n: "Gray", p: "gray natural slate roof tiles" },
    { n: "Black", p: "black natural slate roof tiles" },
    { n: "Purple", p: "purple natural slate roof tiles" },
    { n: "Green", p: "green natural slate roof tiles" },
    { n: "Red", p: "red natural slate roof tiles" },
    { n: "Mottled", p: "mottled purple-green blend natural slate roof tiles" } ] },
  { id: "cedar", colors: [
    { n: "New Cedar", p: "new western-red-cedar wood shake roof, warm reddish-brown" },
    { n: "Honey", p: "honey-amber cedar wood shake roof" },
    { n: "Light Brown", p: "light-brown cedar wood shake roof" },
    { n: "Chocolate", p: "chocolate-brown cedar wood shake roof" },
    { n: "Weathered Gray", p: "weathered silver-gray aged cedar wood shake roof" } ] },
];

// ── compositeThroughMask — exact port of server/services/roofQuote/roofMask.ts.
function compositeThroughMask(origBuf, resultBuf, maskPng) {
  const orig = PNG.sync.read(origBuf), res = PNG.sync.read(resultBuf);
  const w = orig.width, h = orig.height;
  const out = new PNG({ width: w, height: h });
  const sampleRes = (x, y) => {
    const rx = res.width === w ? x : Math.min(res.width - 1, Math.round((x / w) * res.width));
    const ry = res.height === h ? y : Math.min(res.height - 1, Math.round((y / h) * res.height));
    return (ry * res.width + rx) << 2;
  };
  let changed = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) << 2;
    if (maskPng.data[i] > 127) {
      const r = sampleRes(x, y);
      out.data[i] = res.data[r]; out.data[i + 1] = res.data[r + 1]; out.data[i + 2] = res.data[r + 2]; out.data[i + 3] = 255;
      changed++;
    } else {
      out.data[i] = orig.data[i]; out.data[i + 1] = orig.data[i + 1]; out.data[i + 2] = orig.data[i + 2]; out.data[i + 3] = 255;
    }
  }
  return { buf: PNG.sync.write(out), changedFrac: changed / (w * h) };
}

function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx];
}

// ── Gap detector: inside the roof mask, find the plane(s) the recolor LEFT GRAY when the
// target material is a COLOURED (chromatic) material. Key insight: a leftover unrecolored plane is
// ACHROMATIC (R≈G≈B, chroma = max-min ≈ 0) at mid value, whereas even pale/sunlit coloured tiles
// keep a clear hue tint (e.g. terracotta stays R>G>B). So we flag mid-value, near-neutral roof
// pixels as gaps. We do NOT compare to the base (Kontext re-encodes the whole frame, drifting even
// untouched planes) and we do NOT flag "gray" absolutely — for an inherently-gray material the
// WHOLE roof is near-neutral, so we measure the roof's MEDIAN chroma first and DISABLE gap-fill
// when the material itself is gray (a leftover gray plane is invisible there; nothing to detect).
// chroma is in 0-255. Returns a 1-channel mask PNG (white = leftover/gap) + gap fraction.
const NEUT = Number(process.env.NEUT || 22);        // chroma below this = achromatic (gray)
const VMIN = Number(process.env.VMIN || 45);        // ignore deep eave shadows
const VMAX = Number(process.env.VMAX || 235);       // ignore white specular glints
const MED_CHROMA_MIN = Number(process.env.MED_CHROMA_MIN || 16); // material gray -> skip gap-fill
function detectUnrecoloredMask(origBuf, resultBuf, maskPng) {
  const res = PNG.sync.read(resultBuf);
  const w = maskPng.width, h = maskPng.height;
  const sampleRes = (x, y) => {
    const rx = res.width === w ? x : Math.min(res.width - 1, Math.round((x / w) * res.width));
    const ry = res.height === h ? y : Math.min(res.height - 1, Math.round((y / h) * res.height));
    return (ry * res.width + rx) << 2;
  };
  // pass 1: median chroma of recolored roof -> is this a coloured or a gray material?
  const chromas = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) << 2; if (maskPng.data[i] <= 127) continue;
    const r = sampleRes(x, y);
    chromas.push(Math.max(res.data[r], res.data[r + 1], res.data[r + 2]) - Math.min(res.data[r], res.data[r + 1], res.data[r + 2]));
  }
  chromas.sort((a, b) => a - b);
  const medChroma = chromas.length ? chromas[chromas.length >> 1] : 0;
  const grayMaterial = medChroma < MED_CHROMA_MIN; // whole roof near-neutral -> nothing to detect
  const gap = new PNG({ width: w, height: h });
  let roofN = 0, gapN = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) << 2;
    let v = 0;
    if (maskPng.data[i] > 127) {
      roofN++;
      if (!grayMaterial) {
        const r = sampleRes(x, y);
        const mx = Math.max(res.data[r], res.data[r + 1], res.data[r + 2]);
        const mn = Math.min(res.data[r], res.data[r + 1], res.data[r + 2]);
        if (mx - mn < NEUT && mx >= VMIN && mx <= VMAX) { v = 255; gapN++; }
      }
    }
    gap.data[i] = gap.data[i + 1] = gap.data[i + 2] = v; gap.data[i + 3] = 255;
  }
  return { png: gap, gapFrac: roofN ? gapN / roofN : 0, gapN, roofN, medSat: medChroma };
}

// Dilate a 1-channel mask PNG by r px (square SE), but never grow OUTSIDE the roof mask
// (so a gap-fill inpaint can blend into recolored neighbours yet still be composited away
// outside the roof). Returns a new PNG.
function dilateWithin(srcPng, roofPng, r) {
  const w = srcPng.width, h = srcPng.height;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) << 2;
    let on = srcPng.data[i] > 127;
    if (!on && roofPng.data[i] > 127) {
      for (let dy = -r; dy <= r && !on; dy++) for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (srcPng.data[(ny * w + nx) << 2] > 127) { on = true; break; }
      }
    }
    const v = on ? 255 : 0;
    out.data[i] = out.data[i + 1] = out.data[i + 2] = v; out.data[i + 3] = 255;
  }
  return out;
}

function countWhite(png) { let n = 0; for (let p = 0; p < png.width * png.height; p++) if (png.data[p << 2] > 127) n++; return n; }

// ── outsideMeanDiff proof — port of roofMask.diffOutsideMask (only outside stats here).
function outsideDiff(aBuf, bBuf, maskPng) {
  const a = PNG.sync.read(aBuf), b = PNG.sync.read(bBuf);
  const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
  let outSum = 0, outN = 0, outMax = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ia = (y * a.width + x) << 2, im = (y * maskPng.width + x) << 2;
    if (maskPng.data[im] > 127) continue;
    const d = (Math.abs(a.data[ia] - b.data[ia]) + Math.abs(a.data[ia + 1] - b.data[ia + 1]) + Math.abs(a.data[ia + 2] - b.data[ia + 2])) / 3;
    outSum += d; outN++; if (d > outMax) outMax = d;
  }
  return { mean: outN ? outSum / outN : 0, max: outMax };
}

// ── fluxFillInpaint — exact port of roofQuoteService.ts (street-view variant prompt).
async function fluxFillInpaint(imgPngB64, maskPngB64, material) {
  const prompt =
    "Photo of a house. The masked roof is now covered entirely in " + material +
    ". Photorealistic roofing texture, the whole masked roof surface this exact colour and material, sharp, " +
    "with shadows and lighting matching the rest of the photo. Keep the exact same roof shape, ridges, hips and outline.";
  const GUIDANCE = Number(process.env.FLUX_GUIDANCE || 3);
  const STEPS = Number(process.env.FLUX_STEPS || 50);
  const body = { input: { image: "data:image/png;base64," + imgPngB64, mask: "data:image/png;base64," + maskPngB64, prompt, steps: STEPS, guidance: GUIDANCE, output_format: "png", safety_tolerance: 2 } };
  const rr = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-fill-pro/predictions", {
    method: "POST", headers: { Authorization: "Bearer " + REPLICATE, "Content-Type": "application/json", Prefer: "wait" }, body: JSON.stringify(body),
  });
  let j = await rr.json();
  let tries = 0;
  while (j.status && !["succeeded", "failed", "canceled"].includes(j.status) && tries < 60) {
    if (!j.urls || !j.urls.get) throw new Error("flux_fill_no_poll_url:" + (j.error || j.status || "?"));
    await new Promise((s) => setTimeout(s, 1500));
    j = await (await fetch(j.urls.get, { headers: { Authorization: "Bearer " + REPLICATE } })).json();
    tries++;
  }
  if (j.status !== "succeeded") throw new Error("flux_fill_" + (j.error || j.status || "failed"));
  const out = Array.isArray(j.output) ? j.output[0] : j.output;
  if (!out) throw new Error("flux_fill_no_output");
  const ab = await fetch(out).then((r) => r.arrayBuffer());
  return Buffer.from(new Uint8Array(ab));
}

// ── Flux-Kontext-pro FULL-FRAME repaint (true img2img, STRONG recolor). Gable-bleed is fine —
// we discard every out-of-mask pixel via compositeThroughMask afterwards. Mirrors the street
// prompt in showroom-render.mjs / roofPrompt(view:"street").
async function kontextRepaint(imgPngB64, material, seed) {
  const prompt =
    "Edit THIS exact photo of a house. Recolor the COMPLETE roof of the main house with " + material +
    " — every single slope, plane, face, hip and ridge, including the right-side roof slope and any " +
    "secondary garage/wing roof, fully and uniformly. Leave NO original gray roof anywhere: every roof " +
    "surface visible in the photo must become this exact material with the same texture and tone across " +
    "all planes. Keep the IDENTICAL same house from the input photo — same siding, stone accents, " +
    "windows, doors, porch, columns, garage doors, gutters, fence, lawn, driveway, shrubs, trees, sky, " +
    "camera angle and lighting. Do NOT generate a new or different house, building or scene; preserve " +
    "every other pixel exactly. Photorealistic, sharp, natural realistic roof colour, the WHOLE roof " +
    "clearly and uniformly this exact material with no patch of original gray left.";
  const input = { prompt, input_image: "data:image/png;base64," + imgPngB64, output_format: "png", safety_tolerance: 2 };
  if (seed != null) input.seed = seed;
  const body = { input };
  const rr = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions", {
    method: "POST", headers: { Authorization: "Bearer " + REPLICATE, "Content-Type": "application/json", Prefer: "wait" }, body: JSON.stringify(body),
  });
  let j = await rr.json();
  let tries = 0;
  while (j.status && !["succeeded", "failed", "canceled"].includes(j.status) && tries < 60) {
    if (!j.urls || !j.urls.get) throw new Error("kontext_no_poll_url:" + (j.error || j.status || "?"));
    await new Promise((s) => setTimeout(s, 1500));
    j = await (await fetch(j.urls.get, { headers: { Authorization: "Bearer " + REPLICATE } })).json();
    tries++;
  }
  if (j.status !== "succeeded") throw new Error("kontext_" + (j.error || j.status || "failed"));
  const out = Array.isArray(j.output) ? j.output[0] : j.output;
  if (!out) throw new Error("kontext_no_output");
  const ab = await fetch(out).then((r) => r.arrayBuffer());
  return Buffer.from(new Uint8Array(ab));
}

const baseBuf = readFileSync(BASE);
const maskBuf = readFileSync(MASK);
const maskPng = PNG.sync.read(maskBuf);
const imgB64 = baseBuf.toString("base64");
const maskB64 = maskBuf.toString("base64");
// ENGINE: "kontext" (default, NEW technique = strong full-frame recolor → composite through mask)
// or "fill" (Flux-Fill masked inpaint — weak on sunlit/dark materials).
const ENGINE = (process.env.ENGINE || "kontext").toLowerCase();
const SAVE_RAW = process.env.SAVE_RAW === "1"; // also dump the pre-composite repaint for inspection

// Gap-fill tuning. GAP_FRAC_OK: stop once the low-saturation leftover roof is <= this fraction.
// GAP_PASSES: max targeted inpaint passes. GAP_DILATE: grow the gap sub-mask (within roof) before
// inpaint so the patch blends with already-recolored neighbours. MIN_GAP_PX: ignore tiny specks.
const GAP_FRAC_OK = Number(process.env.GAP_FRAC_OK || 0.02);
// Default OFF: the showroom's "half-finished roof" was a MASK gap (the right hip facet was
// missing from the flood-fill mask), now fixed in scripts/showroom-assets/mask.png — Kontext
// itself covers every plane. The targeted gap-fill below remains available as an opt-in safety
// net (set GAP_PASSES>0) for any future base whose Kontext recolor leaves a real gray plane.
const GAP_PASSES = Number(process.env.GAP_PASSES || 0);
const GAP_DILATE = Number(process.env.GAP_DILATE || 8);
const MIN_GAP_PX = Number(process.env.MIN_GAP_PX || 1200);

async function renderOne(material, outPng) {
  let raw = ENGINE === "fill"
    ? await fluxFillInpaint(imgB64, maskB64, material)
    : await kontextRepaint(imgB64, material);
  if (SAVE_RAW) writeFileSync(outPng.replace(/\.png$/, "__raw.png"), raw);

  // ── Targeted gap-fill: ensure EVERY roof plane is recolored uniformly (no leftover gray slope
  // on a coloured roof). After the recolor, find roof pixels far below the recolored median
  // saturation (a leftover gray plane), dilate that region (within the roof), and inpaint ONLY
  // there toward the material. Auto-skips for gray materials (nothing to detect). Repeat.
  let gapInfo = detectUnrecoloredMask(baseBuf, raw, maskPng);
  const medSat0 = gapInfo.medSat;
  let passes = 0;
  while (gapInfo.gapN > MIN_GAP_PX && gapInfo.gapFrac > GAP_FRAC_OK && passes < GAP_PASSES) {
    const sub = dilateWithin(gapInfo.png, maskPng, GAP_DILATE);
    const subB64 = PNG.sync.write(sub).toString("base64");
    const rawB64 = raw.toString("base64");
    process.stdout.write(`[gapfill p${passes + 1} gap=${(gapInfo.gapFrac * 100).toFixed(1)}% (${gapInfo.gapN}px) submask=${countWhite(sub)}px] `);
    const patched = await fluxFillInpaint(rawB64, subB64, material);
    // Composite the inpaint result back through the SUB mask onto the current raw so the
    // already-good regions are byte-stable and only the leftover plane is replaced.
    const merged = compositeThroughMask(raw, patched, sub);
    raw = merged.buf;
    passes++;
    gapInfo = detectUnrecoloredMask(baseBuf, raw, maskPng);
  }
  const gapFracFinal = gapInfo.gapFrac;
  if (SAVE_RAW && passes > 0) writeFileSync(outPng.replace(/\.png$/, "__filled.png"), raw);

  const comp = compositeThroughMask(baseBuf, raw, maskPng);
  writeFileSync(outPng, comp.buf);
  const diff = outsideDiff(baseBuf, comp.buf, maskPng);
  return { changedFrac: comp.changedFrac, outsideMean: diff.mean, outsideMax: diff.max, gapFrac: gapFracFinal, gapPasses: passes, medSat: medSat0 };
}

function jpg(pngPath) { return pngPath.replace(/\.png$/, ".jpg"); }

async function main() {
  if (MODE === "heroes") {
    for (const m of ROOF_CATALOG) {
      const hero = m.colors[0];
      const outPng = path.join(OUT, `hero-${m.id}.png`);
      process.stdout.write(`render hero ${m.id} (${hero.n})... `);
      try {
        const s = await renderOne(hero.p, outPng);
        console.log(`OK changed=${(s.changedFrac * 100).toFixed(1)}% gap=${(s.gapFrac * 100).toFixed(2)}%(${s.gapPasses}p,medSat=${s.medSat.toFixed(2)}) outsideMean=${s.outsideMean.toFixed(3)} outsideMax=${s.outsideMax} -> ${path.basename(outPng)}`);
      } catch (e) { console.log("FAIL", e.message); }
    }
  } else if (MODE === "one") {
    const matId = process.argv[6], ci = Number(process.argv[7]);
    const m = ROOF_CATALOG.find((x) => x.id === matId), c = m.colors[ci];
    const outPng = path.join(OUT, `${matId}__${c.n}.png`);
    process.stdout.write(`render ${matId}/${c.n}... `);
    const s = await renderOne(c.p, outPng);
    console.log(`OK changed=${(s.changedFrac * 100).toFixed(1)}% gap=${(s.gapFrac * 100).toFixed(2)}%(${s.gapPasses}p,medSat=${s.medSat.toFixed(2)}) outsideMean=${s.outsideMean.toFixed(3)} outsideMax=${s.outsideMax}`);
  } else if (MODE === "full") {
    const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    // generatedAt MUST be passed in (committed manifest must not embed a wall-clock Date.now()).
    const generatedAt = process.env.GENERATED_AT;
    if (!generatedAt) { console.error("set GENERATED_AT (ISO timestamp) for full mode"); process.exit(1); }
    const manifest = { materials: {}, baseHouseLabel: process.env.BASE_LABEL || "Single-story gable home (AI showroom)", generatedAt };
    let ok = 0, fail = 0;
    for (const m of ROOF_CATALOG) {
      manifest.materials[m.id] = manifest.materials[m.id] || {};
      for (const c of m.colors) {
        const fname = `${m.id}__${slug(c.n)}.jpg`;
        const outPng = path.join(OUT, fname.replace(/\.jpg$/, ".png"));
        const outJpg = path.join(OUT, fname);
        process.stdout.write(`render ${m.id}/${c.n}... `);
        // Idempotent: a successfully-rendered jpg already on disk is kept (re-runs only attempt the gaps;
        // the manifest is always rebuilt from what exists, so partial runs accumulate to the full set).
        if (existsSync(outJpg)) { manifest.materials[m.id][c.n] = fname; console.log("SKIP exists"); ok++; continue; }
        try {
          const s = await renderOne(c.p, outPng);
          pngToJpg(outPng, outJpg);
          rmSync(outPng, { force: true });
          manifest.materials[m.id][c.n] = fname;
          console.log(`OK changed=${(s.changedFrac * 100).toFixed(1)}% outsideMax=${s.outsideMax} -> ${fname}`);
          ok++;
        } catch (e) { console.log("FAIL", e.message); fail++; await new Promise(r => setTimeout(r, 4000)); }
      }
    }
    writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
    console.log(`FULL done ok=${ok} fail=${fail} manifest -> ${path.join(OUT, "manifest.json")}`);
  } else { console.error("mode not supported here:", MODE); process.exit(1); }
  console.log("DONE");
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });

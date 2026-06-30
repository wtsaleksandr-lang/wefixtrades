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
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

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
async function kontextRepaint(imgPngB64, material) {
  const prompt =
    "Edit THIS exact photo of a house. Replace ONLY the visible roof covering (the sloped roof " +
    "surfaces) of the main house with " + material + ", covering the whole visible roof. Keep the " +
    "IDENTICAL same house from the input photo — same siding, stone accents, windows, doors, porch, " +
    "columns, garage doors, gutters, fence, lawn, driveway, shrubs, trees, sky, camera angle and " +
    "lighting. Do NOT generate a new or different house, building or scene; preserve every other " +
    "pixel exactly. Photorealistic, sharp, natural realistic roof colour, the roof clearly this exact material.";
  const body = { input: { prompt, input_image: "data:image/png;base64," + imgPngB64, output_format: "png", safety_tolerance: 2 } };
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

async function renderOne(material, outPng) {
  const raw = ENGINE === "fill"
    ? await fluxFillInpaint(imgB64, maskB64, material)
    : await kontextRepaint(imgB64, material);
  if (SAVE_RAW) writeFileSync(outPng.replace(/\.png$/, "__raw.png"), raw);
  const comp = compositeThroughMask(baseBuf, raw, maskPng);
  writeFileSync(outPng, comp.buf);
  const diff = outsideDiff(baseBuf, comp.buf, maskPng);
  return { changedFrac: comp.changedFrac, outsideMean: diff.mean, outsideMax: diff.max };
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
        console.log(`OK changed=${(s.changedFrac * 100).toFixed(1)}% outsideMean=${s.outsideMean.toFixed(3)} outsideMax=${s.outsideMax} -> ${path.basename(outPng)}`);
      } catch (e) { console.log("FAIL", e.message); }
    }
  } else if (MODE === "one") {
    const matId = process.argv[6], ci = Number(process.argv[7]);
    const m = ROOF_CATALOG.find((x) => x.id === matId), c = m.colors[ci];
    const outPng = path.join(OUT, `${matId}__${c.n}.png`);
    process.stdout.write(`render ${matId}/${c.n}... `);
    const s = await renderOne(c.p, outPng);
    console.log(`OK changed=${(s.changedFrac * 100).toFixed(1)}% outsideMean=${s.outsideMean.toFixed(3)} outsideMax=${s.outsideMax}`);
  } else { console.error("mode not supported here:", MODE); process.exit(1); }
  console.log("DONE");
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });

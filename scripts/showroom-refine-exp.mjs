// EXPERIMENT runner for refining arch/3tab/slate/cedar roof texture quality.
// Reuses the committed pipeline's base/mask + compositeThroughMask byte-lock, but exposes
// per-material Kontext prompt + clarity knobs so we can sweep settings to get crisp+distinct roofs.
// Metal/clay are NOT rendered here (locked). Does NOT touch roof3d.html or committed catalog.
//
//   node showroom-refine-exp.mjs <baseStem> <maskPng> <outDir> <matId> <tag>
// Env knobs:
//   KPROMPT       – full Kontext material clause (overrides built-in) [optional]
//   CLARITY       – "1" to run clarity upscale (default on here)
//   CLARITY_SCALE (2) CLARITY_CREATIVITY (0.3) CLARITY_RESEMBLANCE (1.2)
//   CLARITY_SHARPEN (1) CLARITY_STEPS (28) CLARITY_DYNAMIC (6)
//   CLARITY_PROMPT – texture prompt for the upscaler
//   SAVE_RAW      – "1" dump pre-composite raw + clarity intermediates
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { PNG } from "pngjs";

const BASE = process.argv[2], MASK = process.argv[3], OUT = process.argv[4], MATID = process.argv[5], TAG = process.argv[6] || "exp";
if (!BASE || !MASK || !OUT || !MATID) { console.error("usage: <basePng> <maskPng> <outDir> <matId> <tag>"); process.exit(1); }
const REPLICATE = process.env.REPLICATE_API_TOKEN || "";
if (!REPLICATE) { console.error("no REPLICATE_API_TOKEN"); process.exit(1); }

function pngToJpg(pngPath, jpgPath, q = Number(process.env.JPG_Q || 3)) {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", pngPath, "-q:v", String(q), jpgPath], { stdio: ["ignore", "ignore", "pipe"] });
  if (r.status !== 0) throw new Error("ffmpeg_jpg_failed:" + (r.stderr ? r.stderr.toString().slice(0, 200) : r.status));
}

// ── Built-in STRONG material clauses (structure + relief + crispness baked in).
const MAT = {
  arch: {
    // Weathered Wood – thick DIMENSIONAL laminated shingles, varied tab widths, deep shadow bands.
    material: "premium THICK dimensional laminated architectural asphalt shingles in a warm weathered-wood gray-brown tone",
    clause:
      "The roof is covered in premium THICK DIMENSIONAL laminated architectural asphalt shingles, warm weathered-wood gray-brown color. " +
      "The shingles are chunky and layered with a random staggered look, tabs of VARIED widths, and PRONOUNCED DEEP SHADOW BANDS between each course so the roof looks three-dimensional and heavily textured. " +
      "Crisp sharp individual shingle tabs with strong shadow lines, high-relief, photorealistic.",
  },
  "3tab": {
    // Charcoal – FLAT thin uniform 3-tab, crisp straight horizontal lines, cheap flat look.
    material: "flat thin uniform charcoal-gray 3-tab asphalt shingles",
    clause:
      "The roof is covered in FLAT, THIN, UNIFORM charcoal-gray 3-tab asphalt shingles. " +
      "The tabs are evenly-spaced and identical, arranged in perfectly straight crisp horizontal rows with thin clean vertical slots between the repeating tabs. " +
      "Deliberately FLAT and low-profile with only subtle shadow lines — a cheap, uniform, no-dimension shingle. Crisp sharp straight lines, photorealistic, no random staggering.",
  },
  slate: {
    // Gray – flat rectangular STONE tiles, crisp straight edges, hard mineral, per-tile tone.
    material: "flat rectangular gray natural slate stone roof tiles",
    clause:
      "The roof is covered in flat RECTANGULAR gray natural SLATE STONE tiles. " +
      "Each tile is a hard, flat, smooth mineral rectangle with CRISP STRAIGHT EDGES, laid in neat overlapping courses with clean straight horizontal and vertical grout lines. " +
      "Subtle tile-to-tile tone variation from light to dark gray, a hard cool STONE look — NOT granular asphalt, NOT wood. Crisp sharp tile edges, photorealistic.",
  },
  cedar: {
    // New Cedar – wood SHAKE, vertical grain, thick rough hand-split staggered, reddish-brown.
    material: "hand-split western red cedar wood shake shingles, warm reddish-brown",
    clause:
      "The roof is covered in HAND-SPLIT WESTERN RED CEDAR WOOD SHAKE shingles, warm reddish-brown natural wood color. " +
      "Each shake is a thick, rough, individual piece of split wood with VISIBLE VERTICAL WOOD GRAIN, irregular widths and a chunky staggered layout with deep shadow gaps between the thick shakes. " +
      "Clearly natural split WOOD with grain and knots, warm cedar tones — NOT asphalt, NOT stone. Crisp sharp individual shakes with strong shadows, photorealistic.",
  },
};

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

async function poll(j) {
  let tries = 0;
  while (j.status && !["succeeded", "failed", "canceled"].includes(j.status) && tries < 120) {
    if (!j.urls || !j.urls.get) throw new Error("no_poll_url:" + (j.error || j.status || "?"));
    await new Promise((s) => setTimeout(s, 1800));
    j = await (await fetch(j.urls.get, { headers: { Authorization: "Bearer " + REPLICATE } })).json();
    tries++;
  }
  if (j.status !== "succeeded") throw new Error(j.error || j.status || "failed");
  const out = Array.isArray(j.output) ? j.output[0] : j.output;
  if (!out) throw new Error("no_output");
  const ab = await fetch(out).then((r) => r.arrayBuffer());
  return Buffer.from(new Uint8Array(ab));
}

async function kontextRepaint(imgPngB64, clause) {
  const prompt =
    "Edit THIS exact photo of a house. " + clause + " " +
    "Recolor and retexture EVERY single slope, plane, face, hip and ridge of the main house roof — including the right-side slope and any secondary garage/wing roof — fully and uniformly with this material and texture. Leave NO original gray roof anywhere. " +
    "Keep the IDENTICAL same house: same siding, stone accents, windows, doors, porch, columns, garage doors, gutters, fence, lawn, driveway, shrubs, trees, sky, camera angle and lighting. " +
    "Do NOT generate a new or different house; preserve every non-roof pixel exactly. Photorealistic, extremely sharp and crisp roof texture with deep shadow lines, high detail.";
  const input = { prompt, input_image: "data:image/png;base64," + imgPngB64, output_format: "png", safety_tolerance: 2 };
  const rr = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions", {
    method: "POST", headers: { Authorization: "Bearer " + REPLICATE, "Content-Type": "application/json", Prefer: "wait" }, body: JSON.stringify({ input }),
  });
  return poll(await rr.json());
}

async function clarityUpscale(imgPngB64) {
  const version = process.env.CLARITY_VERSION ||
    "dfad41707589d68ecdccd1dfa600d55a208f9310748e44bfe35b4a6291453d5e";
  const input = {
    image: "data:image/png;base64," + imgPngB64,
    scale_factor: Number(process.env.CLARITY_SCALE || 2),
    creativity: Number(process.env.CLARITY_CREATIVITY || 0.3),
    resemblance: Number(process.env.CLARITY_RESEMBLANCE || 1.2),
    dynamic: Number(process.env.CLARITY_DYNAMIC || 6),
    sharpen: Number(process.env.CLARITY_SHARPEN || 1),
    num_inference_steps: Number(process.env.CLARITY_STEPS || 28),
    output_format: "png",
    prompt: process.env.CLARITY_PROMPT ||
      "high resolution photo of a house, crisp sharp realistic roof texture with deep shadow lines between shingle courses, fine detailed roofing material, natural daylight",
  };
  const rr = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST", headers: { Authorization: "Bearer " + REPLICATE, "Content-Type": "application/json", Prefer: "wait" }, body: JSON.stringify({ version, input }),
  });
  return poll(await rr.json());
}

const baseBuf = readFileSync(BASE);
const maskBuf = readFileSync(MASK);
const maskPng = PNG.sync.read(maskBuf);
const SAVE_RAW = process.env.SAVE_RAW === "1";
const CLARITY = (process.env.CLARITY ?? "1") === "1";

async function main() {
  const spec = MAT[MATID];
  if (!spec) { console.error("no material clause for", MATID); process.exit(1); }
  const clause = process.env.KPROMPT || spec.clause;
  const stem = `${MATID}__${TAG}`;
  const outJpg = path.join(OUT, `${stem}.jpg`);
  const outPng = path.join(OUT, `${stem}.png`);
  process.stdout.write(`[${MATID}/${TAG}] kontext... `);
  let raw = await kontextRepaint(baseBuf.toString("base64"), clause);
  if (SAVE_RAW) writeFileSync(path.join(OUT, `${stem}__raw.png`), raw);
  if (CLARITY) {
    process.stdout.write(`clarity(cr=${process.env.CLARITY_CREATIVITY || 0.3},res=${process.env.CLARITY_RESEMBLANCE || 1.2},sh=${process.env.CLARITY_SHARPEN || 1})... `);
    raw = await clarityUpscale(raw.toString("base64"));
    if (SAVE_RAW) writeFileSync(path.join(OUT, `${stem}__clarity.png`), raw);
  }
  const comp = compositeThroughMask(baseBuf, raw, maskPng);
  writeFileSync(outPng, comp.buf);
  const diff = outsideDiff(baseBuf, comp.buf, maskPng);
  pngToJpg(outPng, outJpg);
  console.log(`OK changed=${(comp.changedFrac * 100).toFixed(1)}% outsideMax=${diff.max} outsideMean=${diff.mean.toFixed(3)} -> ${path.basename(outJpg)}`);
}
main().catch((e) => { console.error("FATAL", e.message); process.exit(1); });

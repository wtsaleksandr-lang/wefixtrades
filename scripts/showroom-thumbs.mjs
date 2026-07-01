// Premium material THUMBNAILS — one photoreal, straight-on close-up per material family, the
// material FILLING the square frame (like a real roof-texture swatch), all rendered with the SAME
// lighting / camera / framing prompt so the set looks consistent. Then a uniform post-grade (same
// brightness/contrast/saturation via ffmpeg eq) is applied to ALL so they read as one set.
//
// Output: server/roofQuote/assets/showroom/thumbs/<materialId>.jpg (square, selector size)
//     +   server/roofQuote/assets/showroom/thumbs/<materialId>@2x.jpg (higher-res, magnifier modal)
//
// usage: node showroom-thumbs.mjs <outDir> [onlyId]
// run:   doppler run --scope "C:\Users\Owner" -p wefixtrades -c prd -- node scripts/showroom-thumbs.mjs <outDir>
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const OUTDIR = process.argv[2];
const ONLY = process.argv[3] || "";
if (!OUTDIR) { console.error("usage: <outDir> [onlyId]"); process.exit(1); }
const REPLICATE = process.env.REPLICATE_API_TOKEN || "";
if (!REPLICATE) { console.error("no REPLICATE_API_TOKEN"); process.exit(1); }
mkdirSync(OUTDIR, { recursive: true });

// SHARED framing/lighting clause — identical for every material so the set is consistent.
const COMMON =
  "Extreme close-up macro photograph of a roof surface, photographed perfectly straight-on from " +
  "directly above so the material fills the entire square frame edge to edge, flat-lay swatch, no " +
  "sky, no roof edge, no house, no background — only the roofing material texture. Even soft " +
  "overhead daylight, neutral white balance, crisp ultra-sharp focus, fine realistic detail, " +
  "high resolution, photorealistic product swatch, no text, no watermark.";

const MATERIALS = [
  { id: "arch",  desc: "architectural dimensional asphalt shingles in a warm weathered-wood gray-brown tone, staggered overlapping tabs with subtle shadow lines and granular sandpaper texture" },
  { id: "3tab",  desc: "flat three-tab asphalt shingles in a medium slate-gray tone, even horizontal rows with regular vertical tab slots and fine granular texture" },
  { id: "metal", desc: "matte charcoal-graphite standing-seam metal roofing, clean parallel raised vertical seams, smooth low-sheen painted metal panels" },
  { id: "clay",  desc: "natural terracotta red clay barrel roof tiles, rows of half-round curved Spanish mission tiles with warm earthy color variation and soft highlights" },
  { id: "slate", desc: "natural slate roof tiles in a blue-gray tone, overlapping rectangular stone shingles with slightly uneven riven surfaces and subtle color mottling" },
  { id: "cedar", desc: "western red cedar wood shake roofing, rows of hand-split rough wood shakes with visible grain, warm reddish-brown tone and natural texture variation" },
];

async function flux(prompt, seed) {
  const input = { prompt, aspect_ratio: "1:1", output_format: "png", output_quality: 100, safety_tolerance: 2 };
  if (seed != null) input.seed = seed;
  const rr = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions", {
    method: "POST", headers: { Authorization: "Bearer " + REPLICATE, "Content-Type": "application/json", Prefer: "wait" }, body: JSON.stringify({ input }),
  });
  let j = await rr.json();
  let tries = 0;
  while (j.status && !["succeeded", "failed", "canceled"].includes(j.status) && tries < 60) {
    if (!j.urls || !j.urls.get) throw new Error("no_poll_url:" + (j.error || j.status || "?"));
    await new Promise((s) => setTimeout(s, 1500));
    j = await (await fetch(j.urls.get, { headers: { Authorization: "Bearer " + REPLICATE } })).json();
    tries++;
  }
  if (j.status !== "succeeded") throw new Error("thumb_" + (j.error || j.status || "failed"));
  const out = Array.isArray(j.output) ? j.output[0] : j.output;
  const ab = await fetch(out).then((r) => r.arrayBuffer());
  return Buffer.from(new Uint8Array(ab));
}

// Uniform post-grade + resize. Same eq values for every material so the set matches.
const BRI = process.env.GRADE_BRI || "0.02";
const CON = process.env.GRADE_CON || "1.06";
const SAT = process.env.GRADE_SAT || "1.05";
const GAM = process.env.GRADE_GAM || "1.0";
function grade(srcPng, outJpg, size) {
  const vf = `eq=brightness=${BRI}:contrast=${CON}:saturation=${SAT}:gamma=${GAM},scale=${size}:${size}:flags=lanczos`;
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", srcPng, "-vf", vf, "-q:v", "2", outJpg], { stdio: ["ignore", "ignore", "pipe"] });
  if (r.status !== 0) throw new Error("grade_failed:" + (r.stderr ? r.stderr.toString().slice(0, 200) : r.status));
}

async function main() {
  for (let i = 0; i < MATERIALS.length; i++) {
    const m = MATERIALS[i];
    if (ONLY && m.id !== ONLY) continue;
    const rawPng = path.join(OUTDIR, `${m.id}__raw.png`);
    process.stdout.write(`thumb ${m.id}... `);
    try {
      const buf = await flux(m.desc + ". " + COMMON, 100 + i); // fixed per-id seed = reproducible
      writeFileSync(rawPng, buf);
      grade(rawPng, path.join(OUTDIR, `${m.id}@2x.jpg`), Number(process.env.SIZE2X || 1024));
      grade(rawPng, path.join(OUTDIR, `${m.id}.jpg`), Number(process.env.SIZE1X || 512));
      console.log("OK");
    } catch (e) { console.log("FAIL", e.message); }
  }
  console.log("THUMBS DONE ->", OUTDIR);
}
main().catch((e) => { console.error("FATAL", e.message); process.exit(1); });

// Gen SINGLE-PLANE GABLE base houses for the showroom.
// ROOT-CAUSE FIX for roof material-mixing: the recolor treats each roof plane independently, so a
// multi-plane roof (hip + gables + dormer + garage) always mismatches textures across planes. The
// cure is a house whose roof is essentially ONE dominant plane facing the camera — one surface to
// recolor, nothing to mismatch.
//
// HARD requirements per candidate:
//  - ONE large unbroken front-facing roof slope fills most of the roof area.
//  - NO dormers, NO cross-hips, NO competing gables, NO separate garage roof at a different angle.
//  - White lap siding (clean roof<->wall separation for masking), decent pitch, whole house + yard,
//    clean blue sky, no watermark / neighbour-roof.
//  - Slightly elevated 3/4 real-estate hero angle so the one slope reads as a broad plane.
//
// Run: doppler run --scope "C:\Users\Owner" -p wefixtrades -c prd -- node scripts/showroom-gen-singleplane.mjs <outDir>
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
const REPLICATE = process.env.REPLICATE_API_TOKEN || "";
if (!OUT || !REPLICATE) { console.error("usage: <outDir> ; REPLICATE_API_TOKEN missing"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

// Shared exterior + framing clause. WHITE lap siding for clean mask separation; whole house in frame.
const COMMON =
  " The ENTIRE house exterior is uniform smooth WHITE horizontal lap siding from ground to eaves " +
  "(absolutely NO board-and-batten, NO vertical siding, NO cedar-shake siding, NO shingle siding, NO " +
  "decorative gable panels, NO stone, NO brick). Crisp white eaves, fascia and gutters give a sharp " +
  "clean line between roof and wall. White window trim, simple front door. Tidy green front lawn, " +
  "clean driveway, clear bright blue sky, soft natural daylight, sharp focus, photorealistic, ultra " +
  "high detail. The whole house is fully in frame with room around it. No people, no cars, no " +
  "neighbouring houses, no other roofs in frame, no text, no watermark, no logo, no address numbers.";

// SINGLE-PLANE clause: the defining constraint. Camera slightly elevated 3/4 so the one broad front
// slope faces up toward the lens as a large unbroken plane. The roof must be medium-to-dark charcoal
// asphalt so it reads clearly darker than the white walls (good mask contrast + good recolor base).
const SLOPE =
  "The roof is a SIMPLE FRONT-GABLE roof presenting ONE single large unbroken triangular/rectangular " +
  "front slope that faces the camera and fills MOST of the visible roof area as one clean broad plane. " +
  "There is exactly ONE dominant roof plane. Absolutely NO dormers, NO cross-gables, NO hip returns, " +
  "NO secondary or competing gables, NO separate garage roof at a different pitch or angle, NO roof " +
  "vents or clutter — just one continuous shingle slope from ridge to eave. Medium-steep roof pitch " +
  "so the slope reads boldly. The roof is medium-to-dark charcoal-gray asphalt shingles, clearly " +
  "darker than the white walls. ";

const HERO =
  "Real-estate hero photograph of a single-family home taken from a slightly elevated three-quarter " +
  "front angle, camera about 12 feet up and angled gently downward so the single main roof slope faces " +
  "up toward the lens as a broad clearly-visible plane (NOT edge-on, NOT foreshortened to a thin " +
  "sliver). ";

// Four distinct house silhouettes, all constrained to ONE front-gable plane. Different massing so I
// can pick the single cleanest largest unbroken slope with the fewest secondary planes.
const VARIANTS = [
  { id: "sp-cottage", prompt: HERO +
    "A charming one-and-a-half story cottage seen nearly straight-on but from slightly above. " + SLOPE +
    "The gable end with its triangle faces the camera only slightly; the big rectangular slope dominates the frame." + COMMON },
  { id: "sp-longgable", prompt: HERO +
    "A wide single-story ranch-style home whose long side-gable roof shows one very large rectangular " +
    "front slope running the full width of the house. " + SLOPE + COMMON },
  { id: "sp-modernbarn", prompt: HERO +
    "A clean modern farmhouse with a tall simple gable; one broad front roof slope dominates, no wings. " + SLOPE + COMMON },
  { id: "sp-twostory", prompt: HERO +
    "An attractive two-story home with a simple side-gable roof; the single large front slope faces up " +
    "toward the slightly-elevated camera as one unbroken plane above two rows of windows. " + SLOPE + COMMON },
];

async function gen(prompt, seed) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const rr = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions", {
        method: "POST",
        headers: { Authorization: "Bearer " + REPLICATE, "Content-Type": "application/json", Prefer: "wait" },
        body: JSON.stringify({ input: { prompt, aspect_ratio: "3:2", output_format: "jpg", output_quality: 95, safety_tolerance: 2, prompt_upsampling: true, seed } }),
      });
      let j = await rr.json();
      let tries = 0;
      while (j.status && !["succeeded", "failed", "canceled"].includes(j.status) && tries < 60) {
        if (!j.urls || !j.urls.get) throw new Error("no_poll_url:" + (j.error || j.status || "?"));
        await new Promise((s) => setTimeout(s, 1500));
        j = await (await fetch(j.urls.get, { headers: { Authorization: "Bearer " + REPLICATE } })).json();
        tries++;
      }
      if (j.status !== "succeeded") throw new Error("replicate_" + (j.error || j.status || JSON.stringify(j).slice(0, 120)));
      const out = Array.isArray(j.output) ? j.output[0] : j.output;
      if (!out) throw new Error("no_output");
      const ir = await fetch(out);
      return Buffer.from(await ir.arrayBuffer());
    } catch (e) { lastErr = e; await new Promise((s) => setTimeout(s, 2500)); }
  }
  throw lastErr;
}

const seeds = (process.env.SEEDS || "7").split(",").map(Number);
for (const v of VARIANTS) {
  for (let s = 0; s < seeds.length; s++) {
    const fp = path.join(OUT, `${v.id}-${s}.jpg`);
    if (existsSync(fp)) { console.log(path.basename(fp), "skip"); continue; }
    try {
      const buf = await gen(v.prompt, seeds[s]);
      writeFileSync(fp, buf);
      console.log(path.basename(fp), "seed", seeds[s], buf.length, "B");
      await new Promise((r) => setTimeout(r, 600));
    } catch (e) { console.log(v.id + "-" + s, "ERR", e.message); }
  }
}
console.log("DONE");

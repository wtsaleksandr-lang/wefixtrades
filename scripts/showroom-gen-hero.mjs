// Gen ELEVATED 3/4 HERO-ANGLE base houses for the showroom.
// Goal: a drone / real-estate hero shot from SLIGHTLY ABOVE so a LARGE main roof plane faces the
// camera at a SHALLOW angle (not the near-horizontal foreshortening of the old low street-level ranch).
// The roof plane facing up toward the elevated camera keeps shingle courses crisp at zoom.
// Requirements: roof prominent + largest possible front plane, decent pitch, WHOLE house visible
// (facade, walls, some yard), WHITE lap siding (clean roof<->wall separation for masking), clean
// blue sky, no watermark/address, photoreal.
// Run: doppler run --scope "C:\Users\Owner" -p wefixtrades -c prd -- node scripts/showroom-gen-hero.mjs <outDir>
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
const REPLICATE = process.env.REPLICATE_API_TOKEN || "";
if (!OUT || !REPLICATE) { console.error("usage: <outDir> ; REPLICATE_API_TOKEN missing"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const COMMON =
  " The roof is medium-to-dark charcoal-gray asphalt shingles, clearly darker than the walls. The " +
  "ENTIRE house exterior is uniform smooth WHITE horizontal lap siding from ground to eaves (absolutely " +
  "NO board-and-batten, NO vertical siding, NO cedar-shake, NO shingle siding, NO decorative gable " +
  "panels, NO stone, NO brick anywhere). Crisp white eaves, fascia and gutters give a sharp clean line " +
  "between roof and wall. White window trim. Tidy green front lawn, clean driveway, clear bright blue " +
  "sky, soft natural daylight, sharp focus, photorealistic, ultra high detail. The whole house is fully " +
  "in frame with room around it. No people, no cars, no neighbouring houses, no text, no watermark, no " +
  "logo, no signage, no address numbers.";

// ELEVATED / DRONE framing shared clause. We want the camera ABOVE the eaveline looking DOWN onto the
// main front roof slope so it reads as a broad plane, while still seeing walls + yard.
const AERIAL =
  "Aerial real-estate hero photograph taken from an elevated drone about 30 feet above the ground and " +
  "in front of the house, camera angled DOWNWARD onto the roof at roughly a 35-degree downward tilt, " +
  "three-quarter front view. Because the camera is above the eaves, the large main roof slope faces up " +
  "toward the camera and fills much of the frame as a broad clearly-visible plane (NOT edge-on, NOT " +
  "foreshortened into a thin sliver). ";

const VARIANTS = [
  { id: "hipbig", prompt: AERIAL +
    "The house has a SIMPLE HIP ROOF with one very large dominant front slope angled up toward the drone. " +
    "Medium roof pitch. NO dormers, NO cross-gables, NO clutter on the roof — one clean broad shingle " +
    "plane." + COMMON },
  { id: "gable34", prompt: AERIAL +
    "The house has a clean side-GABLE roof; the single large rectangular front slope faces up toward the " +
    "elevated camera as one broad unbroken shingle plane, the triangular gable ends to the sides. Medium " +
    "pitch. NO dormers, NO cross gables." + COMMON },
  { id: "hipgar", prompt: AERIAL +
    "An attractive two-story suburban house with a hip roof; from the elevated drone the broad front roof " +
    "slope and the attached garage roof slope both face upward as large clear shingle planes. Medium-steep " +
    "pitch for a bold roof. NO dormers." + COMMON },
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

const seeds = (process.env.SEEDS || "23,64").split(",").map(Number);
for (const v of VARIANTS) {
  for (let s = 0; s < seeds.length; s++) {
    const fp = path.join(OUT, `${v.id}-${s}.jpg`);
    if (existsSync(fp)) { console.log(path.basename(fp), "skip"); continue; }
    try {
      const buf = await gen(v.prompt, seeds[s]);
      writeFileSync(fp, buf);
      console.log(path.basename(fp), "seed", seeds[s], buf.length, "B");
      await new Promise((r) => setTimeout(r, 800));
    } catch (e) { console.log(v.id + "-" + s, "ERR", e.message); }
  }
}
console.log("DONE");

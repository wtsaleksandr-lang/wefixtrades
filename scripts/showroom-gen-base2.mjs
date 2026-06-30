// Gen simpler base houses optimized for a TRIVIALLY CLEAN roof mask:
// single dominant front-facing roof plane, NO front gables/dormers, crisp eaveline,
// dark roof over LIGHT horizontal lap siding (max roof/wall luminance separation).
// Run: doppler run --scope "C:\Users\Owner" -p wefixtrades -c prd -- node scripts/showroom-gen-base2.mjs <outDir>
import { writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
const REPLICATE = process.env.REPLICATE_API_TOKEN || "";
if (!OUT || !REPLICATE) { console.error("usage / REPLICATE_API_TOKEN missing"); process.exit(1); }

const COMMON =
  " The roof is medium-to-dark gray asphalt shingles, clearly darker than the walls. The ENTIRE " +
  "house exterior is uniform smooth WHITE or very-light-gray HORIZONTAL lap siding from ground to " +
  "eaves (absolutely NO board-and-batten, NO vertical siding, NO cedar-shake, NO shingle siding, NO " +
  "decorative gable panels, NO stone, NO brick anywhere). Crisp white eaves and gutters give a sharp " +
  "clean line between roof and wall. White window trim, two-car garage, tidy green front lawn, clean " +
  "concrete driveway, clear bright blue sky, soft natural daylight, sharp focus, photorealistic, high " +
  "detail. No people, no cars, no neighbouring houses, no text, no watermark, no logo, no signage.";

// Each variant = a DIFFERENT simple-roof geometry. We want one dominant front roof plane,
// no triangular gable end-walls facing the camera, minimal/no dormers.
const VARIANTS = [
  { id: "g2hip", prompt:
    "Professional real-estate photograph of an attractive single-story North-American suburban house, " +
    "straight-on front view. The roof is a SIMPLE HIP ROOF (four gently sloping sides meeting at a short " +
    "horizontal ridge), presenting ONE large continuous front-facing slope to the camera, with NO " +
    "triangular gable end-walls, NO dormers, NO secondary roofs over the garage." + COMMON },
  { id: "g2gable", prompt:
    "Professional real-estate photograph of an attractive single-story North-American suburban house, " +
    "three-quarter front view. The roof is a SINGLE clean side-gable roof: one large unbroken rectangular " +
    "front slope faces the camera edge-on, the triangular gable ends face LEFT and RIGHT (not toward the " +
    "camera), NO dormers, NO cross-gables, NO secondary garage roof breaking the main slope." + COMMON },
  { id: "g2ranch", prompt:
    "Professional real-estate photograph of a long low single-story ranch house, slight three-quarter " +
    "front view. The roof is one simple low-pitch hip roof presenting a single broad continuous front slope, " +
    "NO front-facing gables, NO dormers, NO porch roof breaking the line, attached two-car garage under the " +
    "same continuous roof slope." + COMMON },
  { id: "g2cape", prompt:
    "Professional real-estate photograph of a tidy story-and-a-half house, straight-on symmetric front view. " +
    "The roof is a SINGLE steep side-gable with one large unbroken front slope facing the camera, gable ends " +
    "to the sides, NO dormers, NO cross gables, centered front door, windows symmetric." + COMMON },
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

const seeds = (process.env.SEEDS || "11,77").split(",").map(Number);
for (const v of VARIANTS) {
  for (let s = 0; s < seeds.length; s++) {
    const fp = path.join(OUT, `${v.id}-${s}.jpg`);
    if (existsSync(fp)) { console.log(path.basename(fp), "skip"); continue; }
    try {
      const buf = await gen(v.prompt, seeds[s]);
      writeFileSync(fp, buf);
      console.log(path.basename(fp), "seed", seeds[s], buf.length, "B");
      await new Promise((r) => setTimeout(r, 1000));
    } catch (e) { console.log(v.id + "-" + s, "ERR", e.message); }
  }
}
console.log("DONE");

// Round 2: refine the WINNING single-plane cottage silhouette (one big unbroken front slope, no
// dormers/cross-gables/garage) at a slightly MORE elevated 3/4 hero angle so the single slope reads
// as an even broader plane. A few seeds to pick the cleanest.
// Run: doppler run --scope "C:\Users\Owner" -p wefixtrades -c prd -- node scripts/showroom-gen-cottage2.mjs <outDir>
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
const REPLICATE = process.env.REPLICATE_API_TOKEN || "";
if (!OUT || !REPLICATE) { console.error("usage: <outDir> ; REPLICATE_API_TOKEN missing"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const COMMON =
  " The ENTIRE house exterior is uniform smooth WHITE horizontal lap siding (NO board-and-batten, NO " +
  "vertical siding, NO shake/shingle siding, NO stone, NO brick). Crisp white eaves, fascia and gutters " +
  "give a sharp clean line between roof and wall. White window trim, simple front door. Tidy green lawn, " +
  "clean driveway, clear bright blue sky, soft natural daylight, sharp focus, photorealistic, ultra high " +
  "detail. Whole house fully in frame with room around it. No people, no cars, no neighbouring houses, " +
  "no other roofs in frame, no text, no watermark, no logo, no address numbers.";

const SLOPE =
  "SIMPLE FRONT-GABLE roof presenting ONE single large unbroken rectangular front slope that faces the " +
  "camera and fills MOST of the visible roof area as one clean broad plane. Exactly ONE dominant roof " +
  "plane. Absolutely NO dormers, NO cross-gables, NO hip returns, NO secondary/competing gables, NO " +
  "separate garage roof, NO roof vents — one continuous shingle slope from ridge to eave. Medium-steep " +
  "pitch so the slope reads boldly. Medium-to-dark charcoal-gray asphalt shingles, clearly darker than " +
  "the white walls. ";

// More elevated: camera higher + steeper downward tilt so the slope opens up toward the lens.
const HERO =
  "Elevated real-estate hero photograph of a charming one-and-a-half-story white cottage, taken from a " +
  "three-quarter front angle with the camera raised about 18 feet and tilted downward roughly 25 degrees " +
  "so the single main roof slope opens up broadly toward the lens (not edge-on, not a thin sliver). ";

const PROMPT = HERO + SLOPE + COMMON;

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
      if (j.status !== "succeeded") throw new Error("replicate_" + (j.error || j.status || "?"));
      const out = Array.isArray(j.output) ? j.output[0] : j.output;
      if (!out) throw new Error("no_output");
      return Buffer.from(await (await fetch(out)).arrayBuffer());
    } catch (e) { lastErr = e; await new Promise((s) => setTimeout(s, 2500)); }
  }
  throw lastErr;
}

const seeds = (process.env.SEEDS || "11,29,42").split(",").map(Number);
for (const seed of seeds) {
  const fp = path.join(OUT, `cottage2-${seed}.jpg`);
  if (existsSync(fp)) { console.log(path.basename(fp), "skip"); continue; }
  try {
    const buf = await gen(PROMPT, seed);
    writeFileSync(fp, buf);
    console.log(path.basename(fp), buf.length, "B");
    await new Promise((r) => setTimeout(r, 600));
  } catch (e) { console.log("cottage2-" + seed, "ERR", e.message); }
}
console.log("DONE");

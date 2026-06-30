// Generate a fully-owned, watermark-free AI base house via Replicate text-to-image (Flux).
// Attractive generic North-American suburban single-family home, 3/4 frontal, LARGE clearly
// visible pitched roof, clean blue sky, tidy lawn, no people/text/watermark/address. We make
// 3-4 candidates and keep the cleanest, most repaint-friendly roof + nicest composition.
// Run: doppler run --scope "C:\Users\Owner" -p wefixtrades -c prd -- node scripts/showroom-gen-base.mjs <outDir>
import { writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
const REPLICATE = process.env.REPLICATE_API_TOKEN || "";
if (!OUT || !REPLICATE) { console.error("usage / REPLICATE_API_TOKEN missing"); process.exit(1); }

const PROMPT =
  "Professional real-estate photograph of an attractive North-American suburban " +
  "single-family two-story house, three-quarter front view from the side. The roof is a " +
  "simple HIP ROOF (four sloping sides meeting at a ridge, NO triangular gable end-walls " +
  "facing the camera) with clean asphalt shingles, the roof filling the upper third of the " +
  "frame and clearly separated from the walls by white eaves and gutters. The ENTIRE house " +
  "exterior is one uniform smooth light-gray HORIZONTAL lap siding from the ground to the " +
  "eaves (absolutely NO board-and-batten, NO vertical siding, NO cedar-shake or shingle " +
  "siding, NO decorative gable panels, NO wood paneling anywhere on the walls). White window " +
  "trim, stone-veneer wainscot base, two-car garage, covered front porch with white columns, " +
  "tidy green front lawn and clean concrete driveway, clear bright blue sky, soft natural " +
  "daylight, sharp focus, photorealistic, high detail. No people, no cars on the street, " +
  "no neighbouring houses, no text, no watermark, no logo, no signage.";

// flux-1.1-pro = best Flux quality on Replicate. We request a 3:2 landscape to match the
// 1536x1024 roof-swap output and give the roof generous frame space.
const MODEL = "black-forest-labs/flux-1.1-pro";

async function gen(seed) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const rr = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
        method: "POST",
        headers: { Authorization: "Bearer " + REPLICATE, "Content-Type": "application/json", Prefer: "wait" },
        body: JSON.stringify({
          input: {
            prompt: PROMPT,
            aspect_ratio: "3:2",
            output_format: "jpg",
            output_quality: 95,
            safety_tolerance: 2,
            prompt_upsampling: true,
            seed,
          },
        }),
      });
      let j = await rr.json();
      // Prefer:wait usually returns terminal; otherwise poll j.urls.get when present.
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
    } catch (e) {
      lastErr = e;
      await new Promise((s) => setTimeout(s, 2500));
    }
  }
  throw lastErr;
}

const PREFIX = process.env.GENBASE_PREFIX || "genbase";
const seeds = (process.env.GENBASE_SEEDS || "101,202,303,404").split(",").map(Number);
for (let i = 0; i < seeds.length; i++) {
  const fp = path.join(OUT, `${PREFIX}-${i}.jpg`);
  if (existsSync(fp)) { console.log(`${PREFIX}-${i}.jpg`, "skip (exists)"); continue; }
  try {
    const buf = await gen(seeds[i]);
    writeFileSync(fp, buf);
    console.log(`${PREFIX}-${i}.jpg`, "seed", seeds[i], buf.length, "B");
    await new Promise((s) => setTimeout(s, 1200));
  } catch (e) {
    console.log(`${PREFIX}-${i}`, "ERR", e.message);
  }
}
console.log("DONE");

// Gen the 4 additional roof-type base houses for the #5 showroom (hip, cross-hipped,
// dutch/gambrel, flat/low-slope). Mirrors showroom-gen-singleplane.mjs (flux-1.1-pro, 3:2).
// Each: attractive single-family home, elevated 3/4 hero angle, WHITE lap siding, whole house
// in frame, clean sky, no watermark / neighbour roof. 2-3 candidates per type; pick cleanest.
//
// Run: doppler run --scope "C:\Users\Owner" -p wefixtrades -c prd -- \
//        node scripts/showroom-gen-types.mjs <outDir> [type]
//   type in {hip,crosship,dutch,flat}; omit = all four.
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
const ONLY = process.argv[3];
const REPLICATE = process.env.REPLICATE_API_TOKEN || "";
if (!OUT || !REPLICATE) { console.error("usage: <outDir> [type] ; REPLICATE_API_TOKEN missing"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

// Shared exterior + framing clause (from singleplane): WHITE lap siding for clean mask separation.
const COMMON =
  " The ENTIRE house exterior is uniform smooth WHITE horizontal lap siding from ground to eaves " +
  "(absolutely NO board-and-batten, NO vertical siding, NO cedar-shake siding, NO shingle siding, NO " +
  "decorative gable panels, NO stone, NO brick). Crisp white eaves, fascia and gutters give a sharp " +
  "clean line between roof and wall. White window trim, simple front door. Tidy green front lawn, " +
  "clean driveway, clear bright blue sky, soft natural daylight, sharp focus, photorealistic, ultra " +
  "high detail. The whole house is fully in frame with room around it. No people, no cars, no " +
  "neighbouring houses, no other roofs in frame, no text, no watermark, no logo, no address numbers.";

const HERO =
  "Real-estate hero photograph of a single-family home taken from a slightly elevated three-quarter " +
  "front angle, camera about 12 feet up and angled gently downward so the roof planes face up toward " +
  "the lens as broad clearly-visible surfaces (NOT edge-on, NOT foreshortened to thin slivers). ";

// The roof must read clearly DARKER than the white walls (good mask contrast + good recolor base).
const DARK = "The roof is medium-to-dark charcoal-gray asphalt shingles, clearly darker than the white walls, no roof vents or clutter. ";

const TYPES = {
  hip: {
    label: "Hip roof (4 slopes to hips, no gable ends)",
    prompt: HERO +
      "An attractive single-story home with a classic HIP ROOF: four roof slopes that rise from all " +
      "four eaves and meet at a central ridge and hips, with NO gable ends anywhere — every side of the " +
      "roof is a sloped plane. The three-quarter angle shows two large adjacent hip slopes clearly. " +
      "Simple rectangular footprint, one continuous hip roof, no dormers, no secondary wings. " + DARK + COMMON,
  },
  crosship: {
    label: "Cross-hipped roof (two intersecting hip sections, valleys, L/T footprint)",
    prompt: HERO +
      "An attractive single-family home with a CROSS-HIPPED ROOF: an L-shaped (or T-shaped) footprint " +
      "where two hip-roof sections intersect at right angles, forming clear roof VALLEYS where the two " +
      "hip sections meet. Every roof end is hipped (sloped), no gable ends. The three-quarter view shows " +
      "the two intersecting hip wings and the valley between them. " + DARK + COMMON,
  },
  dutch: {
    label: "Gambrel / Dutch-gable roof (barn-style two-pitch)",
    prompt: HERO +
      "An attractive two-story home with a GAMBREL (barn-style / Dutch colonial) roof: each roof side has " +
      "TWO pitches — a steep lower slope and a shallower upper slope — meeting at a break line, like a " +
      "classic barn or Dutch colonial. The broad steep lower slopes face the camera as large clean planes. " +
      "One main gambrel roof, no competing wings, no dormers. " + DARK + COMMON,
  },
  flat: {
    label: "Flat / low-slope modern roof",
    prompt: HERO +
      "An attractive modern single-family home with a FLAT / very-low-slope ROOF: a clean modern flat-roof " +
      "house with crisp horizontal rooflines and a slim dark parapet edge, the flat roof deck clearly " +
      "visible from the slightly-elevated angle as a broad horizontal dark plane distinct from the white " +
      "walls. Boxy modern massing, one clean flat roof, no pitched sections. The dark flat roof surface " +
      "reads clearly darker than the white walls with a sharp parapet edge line. " + COMMON,
  },
};

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

const seeds = (process.env.SEEDS || "7,21,88").split(",").map(Number);
const ids = ONLY ? [ONLY] : Object.keys(TYPES);
for (const id of ids) {
  const v = TYPES[id];
  if (!v) { console.log("unknown type", id); continue; }
  for (let s = 0; s < seeds.length; s++) {
    const fp = path.join(OUT, `${id}-${s}.jpg`);
    if (existsSync(fp)) { console.log(path.basename(fp), "skip"); continue; }
    try {
      const buf = await gen(v.prompt, seeds[s]);
      writeFileSync(fp, buf);
      console.log(path.basename(fp), "seed", seeds[s], buf.length, "B");
      await new Promise((r) => setTimeout(r, 600));
    } catch (e) { console.log(id + "-" + s, "ERR", e.message); }
  }
}
console.log("DONE");

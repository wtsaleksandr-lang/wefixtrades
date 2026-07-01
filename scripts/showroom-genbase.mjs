// Generate a PREMIUM full-house showroom base via Replicate flux-1.1-pro.
// Goal: the ENTIRE house (roof + full walls + a bit of yard + sky headroom) centered in frame,
// photoreal, high clarity, with a UNIFORM plain CHARCOAL roof and WHITE lap siding so the
// downstream global dark-roof mask stays trivial. Straight clean ridge, simple gable so the
// roof perimeter is clean (no notches for the recolor to hallucinate around).
//
// usage: node showroom-genbase.mjs <outPng> [seed]
// run:   doppler run --scope "C:\Users\Owner" -p wefixtrades -c prd -- node scripts/showroom-genbase.mjs out.png 7
import { writeFileSync } from "node:fs";

const OUT = process.argv[2];
const SEED = process.argv[3] != null ? Number(process.argv[3]) : undefined;
if (!OUT) { console.error("usage: <outPng> [seed]"); process.exit(1); }
const REPLICATE = process.env.REPLICATE_API_TOKEN || "";
if (!REPLICATE) { console.error("no REPLICATE_API_TOKEN"); process.exit(1); }

const PROMPT =
  "Professional real-estate photograph of a complete single-story suburban house, photographed " +
  "straight-on from the front at eye level. The ENTIRE house is fully visible and centered: the " +
  "full roof at the top, all of the walls, the front door, windows, an attached single-car garage " +
  "on the left, and a neat green front lawn along the bottom, with clear blue sky headroom above " +
  "the roof. Nothing is cropped — the whole home reads as a complete house with generous margin " +
  "on all sides. WHITE horizontal lap siding. The roof is a simple clean gable with a single " +
  "straight horizontal ridge and smooth straight eaves, covered in a plain UNIFORM medium-charcoal " +
  "gray shingle with no other roof color, no skylights, no solar panels, no chimney clutter. " +
  "Bright even midday sunlight, soft natural shadows, crisp focus, ultra-sharp high-resolution " +
  "detail, clean and photorealistic, architectural photography, no people, no cars, no text, no watermark.";

async function main() {
  const input = {
    prompt: PROMPT,
    aspect_ratio: "3:2",
    output_format: "png",
    output_quality: 100,
    prompt_upsampling: false,
    safety_tolerance: 2,
  };
  if (SEED != null) input.seed = SEED;
  const rr = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions", {
    method: "POST",
    headers: { Authorization: "Bearer " + REPLICATE, "Content-Type": "application/json", Prefer: "wait" },
    body: JSON.stringify({ input }),
  });
  let j = await rr.json();
  let tries = 0;
  while (j.status && !["succeeded", "failed", "canceled"].includes(j.status) && tries < 60) {
    if (!j.urls || !j.urls.get) throw new Error("no_poll_url:" + (j.error || j.status || "?"));
    await new Promise((s) => setTimeout(s, 1500));
    j = await (await fetch(j.urls.get, { headers: { Authorization: "Bearer " + REPLICATE } })).json();
    tries++;
  }
  if (j.status !== "succeeded") throw new Error("gen_" + (j.error || j.status || "failed"));
  const out = Array.isArray(j.output) ? j.output[0] : j.output;
  const ab = await fetch(out).then((r) => r.arrayBuffer());
  writeFileSync(OUT, Buffer.from(new Uint8Array(ab)));
  console.log("wrote", OUT, "seed", SEED != null ? SEED : "(random)");
}
main().catch((e) => { console.error("FATAL", e.message); process.exit(1); });

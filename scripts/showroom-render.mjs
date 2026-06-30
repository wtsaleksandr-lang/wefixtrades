// Showroom render harness.
// Repaints the ONE static base house with each roof material/color from roof3d.html's
// ROOF_CATALOG, using gpt-image-1 (best house preservation) with a Replicate Flux-Kontext
// fallback. The SAME base image is fed every time so the house is identical across swaps —
// only the roof differs. Mirrors server/services/roofQuote/roofQuoteService.ts render funcs.
//
//   PHASE 1: node showroom-render.mjs heroes <baseJpg> <outDir>
//            -> renders base passthrough check + ONE hero color per material (6 renders)
//   PHASE 2: node showroom-render.mjs full <baseJpg> <outDir>
//            -> renders every material x every color
//   single : node showroom-render.mjs one <baseJpg> <outDir> <matId> <colorIdx>
//
// Run under: doppler run --scope "C:\Users\Owner" -p wefixtrades -c prd -- node ...
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const MODE = process.argv[2];
const BASE = process.argv[3];
const OUT = process.argv[4];
if (!MODE || !BASE || !OUT) { console.error("usage: <mode> <baseJpg> <outDir> [..]"); process.exit(1); }

const OPENAI = process.env.OPENAI_API_KEY || "";
const REPLICATE = process.env.REPLICATE_API_TOKEN || "";

// ── canonical ROOF_CATALOG (keys + per-color AI prompt `p:`) — mirrors roof3d.html ~L4758.
// material key = catalog `id`; color key = color `n`. Filenames/manifest MUST use these.
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

// Roof-only repaint prompt (base is an AI-generated photoreal house) — only the roof
// surfaces change; façade/sky/yard stay pixel-identical. Mirrors roofPrompt(view:"street").
function prompt(material) {
  return (
    "Edit THIS exact photo of a house. Replace ONLY the visible roof covering " +
    "(the sloped roof surfaces and gables) of the main house with " + material +
    ", covering the whole visible roof. Keep the IDENTICAL same house from the input photo — " +
    "same siding, stone accents, windows, doors, porch, columns, garage doors, gutters, fence, " +
    "lawn, driveway, shrubs, trees, sky, camera angle and lighting. " +
    "Do NOT generate a new or different house, building or scene; preserve every other pixel exactly. " +
    "Photorealistic, sharp, natural realistic roof colour."
  );
}

function baseDataUri() {
  const buf = readFileSync(BASE);
  const ext = path.extname(BASE).toLowerCase();
  const mime = ext === ".png" ? "image/png" : "image/jpeg";
  return { dataUri: "data:" + mime + ";base64," + buf.toString("base64"), buf, mime };
}

// ── gpt-image-1 edits — crispest + best house preservation (quality>latency for pre-render).
async function renderOpenAI(buf, material) {
  if (!OPENAI) throw new Error("no_openai_key");
  const fd = new FormData();
  fd.append("model", "gpt-image-1");
  fd.append("image", new Blob([buf], { type: "image/png" }), "house.png");
  fd.append("prompt", prompt(material));
  fd.append("size", "1536x1024");
  fd.append("quality", "high");
  fd.append("input_fidelity", "high");
  const r = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST", headers: { Authorization: "Bearer " + OPENAI }, body: fd,
  });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error("openai_" + r.status + ":" + t.slice(0, 160)); }
  const j = await r.json();
  const b = j.data?.[0]?.b64_json;
  if (!b) throw new Error("openai_no_image");
  return Buffer.from(b, "base64");
}

// ── Replicate Flux-Kontext-pro fallback (true img2img, identical house).
async function renderReplicate(dataUri, material) {
  if (!REPLICATE) throw new Error("no_replicate_key");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const rr = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions", {
        method: "POST",
        headers: { Authorization: "Bearer " + REPLICATE, "Content-Type": "application/json", Prefer: "wait" },
        body: JSON.stringify({ input: { prompt: prompt(material), input_image: dataUri, output_format: "jpg", safety_tolerance: 2 } }),
      });
      let j = await rr.json();
      let tries = 0;
      while (j.status && !["succeeded", "failed", "canceled"].includes(j.status) && tries < 40) {
        await new Promise((s) => setTimeout(s, 1500));
        j = await (await fetch(j.urls.get, { headers: { Authorization: "Bearer " + REPLICATE } })).json();
        tries++;
      }
      if (j.status !== "succeeded") throw new Error("replicate_" + (j.error || j.status || "failed"));
      const out = Array.isArray(j.output) ? j.output[0] : j.output;
      if (!out) throw new Error("replicate_no_output");
      const ir = await fetch(out); return Buffer.from(await ir.arrayBuffer());
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((s) => setTimeout(s, 1800));
    }
  }
}

const { dataUri, buf } = baseDataUri();
async function renderOne(material) {
  // OpenAI first (quality). Fall back to Replicate on any OpenAI failure (org-verification etc.).
  try {
    const b = await renderOpenAI(buf, material);
    return { buf: b, provider: "openai" };
  } catch (e) {
    console.error("  openai failed -> replicate:", e.message);
    const b = await renderReplicate(dataUri, material);
    return { buf: b, provider: "replicate" };
  }
}

async function main() {
  if (MODE === "heroes") {
    for (const m of ROOF_CATALOG) {
      const hero = m.colors[0];
      const name = `hero-${m.id}.jpg`;
      if (existsSync(path.join(OUT, name))) { console.log("skip (exists)", name); continue; }
      process.stdout.write(`render hero ${m.id} (${hero.n})... `);
      const { buf: out, provider } = await renderOne(hero.p);
      writeFileSync(path.join(OUT, name), out);
      console.log("OK", provider, out.length, "B ->", name);
    }
  } else if (MODE === "one") {
    const matId = process.argv[5]; const ci = Number(process.argv[6]);
    const m = ROOF_CATALOG.find((x) => x.id === matId);
    const c = m.colors[ci];
    const name = `${matId}__${c.n}.jpg`;
    process.stdout.write(`render ${name}... `);
    const { buf: out, provider } = await renderOne(c.p);
    writeFileSync(path.join(OUT, name), out);
    console.log("OK", provider, out.length, "B");
  } else if (MODE === "full") {
    let done = 0, total = 0;
    for (const m of ROOF_CATALOG) total += m.colors.length;
    for (const m of ROOF_CATALOG) {
      for (const c of m.colors) {
        const name = `${m.id}__${c.n}.jpg`;
        if (existsSync(path.join(OUT, name))) { console.log("skip (exists)", name); done++; continue; }
        process.stdout.write(`[${++done}/${total}] ${name}... `);
        try {
          const { buf: out, provider } = await renderOne(c.p);
          writeFileSync(path.join(OUT, name), out);
          console.log("OK", provider, out.length, "B");
        } catch (e) {
          console.log("FAIL", e.message);
        }
      }
    }
  } else { console.error("unknown mode", MODE); process.exit(1); }
  console.log("DONE");
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });

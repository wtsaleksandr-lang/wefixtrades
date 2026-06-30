// Showroom base-house capture.
// Grabs candidate Street View frames for a few attractive single-family homes with
// clean, clearly-visible roofs. We aim the camera AT the house (heading computed from
// the pano location toward the geocoded address) so the house — not the street — is
// centered. We then pick the candidate whose roof is cleanest to repaint and use that
// SAME base for every material render so the house is identical across swaps.
// Run: doppler run --scope "C:\Users\Owner" -p wefixtrades -c prd -- node scripts/showroom-capture-base.mjs <outDir>
import { writeFileSync } from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
if (!OUT) { console.error("usage: node showroom-capture-base.mjs <outDir>"); process.exit(1); }
// Street View is enabled on ROOFQUOTE_SOLAR_KEY (same key the prod streetView() proxy uses).
const KEY = process.env.ROOFQUOTE_SOLAR_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.ROOFQUOTE_TILES_KEY || "";
if (!KEY) { console.error("no Google key"); process.exit(1); }

// Candidate addresses — ordinary-attractive US single-family homes with a prominent,
// clearly visible pitched roof and good Street View coverage. Keep the cleanest.
const CANDIDATES = [
  { id: "m", addr: "3712 Prescott St, Plano, TX" },
  { id: "n", addr: "1208 Settlers Way, Round Rock, TX" },
  { id: "o", addr: "9032 Sienna Ridge Dr, Fort Worth, TX" },
  { id: "p", addr: "742 Evergreen Terrace, Naperville, IL" },
  { id: "q", addr: "1521 Bordeaux Dr, Frisco, TX" },
  { id: "r", addr: "5008 Pine Cone Dr, McKinney, TX" },
  { id: "s", addr: "2204 Brookhaven Dr, Southlake, TX" },
  { id: "t", addr: "1340 Heritage Oaks Dr, Allen, TX" },
];

async function geocode(addr) {
  const u = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&key=${KEY}`;
  const j = await (await fetch(u)).json();
  const loc = j.results?.[0]?.geometry?.location;
  return loc || null;
}
async function svMeta(lat, lng) {
  const u = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&source=outdoor&key=${KEY}`;
  return (await fetch(u)).json();
}
function bearing(from, to) {
  const toRad = (d) => (d * Math.PI) / 180, toDeg = (r) => (r * 180) / Math.PI;
  const y = Math.sin(toRad(to.lng - from.lng)) * Math.cos(toRad(to.lat));
  const x = Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
            Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(toRad(to.lng - from.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
async function svImage(panoLoc, heading, fov, pitch) {
  // pano-anchored, aimed at the house; pitch up a touch to reveal the roof plane.
  const u = `https://maps.googleapis.com/maps/api/streetview?size=640x640&location=${panoLoc.lat},${panoLoc.lng}&heading=${heading.toFixed(1)}&fov=${fov}&pitch=${pitch}&source=outdoor&key=${KEY}`;
  const r = await fetch(u);
  if (!r.ok) throw new Error("sv " + r.status);
  return Buffer.from(await r.arrayBuffer());
}

for (const c of CANDIDATES) {
  try {
    const house = await geocode(c.addr);
    if (!house) { console.log(c.id, c.addr, "-> geocode MISS"); continue; }
    const meta = await svMeta(house.lat, house.lng);
    if (meta.status !== "OK" || !meta.location) { console.log(c.id, c.addr, "-> sv meta", meta.status); continue; }
    const pano = meta.location;
    const head = bearing(pano, house); // aim camera from where it stands TOWARD the house
    const buf = await svImage(pano, head, 75, 14);
    const fp = path.join(OUT, `cand-${c.id}.jpg`);
    writeFileSync(fp, buf);
    console.log(c.id, c.addr, "-> OK", buf.length, "B head", head.toFixed(0), "->", fp);
  } catch (e) {
    console.log(c.id, c.addr, "-> ERR", e.message);
  }
}
console.log("DONE");

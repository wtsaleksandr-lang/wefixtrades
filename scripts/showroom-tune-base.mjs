// Fine-tune the chosen base house (candidate R) framing: sweep heading offset + fov so
// the home + its roof fill the frame as a clean 3/4 read. We keep the cleanest as base.
// Run: doppler run --scope "C:\Users\Owner" -p wefixtrades -c prd -- node scripts/showroom-tune-base.mjs <outDir> "<address>"
import { writeFileSync } from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
const ADDR = process.argv[3] || "5008 Pine Cone Dr, McKinney, TX";
const KEY = process.env.ROOFQUOTE_SOLAR_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
if (!OUT || !KEY) { console.error("usage / key missing"); process.exit(1); }

const geocode = async (a) => {
  const j = await (await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(a)}&key=${KEY}`)).json();
  return j.results?.[0]?.geometry?.location || null;
};
const meta = async (lat, lng) =>
  (await (await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&source=outdoor&key=${KEY}`)).json());
const bearing = (f, t) => {
  const r = (d) => d * Math.PI / 180, g = (x) => x * 180 / Math.PI;
  const y = Math.sin(r(t.lng - f.lng)) * Math.cos(r(t.lat));
  const x = Math.cos(r(f.lat)) * Math.sin(r(t.lat)) - Math.sin(r(f.lat)) * Math.cos(r(t.lat)) * Math.cos(r(t.lng - f.lng));
  return (g(Math.atan2(y, x)) + 360) % 360;
};
const img = async (p, head, fov, pitch, name) => {
  const u = `https://maps.googleapis.com/maps/api/streetview?size=640x640&location=${p.lat},${p.lng}&heading=${head.toFixed(1)}&fov=${fov}&pitch=${pitch}&source=outdoor&key=${KEY}`;
  const r = await fetch(u); if (!r.ok) throw new Error("sv " + r.status);
  const b = Buffer.from(await r.arrayBuffer());
  const fp = path.join(OUT, name); writeFileSync(fp, b);
  console.log(name, "head", head.toFixed(0), "fov", fov, "pitch", pitch, b.length, "B");
};

const house = await geocode(ADDR);
const m = await meta(house.lat, house.lng);
const pano = m.location;
const head = bearing(pano, house);
console.log("pano", pano.lat, pano.lng, "house", house.lat, house.lng, "baseHead", head.toFixed(1));
// Sweep small heading offsets (deg) and fovs; r-tune-<n> for review.
let n = 0;
for (const off of [-8, 0, 8]) {
  for (const fov of [60, 70]) {
    await img(pano, (head + off + 360) % 360, fov, 12, `r-tune-${n++}.jpg`);
  }
}
console.log("DONE");

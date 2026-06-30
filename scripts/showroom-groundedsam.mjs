// Run grounded_sam on the base to segment the roof. Inspect/save all output URLs.
//   node showroom-groundedsam.mjs <srDir> "<maskPrompt>" "<negPrompt>"
import fs from "node:fs";
import { PNG } from "pngjs";

const SR = process.argv[2];
const MASK_PROMPT = process.argv[3] || "roof";
const NEG = process.argv[4] || "";
const ADJ = process.argv[5] ? Number(process.argv[5]) : 0;
const R = process.env.REPLICATE_API_TOKEN;
if (!R) { console.error("no REPLICATE_API_TOKEN"); process.exit(1); }

const BASE_FILE = process.env.GSAM_BASE || "base.png";
const buf = fs.readFileSync(SR + "/" + BASE_FILE);
const dataUri = "data:image/png;base64," + buf.toString("base64");

const VERSION = "ee871c19efb1941f55f66a3d7d960428c8a5afcb77449547fe8e5a3ab9ebc21c";
const body = { version: VERSION, input: { image: dataUri, mask_prompt: MASK_PROMPT, negative_mask_prompt: NEG, adjustment_factor: ADJ } };
const rr = await fetch("https://api.replicate.com/v1/predictions", {
  method: "POST",
  headers: { Authorization: "Bearer " + R, "Content-Type": "application/json", Prefer: "wait" },
  body: JSON.stringify(body),
});
let j = await rr.json();
if (!rr.ok || j.error) console.error("POST resp:", rr.status, JSON.stringify(j).slice(0, 400));
let tries = 0;
while (j.status && !["succeeded", "failed", "canceled"].includes(j.status) && tries < 60) {
  if (!j.urls || !j.urls.get) { console.error("no poll url:", JSON.stringify(j).slice(0, 300)); break; }
  await new Promise((s) => setTimeout(s, 1500));
  j = await (await fetch(j.urls.get, { headers: { Authorization: "Bearer " + R } })).json();
  tries++;
}
if (j.status !== "succeeded") { console.error("FAIL", JSON.stringify(j).slice(0, 400)); process.exit(1); }
console.log("output type:", Array.isArray(j.output) ? `array[${j.output.length}]` : typeof j.output);
const outs = Array.isArray(j.output) ? j.output : [j.output];
const slug = (process.env.GSAM_SLUG || MASK_PROMPT).replace(/[^a-z0-9]+/gi, "-").slice(0, 20);
let idx = 0;
for (const o of outs) {
  if (typeof o !== "string") { console.log("non-url output:", JSON.stringify(o).slice(0, 100)); continue; }
  const ab = await fetch(o).then((r) => r.arrayBuffer());
  const fn = `${SR}/gsam-${slug}-${idx}.png`;
  fs.writeFileSync(fn, Buffer.from(ab));
  console.log("saved", fn, "(", o.split("/").pop(), ")");
  idx++;
}

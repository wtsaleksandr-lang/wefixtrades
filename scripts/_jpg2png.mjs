// Decode a JPG to PNG (optionally resize) via a headless-browser canvas.
// usage: node scripts/_jpg2png.mjs <in.jpg> <out.png> [w h]
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const [, , IN, OUT, W, H] = process.argv;
if (!IN || !OUT) { console.error("usage <in.jpg> <out.png> [w h]"); process.exit(1); }
const b64 = readFileSync(IN).toString("base64");
const browser = await chromium.launch();
const page = await browser.newPage();
const dataUrl = "data:image/jpeg;base64," + b64;
const pngB64 = await page.evaluate(async ({ dataUrl, W, H }) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
  const w = W ? +W : img.naturalWidth, h = H ? +H : img.naturalHeight;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  return c.toDataURL("image/png").split(",")[1];
}, { dataUrl, W, H });
writeFileSync(OUT, Buffer.from(pngB64, "base64"));
await browser.close();
console.log("wrote", OUT, W && H ? `${W}x${H}` : "native");

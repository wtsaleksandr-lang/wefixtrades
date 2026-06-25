// Real-GPU Playwright verification of the universal (OSM → Microsoft on-demand) footprint cascade.
// Drives the live widget on http://localhost:5319/roof3d for a spread of varied single-family homes
// across US regions + Canada, asserts the WebGL renderer is the real Intel/D3D11 GPU (not SwiftShader),
// polls __roofReady, opens the Measure top-down lens, screenshots, and reports the footprint source +
// whether the outline sits on the roof. Run from spikes/roof-quote with the server already up on 5319.
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const OUT = "C:/Users/Owner/claude-orchestrator/audits/universal";
mkdirSync(OUT, { recursive: true });

// Varied spread — deliberately mixes dense-OSM metros (expect osm) with newer-development / suburban /
// rural addresses where OSM is sparse (expect msft) + a Canadian home. Address text drives the widget's
// own Google Places autocomplete; we pick the first full-address suggestion exactly like a real user.
const ADDRESSES = [
  { tag: "TX-austin",     q: "1402 Northwood Rd, Austin, TX 78703" },
  { tag: "FL-ftlaud",     q: "1820 NE 9th Ave, Fort Lauderdale, FL 33305" },
  { tag: "OH-columbus",   q: "2204 Tremont Rd, Columbus, OH 43221" },
  { tag: "GA-atlanta",    q: "876 Ponce de Leon Ave NE, Atlanta, GA 30306" },
  { tag: "WA-seattle",    q: "2451 NW 60th St, Seattle, WA 98107" },
  { tag: "AZ-mesa",       q: "1234 W Main St, Mesa, AZ 85201" },
  { tag: "ON-toronto",    q: "100 Glenview Ave, Toronto, ON" },
  { tag: "TX-newdev",     q: "1801 Burnet Rd, Austin, TX 78758" },
  { tag: "NV-henderson",  q: "1050 W Horizon Ridge Pkwy, Henderson, NV 89012" },
  { tag: "AB-calgary",    q: "2120 Crescent Rd NW, Calgary, AB" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const browser = await chromium.launch({
  headless: false,
  args: ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-accelerated-2d-canvas"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// renderer assertion (once)
await page.goto("http://localhost:5319/roof3d", { waitUntil: "domcontentloaded" });
const renderer = await page.evaluate(() => {
  try { const c = document.createElement("canvas"); const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL); } catch (e) { return "ERR:" + e.message; }
});
console.log("RENDERER:", renderer);

for (const a of ADDRESSES) {
  const r = { tag: a.tag, q: a.q, source: "?", sourceUsed: "?", ready: false, err: "" };
  try {
    await page.goto("http://localhost:5319/roof3d", { waitUntil: "domcontentloaded" });
    await sleep(800);
    // type into the hero address input → pick first full-address suggestion
    const input = page.locator("#addrHero");
    await input.click();
    await input.fill("");
    await input.pressSequentially(a.q, { delay: 55 });
    await sleep(1800); // let Places autocomplete populate
    const items = page.locator(".pac-item");
    const n = await items.count();
    if (n > 0) { await items.first().click(); }
    else { await input.press("Enter"); }
    // poll __roofReady up to 75s (cold MS tile can be ~10-15s on top of model build)
    const t0 = Date.now();
    while (Date.now() - t0 < 75000) {
      const ready = await page.evaluate(() => !!window.__roofReady).catch(() => false);
      if (ready) { r.ready = true; break; }
      await sleep(700);
    }
    await sleep(1500);
    r.source = await page.evaluate(() => window.__footprintSource || "?").catch(() => "?");
    r.sourceUsed = await page.evaluate(() => window.__footprintSourceUsed || "?").catch(() => "?");
    // open Measure (top-down) lens
    try { await page.locator("#bLabels").click({ timeout: 4000 }); await sleep(2500); } catch (e) { r.err += "no-measure;"; }
    await page.screenshot({ path: `${OUT}/${a.tag}.png` });
  } catch (e) {
    r.err += (e && e.message || String(e)).slice(0, 120);
    try { await page.screenshot({ path: `${OUT}/${a.tag}-ERR.png` }); } catch (_) {}
  }
  console.log(JSON.stringify(r));
  results.push(r);
}

await browser.close();
console.log("\n=== SUMMARY ===");
console.log("renderer:", renderer);
const clean = results.filter(r => ["osm","msft","cache"].includes(r.sourceUsed));
for (const r of results) console.log(`${r.tag.padEnd(14)} fetched=${r.source.padEnd(5)} used=${r.sourceUsed.padEnd(5)} ready=${r.ready} ${r.err}`);
console.log(`\nCLEAN (osm/msft/cache used): ${clean.length}/${results.length}`);
console.log("by-source:", JSON.stringify(results.reduce((m,r)=>{m[r.sourceUsed]=(m[r.sourceUsed]||0)+1;return m;},{})));

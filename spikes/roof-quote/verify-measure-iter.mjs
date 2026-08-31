// verify-measure-iter.mjs — REAL-GPU iteration harness for the roof MEASUREMENT lines.
// Drives roof3d.html HEADED (d3d11/ANGLE), asserts a hardware renderer, geocodes each test
// home, opens the Measure top-down, screenshots it, and — critically — pulls the per-edge
// deviation metric (drawn outer ring vs the Google mask roof-edge) so "perfect" is a NUMBER.
// Usage: ROUND=0 node verify-measure-iter.mjs   (set ROUND label for the screenshot/file names)
import { chromium } from "playwright";
import fs from "node:fs";

const OUT = "C:/Users/Owner/claude-orchestrator/audits/measure-iter";
fs.mkdirSync(OUT, { recursive: true });
const PORT = process.env.PORT || 5332;
const ROUND = process.env.ROUND || "r";
const ADDRS = (process.env.ADDRS ? process.env.ADDRS.split("|") : [
  "12 Maple Ave, Barrington RI",     // detached single-family
  "11823 Groveland Ave, Whittier CA",  // simple residential (7 Painter Ave has no Places autocomplete in this env)
  "1842 Glencoe St, Denver CO",      // complex hip
]);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);

const browser = await chromium.launch({
  headless: false,
  args: ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-accelerated-2d-canvas"],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("console", (m) => { const t = m.text(); if (/DEVDUMP|geo-err|vector-fp|clip-/i.test(t)) console.log("  [page]", t); });

await page.goto(`http://localhost:${PORT}/roof3d`, { waitUntil: "domcontentloaded", timeout: 60000 });
const renderer = await page.evaluate(() => {
  try { const c = document.createElement("canvas"); const gl = c.getContext("webgl2") || c.getContext("webgl");
    const dbg = gl && gl.getExtension("WEBGL_debug_renderer_info");
    return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : (gl ? "no-debug-ext" : "no-webgl");
  } catch (e) { return "err:" + e.message; }
});
const hwOk = /Intel|Direct3D11|NVIDIA|AMD|Radeon|ANGLE/i.test(renderer) && !/SwiftShader|software/i.test(renderer);
console.log("RENDERER:", renderer, "| HARDWARE-GPU:", hwOk ? "YES" : "NO");

async function drive(addr) {
  await page.goto(`http://localhost:${PORT}/roof3d`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1000);
  for (let i = 0; i < 30; i++) { if (await page.evaluate(() => !!window.__acReady)) break; await page.waitForTimeout(300); }
  const heroLoc = page.locator("#addrHero");
  const heroVisible = await heroLoc.isVisible().catch(() => false);
  const input = heroVisible ? heroLoc : page.locator("#addr");
  await input.click(); await input.fill("");
  await input.pressSequentially(addr, { delay: 60 });
  await page.waitForTimeout(2000);
  let picked = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll("body > div")].filter(d => /position:\s*absolute/.test(d.getAttribute("style")||"") && d.style.zIndex === "60" && d.style.display !== "none" && d.children.length);
    const box = boxes[0];
    if (box && box.children[0]) { const r = box.children[0].getBoundingClientRect();
      return { ok: true, text: box.children[0].textContent, x: r.left + r.width/2, y: r.top + r.height/2 }; }
    return { ok: false };
  });
  if (picked.ok) { console.log("  suggestion:", JSON.stringify(picked.text));
    await page.mouse.move(picked.x, picked.y); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(400);
  } else { console.log("  no dropdown — direct run()");
    await page.evaluate((a) => { try { if (typeof window.__leaveHero === "function") window.__leaveHero(); } catch (_) {}
      const ab = document.getElementById("addr"); if (ab) ab.value = a;
      if (typeof window.run === "function") window.run(a); else { const go = document.getElementById("go"); if (go) go.click(); } }, addr);
  }
  await page.waitForTimeout(800);
  let ready = false;
  for (let i = 0; i < 90; i++) { ready = await page.evaluate(() => !!window.__roofReady); if (ready) break; await page.waitForTimeout(1000); }
  if (!ready) { const errs = await page.evaluate(() => (window.errors || []).slice(-8)); console.log("  NOT READY —", JSON.stringify(errs)); return { ready: false }; }
  await page.waitForTimeout(13000);
  // open Measure top-down
  const td = await page.evaluate(() => {
    try { const GV = window.__geoVerify || {}; const fn = (GV.renderRoofDiagram) || window.renderRoofDiagram;
      if (fn && fn()) { const mc = document.getElementById("matCanvas"); mc.style.display = "block"; mc.style.zIndex = "40";
        const sc = document.getElementById("scene"); if (sc) sc.style.display = "none";
        const gw = document.getElementById("gmapWrap"); if (gw) gw.style.display = "none"; return true; } }
    catch (e) { console.log("geo-err topdown " + e.message); } return false;
  });
  await page.waitForTimeout(900);
  // pull the deviation metric + diag
  const dump = await page.evaluate(() => {
    const out = {};
    try { const GV = window.__geoVerify || {};
      const zone = (window.LASTFLUX||window.LASTDSM||window.LASTMASK||{}).zone;
      out.dev = GV.edgeDeviation ? GV.edgeDeviation(zone) : null;
      out.alignDiag = window.__alignDiag || null;
      out.footprintSource = window.__footprintSource || null;
      out.measEdges = window.__measEdges || null;
      out.fpVerts = (GV.footprintEN && GV.footprintEN()||[]).length;
      const mb = GV.maskBoundaryRing ? GV.maskBoundaryRing(zone) : null;
      out.maskBoundVerts = mb && mb.ring ? mb.ring.length : 0;
      console.log("DEVDUMP " + JSON.stringify({src:out.footprintSource, sum: out.dev && out.dev.summary}));
    } catch (e) { out.err = String(e && e.message || e); }
    return out;
  });
  return { ready: true, td, dump };
}

const report = {};
for (const addr of ADDRS) {
  const s = slug(addr);
  console.log(`\n=== ${addr} ===`);
  try {
    const r = await drive(addr);
    if (!r.ready) { report[s] = { ready:false }; continue; }
    const path = `${OUT}/${ROUND}-${s}.png`;
    await page.screenshot({ path });
    console.log(`  td=${r.td} -> ${path}`);
    if (r.dump.dev && r.dump.dev.summary) console.log("  DEVIATION:", JSON.stringify(r.dump.dev.summary));
    else console.log("  DEVIATION: n/a", JSON.stringify(r.dump.dev && r.dump.dev.reason || r.dump.err));
    console.log("  src:", r.dump.footprintSource, "fpVerts:", r.dump.fpVerts, "maskBoundVerts:", r.dump.maskBoundVerts, "edges:", JSON.stringify(r.dump.measEdges));
    report[s] = { addr, ...r.dump };
  } catch (e) { console.log("  ERROR:", e.message); report[s] = { error: e.message }; }
}
fs.writeFileSync(`${OUT}/_dev-${ROUND}.json`, JSON.stringify({ round: ROUND, renderer, hwOk, report }, null, 2));
await browser.close();
console.log("\nDONE round", ROUND);

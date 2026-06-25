// verify-iter3.mjs — REAL-GPU harness for the OVER-SEGMENTATION merge (iter 3).
// Drives roof3d.html HEADED (d3d11/ANGLE), asserts a hardware renderer, geocodes each test home,
// then probes the spurious interior-crease count with the merge OFF vs ON (same loaded roof), and
// screenshots the Measure top-down (merge ON = the shipped behaviour). "Fixed" = spurious↓, real kept.
// Usage: ROUND=r1 PORT=5334 node verify-iter3.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const OUT = "C:/Users/Owner/claude-orchestrator/audits/measure-iter3";
fs.mkdirSync(OUT, { recursive: true });
const PORT = process.env.PORT || 5334;
const ROUND = process.env.ROUND || "r";
const ADDRS = (process.env.ADDRS ? process.env.ADDRS.split("|") : [
  "1842 Glencoe St, Denver CO",       // complex hip — historically over-segmented
  "4521 T St, Sacramento CA",         // complex — over-segmented
  "30 Angus Rd, Hamilton ON",         // SIMPLE duplex gable — must keep its ONE real ridge (regression)
  "11823 Groveland Ave, Whittier CA", // simple residential hip — keep real hips
]);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);

const browser = await chromium.launch({
  headless: false,
  args: ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-accelerated-2d-canvas"],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("console", (m) => { const t = m.text(); if (/PROBE|geo-err|plane-merge|MERGE/i.test(t)) console.log("  [page]", t); });

await page.goto(`http://localhost:${PORT}/roof3d`, { waitUntil: "domcontentloaded", timeout: 60000 });
const renderer = await page.evaluate(() => {
  try { const c = document.createElement("canvas"); const gl = c.getContext("webgl2") || c.getContext("webgl");
    const dbg = gl && gl.getExtension("WEBGL_debug_renderer_info");
    return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : (gl ? "no-debug-ext" : "no-webgl");
  } catch (e) { return "err:" + e.message; }
});
const hwOk = /Intel|Direct3D11|NVIDIA|AMD|Radeon|ANGLE/i.test(renderer) && !/SwiftShader|software/i.test(renderer);
console.log("RENDERER:", renderer, "| HARDWARE-GPU:", hwOk ? "YES" : "NO");

async function loadAddr(addr) {
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
  if (!ready) { const errs = await page.evaluate(() => (window.errors || []).slice(-8)); console.log("  NOT READY —", JSON.stringify(errs)); return false; }
  await page.waitForTimeout(13000);
  return true;
}

// probe spurious creases with the merge toggled OFF then ON (same loaded roof)
async function probe(noMerge) {
  return await page.evaluate((nm) => {
    window.__noMerge = nm;
    const GV = window.__geoVerify || {};
    const r = GV.spuriousCreaseProbe ? GV.spuriousCreaseProbe(0.30) : { err: "no-probe" };
    const types = (() => { try { const m = GV.facetsToRoofModel(); const t = {}; for (const e of m.edges) t[e.type]=(t[e.type]||0)+1; return t; } catch(e){ return {err:String(e)}; } })();
    console.log("PROBE noMerge=" + nm + " " + JSON.stringify({ total:r.total, spurious:r.spurious, real:r.real, merge:r.merge, types }));
    return { spur: r, types };
  }, noMerge);
}

async function paintTopDown() {
  await page.evaluate(() => { window.__noMerge = false; });   // ship merge ON for the visual
  const td = await page.evaluate(() => {
    try { const GV = window.__geoVerify || {}; const fn = (GV.renderRoofDiagram) || window.renderRoofDiagram;
      if (fn && fn()) { const mc = document.getElementById("matCanvas"); mc.style.display = "block"; mc.style.zIndex = "40";
        const sc = document.getElementById("scene"); if (sc) sc.style.display = "none";
        const gw = document.getElementById("gmapWrap"); if (gw) gw.style.display = "none"; return true; } }
    catch (e) { console.log("geo-err topdown " + e.message); } return false;
  });
  await page.waitForTimeout(900);
  return td;
}

const report = {};
for (const addr of ADDRS) {
  const s = slug(addr);
  console.log(`\n=== ${addr} ===`);
  try {
    const ok = await loadAddr(addr);
    if (!ok) { report[s] = { ready:false }; continue; }
    const before = await probe(true);    // merge OFF
    const after  = await probe(false);   // merge ON
    const td = await paintTopDown();
    const path = `${OUT}/${ROUND}-${s}.png`;
    await page.screenshot({ path });
    try { const mc = page.locator("#matCanvas"); if (await mc.isVisible().catch(()=>false)) await mc.screenshot({ path: `${OUT}/${ROUND}-${s}-canvas.png` }); } catch (_) {}
    const crease = await page.evaluate(() => (window.__geoVerify && window.__geoVerify.creaseDeviation) ? window.__geoVerify.creaseDeviation() : (window.__creaseDev||null));
    console.log(`  td=${td} -> ${path}`);
    console.log(`  SPURIOUS  before(merge off): ${before.spur.spurious}/${before.spur.total}  | after(merge on): ${after.spur.spurious}/${after.spur.total}`);
    console.log(`  TYPES     before: ${JSON.stringify(before.types)}  | after: ${JSON.stringify(after.types)}`);
    console.log(`  MERGE:    ${JSON.stringify(after.spur.merge)}`);
    if (crease && crease.after) console.log(`  CREASE-DEV after-snap:`, JSON.stringify(crease.after));
    report[s] = { addr, before: before.spur, after: after.spur, beforeTypes: before.types, afterTypes: after.types, crease: crease && { before: crease.before, after: crease.after } };
  } catch (e) { console.log("  ERROR:", e.message); report[s] = { error: e.message }; }
}
fs.writeFileSync(`${OUT}/_iter3-${ROUND}.json`, JSON.stringify({ round: ROUND, renderer, hwOk, report }, null, 2));
await browser.close();
console.log("\nDONE round", ROUND);

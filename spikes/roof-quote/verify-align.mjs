// verify-align.mjs — REAL-GPU verification of the footprint→Google-roof registration.
// Drives roof3d.html HEADED with d3d11/ANGLE, asserts a hardware renderer, geocodes each
// address by typing + clicking the suggestion, waits for __roofReady, opens the Measure
// top-down overlay (renderRoofDiagram: RGB aerial + red facet/footprint outline), and
// screenshots BEFORE (?align=off) and AFTER for each address into audits/align/.
// Usage: node verify-align.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const OUT = "C:/Users/Owner/claude-orchestrator/audits/align";
const PORT = process.env.PORT || 5318;
const ADDRS = [
  "30 Angus Rd, Hamilton ON",
  "4521 T St, Sacramento CA",
  "12 Maple Ave, Barrington RI",   // 3rd residential of my choice (detached single-family, OSM/MS footprint coverage)
];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36);

const browser = await chromium.launch({
  headless: false,
  args: ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-accelerated-2d-canvas"],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("console", (m) => { const t = m.text(); if (/ALIGNDUMP|geo-err|vector-fp/i.test(t)) console.log("  [page]", t); });

// ---- renderer assertion (must be hardware, not SwiftShader) ----
await page.goto(`http://localhost:${PORT}/roof3d`, { waitUntil: "domcontentloaded", timeout: 60000 });
const renderer = await page.evaluate(() => {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    const dbg = gl && gl.getExtension("WEBGL_debug_renderer_info");
    return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : (gl ? "no-debug-ext" : "no-webgl");
  } catch (e) { return "err:" + e.message; }
});
console.log("RENDERER:", renderer);
const hwOk = /Intel|Direct3D11|NVIDIA|AMD|Radeon|ANGLE/i.test(renderer) && !/SwiftShader|software/i.test(renderer);
console.log("HARDWARE-GPU:", hwOk ? "YES" : "NO (WARNING — software render)");

async function drive(addr, alignOff) {
  const url = `http://localhost:${PORT}/roof3d` + (alignOff ? "?align=off" : "");
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1000);
  // wait for the Places autocomplete to be wired. On load the HERO owns the empty state and the
  // top #addr bar is hidden behind it, so type into the visible #addrHero (its onPick leaves the
  // hero + runs the quote). Fall back to #addr if the hero isn't present.
  for (let i = 0; i < 30; i++) { if (await page.evaluate(() => !!window.__acReady)) break; await page.waitForTimeout(300); }
  const heroLoc = page.locator("#addrHero");
  const heroVisible = await heroLoc.isVisible().catch(() => false);
  const input = heroVisible ? heroLoc : page.locator("#addr");
  await input.click();
  await input.fill("");
  await input.pressSequentially(addr, { delay: 60 });
  await page.waitForTimeout(2000);   // let fetchAutocompleteSuggestions resolve + paint the dropdown
  // The dropdown is a body-appended div (style position:absolute;z-index:60); its child rows are the
  // suggestions. Click the FIRST row (the full-address match) so run() resolves the exact parcel via place_id.
  let picked = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll("body > div")].filter(d => /position:\s*absolute/.test(d.getAttribute("style")||"") && d.style.zIndex === "60" && d.style.display !== "none" && d.children.length);
    const box = boxes[0];
    if (box && box.children[0]) {
      const r = box.children[0].getBoundingClientRect();
      return { ok: true, text: box.children[0].textContent, x: r.left + r.width/2, y: r.top + r.height/2 };
    }
    return { ok: false };
  });
  if (picked.ok) {
    console.log("  suggestion:", JSON.stringify(picked.text));
    // dispatch mousedown (the row's onmousedown handler fires choose() → exact-parcel resolve)
    await page.mouse.move(picked.x, picked.y);
    await page.mouse.down(); await page.mouse.up();
    await page.waitForTimeout(400);
  } else {
    console.log("  no suggestion dropdown — falling back to direct run()");
    await page.evaluate((a) => {
      try { if (typeof window.__leaveHero === "function") window.__leaveHero(); } catch (_) {}
      const ab = document.getElementById("addr"); if (ab) ab.value = a;
      if (typeof window.run === "function") window.run(a);
      else { const go = document.getElementById("go"); if (go) go.click(); }
    }, addr);
  }
  await page.waitForTimeout(800);
  // poll roofReady up to 90s
  let ready = false;
  for (let i = 0; i < 90; i++) {
    ready = await page.evaluate(() => !!window.__roofReady);
    if (ready) break;
    await page.waitForTimeout(1000);
  }
  if (!ready) {
    const errs = await page.evaluate(() => (window.errors || []).slice(-8));
    console.log("  NOT READY — errors:", JSON.stringify(errs));
    return { ready: false };
  }
  await page.waitForTimeout(13000);   // let the full build settle per brief
  // dump alignment diagnostics
  const dump = await page.evaluate(() => {
    const out = {};
    try {
      out.alignDiag = window.__alignDiag || null;
      out.footprintSource = window.__footprintSourceUsed || window.__footprintSource || null;
      out.splitDiag = window.__splitDiag || null;
      const spv = (window.LASTB && window.LASTB.solarPotential) || {};
      out.segCount = (spv.roofSegmentStats || []).length;
      out.hasMask = !!window.LASTMASK;
      console.log("ALIGNDUMP " + JSON.stringify(out));
    } catch (e) { out.err = String(e && e.message || e); }
    return out;
  });
  // open the Measure top-down overlay (RGB aerial + red facet/footprint outline)
  const td = await page.evaluate(() => {
    try {
      const GV = window.__geoVerify || {};
      const fn = (GV.renderRoofDiagram) || window.renderRoofDiagram;
      if (fn && fn()) {
        const mc = document.getElementById("matCanvas");
        mc.style.display = "block"; mc.style.zIndex = "40";
        const sc = document.getElementById("scene"); if (sc) sc.style.display = "none";
        const gw = document.getElementById("gmapWrap"); if (gw) gw.style.display = "none";
        return true;
      }
    } catch (e) { console.log("geo-err topdown " + e.message); }
    return false;
  });
  await page.waitForTimeout(900);
  return { ready: true, dump, td };
}

const report = {};
for (const addr of ADDRS) {
  const s = slug(addr);
  console.log(`\n=== ${addr} ===`);
  for (const mode of [{ off: true, tag: "before" }, { off: false, tag: "after" }]) {
    try {
      const r = await drive(addr, mode.off);
      if (!r.ready) { console.log(`  ${mode.tag}: NOT READY`); continue; }
      const path = `${OUT}/${s}-${mode.tag}.png`;
      await page.screenshot({ path });
      console.log(`  ${mode.tag}: td=${r.td} -> ${path}`);
      console.log(`  ${mode.tag} alignDiag:`, JSON.stringify(r.dump.alignDiag));
      console.log(`  ${mode.tag} source:`, r.dump.footprintSource, "split:", JSON.stringify(r.dump.splitDiag));
      report[`${s}-${mode.tag}`] = r.dump;
    } catch (e) { console.log(`  ${mode.tag} ERROR:`, e.message); }
  }
}
fs.writeFileSync(`${OUT}/_align-report.json`, JSON.stringify({ renderer, hwOk, report }, null, 2));
await browser.close();
console.log("\nDONE — renderer:", renderer);

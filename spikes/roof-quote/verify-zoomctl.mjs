// Headed real-GPU verification for the +/- zoom controls on every map surface
// (select-roof Google map, roofline dot-editor canvas, solar panel-designer canvas).
// Run: PORT=5110 node verify-zoomctl.mjs <OUTDIR>   (server must already serve $PORT)
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import path from "path";

const PORT = process.env.PORT || 5110;
const OUT = process.argv[2] || "C:/Users/Owner/AppData/Local/Temp/claude/c--Users-Owner-claude-orchestrator/f34f9730-5f88-4a6b-982d-55bc9b30a918/scratchpad/roof-zoom";
mkdirSync(OUT, { recursive: true });
const ADDR = "30 Angus Rd, Hamilton, ON";
const GPU = ["--ignore-gpu-blocklist", "--enable-gpu", "--enable-webgl", "--use-angle=d3d11", "--enable-unsafe-swiftshader"];
const log = (...a) => console.log("[zoom]", ...a);

async function run(viewport, tag) {
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, tag + "-" + name + ".png") });
  const browser = await chromium.launch({ headless: false, args: GPU });
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push("PAGEERROR: " + e.message));
  const result = { renderer: null, errors, surfaces: {} };

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const renderer = await page.evaluate(() => {
    try { const c = document.createElement("canvas"); const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
      const ext = gl.getExtension("WEBGL_debug_renderer_info"); return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL); } catch (e) { return "n/a:" + e.message; }
  });
  result.renderer = renderer;
  result.swiftshader = /swiftshader|software/i.test(renderer);
  log(tag, "renderer =", renderer);

  // ── enter address ───────────────────────────────────────────────────────
  const heroVisible = await page.locator("#addrHero").isVisible().catch(() => false);
  if (heroVisible) { await page.fill("#addrHero", ADDR); await page.waitForTimeout(400); await page.keyboard.press("Enter"); }
  else { await page.fill("#addr", ADDR); await page.click("#go"); }

  // ── SURFACE 1: SELECT-ROOF Google map (#srMap) ───────────────────────────
  await page.waitForSelector("#srContinue", { state: "visible", timeout: 90000 }).catch(() => {});
  // wait for the Google select-roof map to actually initialize (desktop init can lag the button)
  await page.waitForFunction(() => !!(window.__srMap && window.__srMap.getZoom && window.__srMap.getZoom() != null), { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  {
    // confirm the Google zoom control (+/-) is present & visible in the DOM, and scrollwheel zoom works.
    const srInfo = await page.evaluate(() => {
      const map = window.__srMap;
      const z0 = map && map.getZoom ? map.getZoom() : null;
      // Google renders zoom control buttons with aria-label "Zoom in"/"Zoom out"
      const btns = [...document.querySelectorAll('#srMap button[aria-label], #srMap [aria-label]')]
        .filter(b => /zoom/i.test(b.getAttribute("aria-label") || ""));
      const vis = btns.map(b => { const r = b.getBoundingClientRect(); return { label: b.getAttribute("aria-label"), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; });
      return { z0, ctrlCount: btns.length, ctrls: vis, mapBox: (() => { const e = document.getElementById("srMap"); const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })() };
    });
    log(tag, "SELECT-ROOF:", JSON.stringify(srInfo));
    await shot(page, "1a-selectroof-before");
    // click the Google "Zoom in" control button
    const zinBtn = await page.$('#srMap [aria-label="Zoom in"]');
    let zAfterIn = srInfo.z0, zAfterOut = srInfo.z0, clicked = false;
    if (zinBtn) {
      clicked = true;
      await zinBtn.click().catch(() => {});
      await page.waitForTimeout(900);
      zAfterIn = await page.evaluate(() => window.__srMap && window.__srMap.getZoom ? window.__srMap.getZoom() : null);
      await shot(page, "1b-selectroof-zoomedin");
      const zoutBtn = await page.$('#srMap [aria-label="Zoom out"]');
      if (zoutBtn) { await zoutBtn.click().catch(() => {}); await zoutBtn.click().catch(() => {}); await page.waitForTimeout(900); }
      zAfterOut = await page.evaluate(() => window.__srMap && window.__srMap.getZoom ? window.__srMap.getZoom() : null);
      await shot(page, "1c-selectroof-zoomedout");
    }
    // scrollwheel zoom over the map
    const box = await page.$("#srMap").then(e => e.boundingBox());
    const zPreWheel = await page.evaluate(() => window.__srMap && window.__srMap.getZoom ? window.__srMap.getZoom() : null);
    if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, -400); await page.waitForTimeout(800); }
    const zPostWheel = await page.evaluate(() => window.__srMap && window.__srMap.getZoom ? window.__srMap.getZoom() : null);
    result.surfaces.selectRoof = {
      ctrlVisible: srInfo.ctrls.filter(c => c.w >= 24 && c.h >= 24).length >= 2,
      ctrls: srInfo.ctrls, z0: srInfo.z0, clicked, zAfterIn, zAfterOut,
      plusZoomsIn: zAfterIn != null && srInfo.z0 != null && zAfterIn > srInfo.z0,
      minusZoomsOut: zAfterOut != null && zAfterIn != null && zAfterOut < zAfterIn,
      wheelWorks: zPostWheel != null && zPreWheel != null && zPostWheel > zPreWheel,
    };
    log(tag, "SELECT-ROOF result:", JSON.stringify(result.surfaces.selectRoof));
    // advance past select-roof
    for (let i = 0; i < 3; i++) { const v = await page.locator("#srContinue").isVisible().catch(() => false); if (!v) break; await page.click("#srContinue").catch(() => {}); await page.waitForTimeout(2000); }
  }

  // ── SURFACE 2: ROOFLINE DOT-EDITOR canvas (#dotEditor) ────────────────────
  await page.waitForFunction(() => window.__roofReady === true, { timeout: 120000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { try { window.__editRoofOutline(); } catch (e) {} });
  await page.waitForSelector("#dotHud", { state: "visible", timeout: 20000 });
  await page.waitForTimeout(1500);
  {
    const ctlVis = await page.evaluate(() => {
      const c = document.getElementById("dotZoom");
      if (!c) return { present: false };
      const r = c.getBoundingClientRect();
      const inB = document.getElementById("dotZoomIn"), outB = document.getElementById("dotZoomOut");
      const ir = inB.getBoundingClientRect(), or = outB.getBoundingClientRect();
      return { present: true, display: getComputedStyle(c).display, box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        inBtn: { w: Math.round(ir.width), h: Math.round(ir.height) }, outBtn: { w: Math.round(or.width), h: Math.round(or.height) } };
    });
    log(tag, "DOT-EDITOR ctrl:", JSON.stringify(ctlVis));
    const s0 = await page.evaluate(() => window.RoofDots ? window.RoofDots.vpScale() : (window.__rd && window.__rd.vpScale ? window.__rd.vpScale() : null));
    await shot(page, "2a-dotedit-before");
    // click + three times
    for (let i = 0; i < 3; i++) { await page.click("#dotZoomIn").catch(() => {}); await page.waitForTimeout(350); }
    const sIn = await page.evaluate(() => window.RoofDots ? window.RoofDots.vpScale() : null);
    await shot(page, "2b-dotedit-zoomedin");
    // click - twice
    for (let i = 0; i < 2; i++) { await page.click("#dotZoomOut").catch(() => {}); await page.waitForTimeout(350); }
    const sOut = await page.evaluate(() => window.RoofDots ? window.RoofDots.vpScale() : null);
    await shot(page, "2c-dotedit-zoomedout");
    // wheel zoom over the canvas
    const sPreW = await page.evaluate(() => window.RoofDots ? window.RoofDots.vpScale() : null);
    const cbox = await page.$("#dotEditor").then(e => e ? e.boundingBox() : null);
    if (cbox) { await page.mouse.move(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2); await page.mouse.wheel(0, -300); await page.waitForTimeout(500); }
    const sPostW = await page.evaluate(() => window.RoofDots ? window.RoofDots.vpScale() : null);
    result.surfaces.dotEditor = {
      ctrlVisible: ctlVis.present && ctlVis.display !== "none" && ctlVis.inBtn.w >= 36 && ctlVis.inBtn.h >= 36,
      ctl: ctlVis, s0, sIn, sOut,
      plusZoomsIn: s0 != null && sIn != null && sIn > s0 + 0.001,
      minusZoomsOut: sIn != null && sOut != null && sOut < sIn - 0.001,
      wheelWorks: sPreW != null && sPostW != null && sPostW > sPreW + 0.001,
    };
    log(tag, "DOT-EDITOR result:", JSON.stringify(result.surfaces.dotEditor));
    // close the editor (Done) to proceed to branch choice
    await page.evaluate(() => { try { window.RoofDots && window.RoofDots.hide(); } catch (e) {} });
    await page.waitForTimeout(800);
  }

  // ── SURFACE 3: SOLAR panel-designer canvas (#sgCanvas) ────────────────────
  await page.evaluate(() => { try { window.__openSolarGrid && window.__openSolarGrid(); } catch (e) {} });
  await page.waitForTimeout(2500);
  {
    const sgVisible = await page.locator("#solarGrid").isVisible().catch(() => false);
    const ctlVis = await page.evaluate(() => {
      const c = document.getElementById("sgZoom");
      if (!c) return { present: false };
      const r = c.getBoundingClientRect();
      const inB = document.getElementById("sgZoomIn"), outB = document.getElementById("sgZoomOut");
      const ir = inB.getBoundingClientRect(), or = outB.getBoundingClientRect();
      return { present: true, display: getComputedStyle(c).display, box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        inBtn: { w: Math.round(ir.width), h: Math.round(ir.height) }, outBtn: { w: Math.round(or.width), h: Math.round(or.height) } };
    });
    log(tag, "SOLAR open=", sgVisible, "ctrl:", JSON.stringify(ctlVis));
    const s0 = await page.evaluate(() => (window.__sgVpScale ? window.__sgVpScale() : null));
    await shot(page, "3a-solar-before");
    for (let i = 0; i < 3; i++) { await page.click("#sgZoomIn").catch(() => {}); await page.waitForTimeout(350); }
    const sIn = await page.evaluate(() => (window.__sgVpScale ? window.__sgVpScale() : null));
    await shot(page, "3b-solar-zoomedin");
    for (let i = 0; i < 2; i++) { await page.click("#sgZoomOut").catch(() => {}); await page.waitForTimeout(350); }
    const sOut = await page.evaluate(() => (window.__sgVpScale ? window.__sgVpScale() : null));
    await shot(page, "3c-solar-zoomedout");
    const sPreW = await page.evaluate(() => (window.__sgVpScale ? window.__sgVpScale() : null));
    const cbox = await page.$("#sgCanvas").then(e => e ? e.boundingBox() : null);
    if (cbox) { await page.mouse.move(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2); await page.mouse.wheel(0, -300); await page.waitForTimeout(500); }
    const sPostW = await page.evaluate(() => (window.__sgVpScale ? window.__sgVpScale() : null));
    result.surfaces.solar = {
      open: sgVisible,
      ctrlVisible: ctlVis.present && ctlVis.display !== "none" && ctlVis.inBtn.w >= 36 && ctlVis.inBtn.h >= 36,
      ctl: ctlVis, s0, sIn, sOut,
      plusZoomsIn: s0 != null && sIn != null && sIn > s0 + 0.001,
      minusZoomsOut: sIn != null && sOut != null && sOut < sIn - 0.001,
      wheelWorks: sPreW != null && sPostW != null && sPostW > sPreW + 0.001,
    };
    log(tag, "SOLAR result:", JSON.stringify(result.surfaces.solar));
  }

  result.errors = errors;
  await browser.close();
  return result;
}

const desktop = await run({ width: 1280, height: 900 }, "desktop");
const mobile = await run({ width: 375, height: 760 }, "mobile");
console.log("\n===== RESULT =====");
for (const [tag, r] of [["desktop", desktop], ["mobile", mobile]]) {
  console.log(`\n--- ${tag} ---  renderer=${r.renderer}  swiftshader=${r.swiftshader}  errors=${r.errors.length}`);
  console.log("  selectRoof:", JSON.stringify(r.surfaces.selectRoof));
  console.log("  dotEditor :", JSON.stringify(r.surfaces.dotEditor));
  console.log("  solar     :", JSON.stringify(r.surfaces.solar));
  if (r.errors.length) console.log("  ERRORS:", r.errors.slice(0, 8));
}

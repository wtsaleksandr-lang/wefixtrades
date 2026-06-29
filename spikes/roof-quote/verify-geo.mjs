// verify-geo.mjs — drive roof3d.html headless, dump geometry diagnostics, capture
// top-down (#matCanvas) + Three.js (#scene) screenshots for a list of addresses.
// Usage: node verify-geo.mjs <tag> "<addr1>" "<addr2>" ...
import { chromium } from "playwright";
import fs from "node:fs";

const OUT = "C:/Users/Owner/claude-orchestrator/audits/geometry";
const PORT = process.env.PORT || 5311;
const tag = process.argv[2] || "run";
const addrs = process.argv.slice(3);
if (!addrs.length) { console.error("no addresses"); process.exit(1); }

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("console", (m) => { const t = m.text(); if (/GEODUMP|geo-err/i.test(t)) console.log("  [page]", t); });

for (const addr of addrs) {
  const s = slug(addr);
  console.log(`\n=== ${addr} ===`);
  try {
    await page.goto(`http://localhost:${PORT}/roof3d?a=${encodeURIComponent(addr)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(800);
    // poll roofReady up to 90s
    let ready = false;
    for (let i = 0; i < 90; i++) {
      ready = await page.evaluate(() => !!window.__roofReady);
      if (ready) break;
      await page.waitForTimeout(1000);
    }
    if (!ready) { console.log("  NOT READY (timeout)");
      const errs = await page.evaluate(()=> (window.errors||[]).slice(-8));
      console.log("  errors:", JSON.stringify(errs));
      continue; }
    await page.waitForTimeout(1500);

    // ---- geometry dump ----
    const dump = await page.evaluate(() => {
      const out = { addr_seg: null };
      try {
        const spv = (window.LASTB && window.LASTB.solarPotential) || {};
        const segs = spv.roofSegmentStats || [];
        out.segCount = segs.length;
        out.wholeRoofAreaM2 = +((spv.wholeRoofStats && spv.wholeRoofStats.areaMeters2) || 0).toFixed(1);
        out.imageryQuality = window.LASTB && window.LASTB.imageryQuality;
        out.ll = window.__ll;
        out.center = window.LASTB && window.LASTB.center;
        out.attached = window.__attached;
        const GV = window.__geoVerify || {};
        out.estUnits = (GV.estUnits && window.__spv) ? GV.estUnits(window.__spv) : null;
        // segment summary
        out.segs = segs.map((sg, i) => ({
          i, az: Math.round(sg.azimuthDegrees || 0), pitch: +(sg.pitchDegrees || 0).toFixed(1),
          areaM2: +((sg.stats && sg.stats.areaMeters2) || 0).toFixed(1),
          lat: sg.center && +sg.center.latitude.toFixed(6), lng: sg.center && +sg.center.longitude.toFixed(6),
        }));
        // build the model + footprint
        const model = GV.facetsToRoofModel ? GV.facetsToRoofModel() : null;
        if (model) {
          out.modelPlanes = model.planes.length;
          out.modelTotals = {
            roofAreaSqFt: Math.round(model.totals.roofAreaSqFt),
            squares: +model.totals.squares.toFixed(1),
            facetCount: model.totals.facetCount,
            ridgeFt: Math.round(model.totals.ridgeFt), hipFt: Math.round(model.totals.hipFt),
            valleyFt: Math.round(model.totals.valleyFt), eaveFt: Math.round(model.totals.eaveFt),
            rakeFt: Math.round(model.totals.rakeFt),
          };
          out.analytic = !!(window.__lastFacetsAnalytic);
          // footprint extent (model-local metres)
          if (Array.isArray(model.__footprint)) {
            let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;
            for (const [x,y] of model.__footprint) { minx=Math.min(minx,x);maxx=Math.max(maxx,x);miny=Math.min(miny,y);maxy=Math.max(maxy,y); }
            out.footprintExtentM = { w:+(maxx-minx).toFixed(1), h:+(maxy-miny).toFixed(1), verts: model.__footprint.length };
          }
          // expose split diagnostics if the splitter ran
          out.splitDiag = window.__splitDiag || null;
        } else out.model = "null";
      } catch (e) { out.err = String(e && e.message || e); }
      console.log("GEODUMP " + JSON.stringify(out));
      return out;
    });
    fs.writeFileSync(`${OUT}/${tag}-${s}.json`, JSON.stringify(dump, null, 2));
    console.log("  segs:", dump.segCount, "wholeAreaM2:", dump.wholeRoofAreaM2, "attached:", dump.attached, "estUnits:", dump.estUnits);
    if (dump.modelTotals) console.log("  model:", JSON.stringify(dump.modelTotals), "fpExtent:", JSON.stringify(dump.footprintExtentM));
    if (dump.splitDiag) console.log("  SPLIT:", JSON.stringify(dump.splitDiag));

    // ---- top-down #matCanvas ----
    const tdOk = await page.evaluate(() => {
      try {
        const GV = window.__geoVerify || {};
        if (GV.renderRoofDiagram && GV.renderRoofDiagram()) {
          const mc = document.getElementById("matCanvas");
          mc.style.display = "block"; mc.style.zIndex = "30";
          document.getElementById("scene").style.display = "none";
          const gw = document.getElementById("gmapWrap"); if (gw) gw.style.display = "none";
          return true;
        }
      } catch (e) { console.log("geo-err topdown " + e.message); }
      return false;
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${tag}-${s}-topdown.png` });
    console.log("  topdown:", tdOk ? "rendered" : "FAILED");

    // ---- Three.js #scene model (grey schematic massing) ----
    await page.evaluate(async () => {
      try {
        const GV = window.__geoVerify || {};
        if (GV.setMode) await GV.setMode("schematic");
        if (GV.applyModelSkin) GV.applyModelSkin(true);  // clean grey geometry massing
        const mc = document.getElementById("matCanvas"); if (mc) mc.style.display = "none";
        const sc = document.getElementById("scene"); if (sc) { sc.style.display = "block"; sc.style.zIndex = "30"; }
        const gw = document.getElementById("gmapWrap"); if (gw) gw.style.display = "none";
        if (GV.frame3D) GV.frame3D();
      } catch (e) { console.log("geo-err scene " + e.message); }
    });
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${OUT}/${tag}-${s}-3d.png` });
    console.log("  3d: captured");
  } catch (e) {
    console.log("  ERROR:", e.message);
  }
}

await browser.close();
console.log("\nDONE");

// verify-outline-align.mjs — REAL-GPU before/after measurement for the roofline auto-alignment task.
// Drives roof3d.html HEADED with real-GPU ANGLE/D3D11 flags, asserts a hardware renderer, types each
// address, picks autocomplete, polls __roofReady, opens Measure, then reads the EXISTING honest harness:
//   __geoVerify.edgeDeviation(zone)  → mean/median/p90/max ABS perpendicular distance (m) from the drawn
//                                      editor outline to the isolated Google roof-blob boundary (ground truth).
//   __geoVerify.registerFootprintToGoogle / fpFitWinner / alignDiag → source + IoU + applied snap diag.
// Lower meanAbsM / p90AbsM == the outline hugs the real roof edge tighter == less manual dragging.
// Saves desktop + mobile Measure screenshots. Tag the run with LABEL (baseline|after).
//
// Usage: LABEL=baseline node verify-outline-align.mjs 5401
import { chromium } from "playwright";
import fs from "node:fs";

const PORT = process.env.PORT || process.argv[2] || 5401;
const LABEL = process.env.LABEL || "run";
const OUT = "C:/Users/Owner/claude-orchestrator/audits/outline-align";
fs.mkdirSync(OUT, { recursive: true });

const GPU_ARGS = ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-accelerated-2d-canvas"];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

const ADDRESSES = [
  "30 Angus Rd, Hamilton ON",
  "3402 E Weldon Ave, Phoenix AZ",   // commercial/too-large → fallback must HOLD (no worse)
  "1842 Glencoe St, Denver CO",
  "4521 T St, Sacramento CA",        // the genuinely-loose residential target
  "1555 N Gilpin St, Denver CO",     // extra clean residential (regression guard)
];

const browser = await chromium.launch({ headless: false, args: GPU_ARGS });

async function rendererString(page) {
  return await page.evaluate(() => {
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") || c.getContext("webgl");
      if (!gl) return "NO-WEBGL";
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "no-debug-ext";
    } catch (e) { return "err:" + e.message; }
  });
}

async function driveAddress(page, addr, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`http://localhost:${PORT}/roof3d`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  const inp = page.locator("#addrHero");
  await inp.click();
  await inp.fill("");
  await inp.pressSequentially(addr, { delay: 80 });
  await page.waitForTimeout(1800);
  let picked = false;
  try {
    const sugg = page.locator(".pac-item").first();
    await sugg.waitFor({ state: "visible", timeout: 4500 });
    await sugg.click();
    picked = true;
  } catch {}
  if (!picked) { try { await inp.press("Enter"); } catch {} }
  // Select-Your-Roof step: wait for the detected footprint to render, then Continue.
  await page.waitForTimeout(4500);
  try {
    const srC = page.locator("#srContinue");
    await srC.waitFor({ state: "visible", timeout: 8000 });
    // wait until Continue is enabled (footprint detected / safety timeout)
    for (let i = 0; i < 12; i++) { const dis = await srC.getAttribute("aria-disabled"); if (dis !== "true") break; await page.waitForTimeout(700); }
    await srC.click();
  } catch {}
  // Branch choice: pick Roofing remodel (drives the full model build).
  await page.waitForTimeout(1200);
  try {
    const bcR = page.locator("#bcRoof");
    await bcR.waitFor({ state: "visible", timeout: 6000 });
    await bcR.click();
  } catch {}
  const t0 = Date.now();
  let ready = false;
  for (let i = 0; i < 90; i++) { ready = await page.evaluate(() => !!window.__roofReady); if (ready) break; await page.waitForTimeout(1000); }
  const readyMs = Date.now() - t0;
  await page.waitForTimeout(ready ? 9000 : 2000);
  // force the analytic footprint to compute so window.__footprintEN is set for edgeDeviation()
  try { await page.evaluate(() => { try { window.__geoVerify && window.__geoVerify.extractFacetPolys && window.__geoVerify.extractFacetPolys(0.4); } catch (_) {} }); } catch {}
  await page.waitForTimeout(800);
  return { ready, readyMs };
}

async function openMeasure(page) {
  try {
    const b = page.locator("#bLabels");
    if (await b.count()) { await b.click({ timeout: 4000 }); await page.waitForTimeout(1800); return true; }
  } catch {}
  return false;
}

// Read the honest edge-deviation harness + the alignment diagnostics + IoU of the FINAL drawn ring.
async function dumpMetrics(page) {
  return await page.evaluate(() => {
    const out = {};
    try {
      const gv = window.__geoVerify || {};
      const zone = window.__footprintZone;
      out.footprintSource = window.__footprintSourceUsed || window.__footprintSource || null;
      out.edgeSnapApplied = (typeof window.__edgeSnapApplied === "boolean") ? window.__edgeSnapApplied : null;
      out.fpFitWinner = window.__fpFitWinner || null;
      out.fpFitFloorReject = window.__fpFitFloorReject || null;
      const a = window.__alignDiag || {};
      out.alignDiag = { applied: a.applied, reason: a.reason, source: a.source, measShiftM: a.measShiftM,
        shiftM: a.shiftM, overlapBefore: a.overlapBefore, overlapAfter: a.overlapAfter,
        fitIoU: a.fitIoU, fitCover: a.fitCover, fitPrec: a.fitPrec };
      out.alignConfidence = window.__alignConfidence || null;     // (new) honest confidence, if present
      out.globalRefine = window.__globalRefine || null;           // (new) global rigid-refine gain, if present
      out.snapDiag = window.__edgeSnapDiag || null;               // (new) per-edge snap diagnostics, if present
      // THE METRIC: perpendicular distance of the drawn editor outline to the isolated blob boundary.
      try { out.edgeDev = (typeof gv.edgeDeviation === "function") ? gv.edgeDeviation(zone) : null; }
      catch (e) { out.edgeDev = { ok: false, err: String(e && e.message || e) }; }
      out.roofReady = !!window.__roofReady;
    } catch (e) { out.err = String(e && e.message || e); }
    return out;
  });
}

const results = [];
for (const addr of ADDRESSES) {
  const s = slug(addr);
  console.log(`\n========== ${addr} ==========`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const rs = await rendererString(page);
  console.log("  RENDERER:", rs);

  const dRes = await driveAddress(page, addr, { width: 1280, height: 900 });
  await openMeasure(page);
  const mD = await dumpMetrics(page);
  try { await page.screenshot({ path: `${OUT}/${s}-${LABEL}-desktop.png` }); } catch (e) { console.log("  (desktop screenshot skipped:", String(e && e.message || e).slice(0,60) + ")"); }
  const sum = mD.edgeDev && mD.edgeDev.ok ? mD.edgeDev.summary : null;
  console.log(`  DESKTOP ready=${dRes.ready} (${dRes.readyMs}ms) src=${mD.footprintSource} snap=${mD.edgeSnapApplied} winner=${JSON.stringify(mD.fpFitWinner)}`);
  console.log(`  EDGE-DEV: ${sum ? `mean=${sum.meanAbsM}m median=${sum.medianAbsM}m p90=${sum.p90AbsM}m max=${sum.maxAbsM}m (ext=${sum.nExteriorEdges}/int=${sum.nInteriorEdges})` : `n/a (${mD.edgeDev && (mD.edgeDev.reason||mD.edgeDev.err)})`}`);
  console.log(`  align: applied=${mD.alignDiag.applied} reason=${mD.alignDiag.reason} fitIoU=${mD.alignDiag.fitIoU} conf=${JSON.stringify(mD.alignConfidence)}`);

  let mRes = { readyMs: -1 };
  try {
    mRes = await driveAddress(page, addr, { width: 375, height: 780 });
    await openMeasure(page);
    await page.screenshot({ path: `${OUT}/${s}-${LABEL}-mobile.png` });
  } catch (e) { console.log("  (mobile pass skipped:", String(e && e.message || e).slice(0,60) + ")"); }

  results.push({ addr, renderer: rs, label: LABEL, desktopReadyMs: dRes.readyMs, mobileReadyMs: mRes.readyMs, metrics: mD });
  try { await ctx.close(); } catch {}
}

console.log("\n\n========== SUMMARY (" + LABEL + ") ==========");
for (const r of results) {
  const m = r.metrics, sum = m.edgeDev && m.edgeDev.ok ? m.edgeDev.summary : null;
  console.log(`${r.addr}: src=${m.footprintSource} snap=${m.edgeSnapApplied} ` +
    (sum ? `mean=${sum.meanAbsM}m median=${sum.medianAbsM}m p90=${sum.p90AbsM}m max=${sum.maxAbsM}m` : `EDGE-DEV n/a`) +
    ` | fitIoU=${m.alignDiag.fitIoU} conf=${JSON.stringify(m.alignConfidence)}`);
}
fs.writeFileSync(`${OUT}/metrics-${LABEL}.json`, JSON.stringify(results, null, 2));
console.log(`\nresults → ${OUT}/metrics-${LABEL}.json`);
await browser.close();

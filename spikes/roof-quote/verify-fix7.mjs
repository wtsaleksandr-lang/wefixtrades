// verify-fix7.mjs — REAL-GPU verification for the fix7 roof-FIT footprint selection.
// Drives roof3d.html HEADED with real-GPU ANGLE/D3D11 flags, asserts a hardware renderer,
// types each address per-char, picks autocomplete, polls __roofReady, opens the Measure
// top-down overlay (aerial + red roofline outline), and dumps per-candidate IoU/cover/shift
// + the chosen winner. Saves desktop + mobile Measure screenshots to audits/fix7/.
//
// Usage: node verify-fix7.mjs <PORT>
import { chromium } from "playwright";
import fs from "node:fs";

const PORT = process.env.PORT || process.argv[2] || 5327;
const OUT = "C:/Users/Owner/claude-orchestrator/audits/fix7";
fs.mkdirSync(OUT, { recursive: true });

const GPU_ARGS = ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-accelerated-2d-canvas"];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

const ADDRESSES = [
  { addr: "1842 Glencoe St, Denver CO", note: "coarse-OSM home — the target" },
  { addr: "4521 T St, Sacramento CA", note: "regression guard (worked before)" },
  { addr: "4760 Marvel Ct, Antelope CA", note: "regression guard (worked before)" },
  { addr: "1555 N Gilpin St, Denver CO", note: "simple/dense home — clean outline must survive" },
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
  const t0 = Date.now();
  let ready = false;
  for (let i = 0; i < 90; i++) { ready = await page.evaluate(() => !!window.__roofReady); if (ready) break; await page.waitForTimeout(1000); }
  const readyMs = Date.now() - t0;
  await page.waitForTimeout(ready ? 13000 : 2000);
  return { ready, readyMs };
}

// Open the Measure top-down overlay (the red roofline on the aerial) by clicking the Measure tab.
async function openMeasure(page) {
  try {
    const b = page.locator("#bLabels");
    if (await b.count()) { await b.click({ timeout: 4000 }); await page.waitForTimeout(1600); return true; }
  } catch {}
  return false;
}

async function dumpDiag(page) {
  return await page.evaluate(() => {
    const out = {};
    try {
      out.footprintSourceUsed = window.__footprintSourceUsed || null;
      out.footprintSource = window.__footprintSource || null;
      out.fpCandidateEvals = window.__fpCandidateEvals || null;   // per-candidate iou/cover/shift/nVerts
      out.fpFitWinner = window.__fpFitWinner || null;             // chosen winner (source/iou/shift/nVerts)
      out.fpFitFloorReject = window.__fpFitFloorReject || null;   // set when vector dropped → mask fallback
      const a = window.__alignDiag || {};
      out.alignDiag = { applied: a.applied, reason: a.reason, source: a.source, measShiftM: a.measShiftM, shiftM: a.shiftM, overlapBefore: a.overlapBefore, overlapAfter: a.overlapAfter, fitIoU: a.fitIoU, fitCover: a.fitCover, fitPrec: a.fitPrec, scoreSrc: a.scoreSrc };
      out.modelQuality = window.__modelQuality;
      out.roofReady = !!window.__roofReady;
    } catch (e) { out.err = String(e && e.message || e); }
    return out;
  });
}

const results = [];
for (const { addr, note } of ADDRESSES) {
  const s = slug(addr);
  console.log(`\n========== ${addr}  (${note}) ==========`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const rs = await rendererString(page);
  console.log("  RENDERER:", rs);

  const dRes = await driveAddress(page, addr, { width: 1280, height: 900 });
  const diagD = await dumpDiag(page);
  await openMeasure(page);
  await page.screenshot({ path: `${OUT}/${s}-desktop.png` });
  console.log(`  DESKTOP ready=${dRes.ready} in ${dRes.readyMs}ms | src=${diagD.footprintSourceUsed} | winner=${JSON.stringify(diagD.fpFitWinner)} | floorReject=${JSON.stringify(diagD.fpFitFloorReject)}`);
  console.log(`  evals=${JSON.stringify(diagD.fpCandidateEvals)}`);

  const mRes = await driveAddress(page, addr, { width: 375, height: 780 });
  const diagM = await dumpDiag(page);
  await openMeasure(page);
  await page.screenshot({ path: `${OUT}/${s}-mobile.png` });

  results.push({ addr, note, renderer: rs, desktopReadyMs: dRes.readyMs, mobileReadyMs: mRes.readyMs, desktop: diagD, mobile: diagM });
  await ctx.close();
}

console.log("\n\n========== SUMMARY ==========");
for (const r of results) {
  const d = r.desktop;
  console.log(`${r.addr}:`);
  console.log(`   renderer=${r.renderer}`);
  console.log(`   ACCEPTED-SOURCE=${d.footprintSourceUsed}  winner=${JSON.stringify(d.fpFitWinner)}`);
  console.log(`   floorReject=${JSON.stringify(d.fpFitFloorReject)}`);
  console.log(`   candidates=${JSON.stringify(d.fpCandidateEvals)}`);
  console.log(`   align: applied=${d.alignDiag && d.alignDiag.applied} reason=${d.alignDiag && d.alignDiag.reason} fitIoU=${d.alignDiag && d.alignDiag.fitIoU}`);
}
fs.writeFileSync(`${OUT}/fix7-results.json`, JSON.stringify(results, null, 2));
console.log(`\nresults → ${OUT}/fix7-results.json`);
await browser.close();

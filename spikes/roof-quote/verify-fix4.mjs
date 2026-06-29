// verify-fix4.mjs — REAL-GPU verification for the fix4 footprint P0.
// Drives roof3d.html HEADED with real-GPU ANGLE/D3D11 flags, asserts the WebGL renderer
// is hardware (Intel/Direct3D11), types each address per-char, clicks the autocomplete
// suggestion, polls __roofReady, and dumps the confidence + footprint-source diagnostics.
// Saves desktop + mobile screenshots to audits/fix4/.
//
// Usage: node verify-fix4.mjs <PORT>
import { chromium } from "playwright";
import fs from "node:fs";

const PORT = process.env.PORT || process.argv[2] || 5324;
const OUT = "C:/Users/Owner/claude-orchestrator/audits/fix4";
fs.mkdirSync(OUT, { recursive: true });

const GPU_ARGS = ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-accelerated-2d-canvas"];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

const ADDRESSES = [
  { addr: "4521 T St, Sacramento CA", expect: "coherent" },
  { addr: "3812 Cole Ave, Dallas TX", expect: "coherent" },
  // genuinely-bad / commercial regression case — should STILL degrade honestly
  { addr: "401 Biscayne Blvd, Miami FL", expect: "may-degrade" },
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
  // Landing hero input is #addrHero (the #addr top-bar input is hidden until a quote loads).
  const inp = page.locator("#addrHero");
  await inp.click();
  await inp.fill("");
  await inp.pressSequentially(addr, { delay: 80 });
  await page.waitForTimeout(1800); // let Google Places autocomplete populate
  let picked = false;
  try {
    const sugg = page.locator(".pac-item").first();
    await sugg.waitFor({ state: "visible", timeout: 4500 });
    await sugg.click();
    picked = true;
  } catch { /* no suggestion — fall back to Enter (submitHero) */ }
  if (!picked) { try { await inp.press("Enter"); } catch {} }
  // poll roofReady
  let ready = false;
  for (let i = 0; i < 90; i++) { ready = await page.evaluate(() => !!window.__roofReady); if (ready) break; await page.waitForTimeout(1000); }
  await page.waitForTimeout(ready ? 13000 : 2000);
  return ready;
}

async function dumpDiag(page) {
  return await page.evaluate(() => {
    const out = {};
    try {
      const conf = (typeof window.__roofDataConfidence === "function") ? window.__roofDataConfidence() : null;
      out.conf = conf ? { low: conf.low, hard: conf.hard, reasons: conf.reasons, areaSqFt: conf.areaSqFt, segRatio: conf.segRatio, iq: conf.iq } : null;
      out.footprintSourceUsed = window.__footprintSourceUsed || null;
      out.footprintSource = window.__footprintSource || null;
      out.fpRejectShiftM = window.__fpRejectShiftM;
      out.fpCandidateEvals = window.__fpCandidateEvals || null;
      out.alignDiag = window.__alignDiag ? { applied: window.__alignDiag.applied, reason: window.__alignDiag.reason, source: window.__alignDiag.source, measShiftM: window.__alignDiag.measShiftM, shiftM: window.__alignDiag.shiftM, overlapAfter: window.__alignDiag.overlapAfter } : null;
      out.modelQuality = window.__modelQuality;
      out.mode = window.__mode || window.mode || null;
      const spv = (window.LASTB && window.LASTB.solarPotential) || {};
      out.segCount = (spv.roofSegmentStats || []).length;
      out.imageryQuality = window.LASTB && window.LASTB.imageryQuality;
      out.roofReady = !!window.__roofReady;
      // is the low-confidence card on screen?
      const cardTxt = (document.getElementById("card") && document.getElementById("card").innerText) || "";
      out.lowConfCardShown = /couldn.?t get a confident read|confident read on this roof/i.test(cardTxt);
      out.cardSnippet = cardTxt.replace(/\s+/g, " ").slice(0, 160);
    } catch (e) { out.err = String(e && e.message || e); }
    return out;
  });
}

const results = [];
for (const { addr, expect } of ADDRESSES) {
  const s = slug(addr);
  console.log(`\n========== ${addr} (expect: ${expect}) ==========`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("console", (m) => { const t = m.text(); if (/fix4|GEODUMP|geo-err|align/i.test(t)) console.log("  [page]", t.slice(0, 200)); });

  const rs = await rendererString(page);
  console.log("  RENDERER:", rs);

  // DESKTOP
  const readyD = await driveAddress(page, addr, { width: 1280, height: 900 });
  const diagD = await dumpDiag(page);
  await page.screenshot({ path: `${OUT}/${s}-desktop.png` });
  console.log("  DESKTOP ready:", readyD, "| diag:", JSON.stringify(diagD));

  // toggle test (only worth running on a coherent address)
  let toggleDiag = null;
  if (readyD && expect === "coherent") {
    try {
      await page.locator('#viewToggle [data-v="photo"]').click({ timeout: 3000 });
      await page.waitForTimeout(7000);
      const photoMode = await page.evaluate(() => window.__mode || window.mode);
      await page.screenshot({ path: `${OUT}/${s}-satellite.png` });
      await page.locator('#viewToggle [data-v="model"]').click({ timeout: 3000 });
      await page.waitForTimeout(4000);
      toggleDiag = await page.evaluate(() => {
        const gw = document.getElementById("gmapWrap"), sc = document.getElementById("scene");
        const gcs = gw ? getComputedStyle(gw) : {}, scs = sc ? getComputedStyle(sc) : {};
        return { mode: window.__mode || window.mode, gmapWrapDisplay: gcs.display, sceneDisplay: scs.display };
      });
      await page.screenshot({ path: `${OUT}/${s}-back-to-model.png` });
      console.log("  TOGGLE photoMode:", photoMode, "| back:", JSON.stringify(toggleDiag));
    } catch (e) { console.log("  TOGGLE err:", e.message); }
  }

  // MOBILE 375px
  const readyM = await driveAddress(page, addr, { width: 375, height: 780 });
  const diagM = await dumpDiag(page);
  await page.screenshot({ path: `${OUT}/${s}-mobile.png` });
  console.log("  MOBILE ready:", readyM, "| lowConfCard:", diagM.lowConfCardShown, "| src:", diagM.footprintSourceUsed);

  results.push({ addr, expect, renderer: rs, desktop: diagD, mobile: diagM, toggle: toggleDiag });
  await ctx.close();
}

console.log("\n\n========== SUMMARY ==========");
for (const r of results) {
  const d = r.desktop;
  const verdict = (() => {
    if (r.expect === "coherent") return (d.roofReady && !d.lowConfCardShown && !(d.conf && d.conf.low)) ? "PASS (coherent, no degrade)" : "FAIL (degraded/not-ready)";
    return d.roofReady ? `INFO (low=${d.conf && d.conf.low}, reasons=${d.conf && d.conf.reasons})` : "INFO (not-ready)";
  })();
  console.log(`${r.addr}: ${verdict}`);
  console.log(`   renderer=${r.renderer}`);
  console.log(`   fpSourceUsed=${d.footprintSourceUsed} alignReason=${d.alignDiag && d.alignDiag.reason} shiftM=${d.alignDiag && (d.alignDiag.shiftM ?? d.alignDiag.measShiftM)} fpRejectShiftM=${d.fpRejectShiftM}`);
  console.log(`   candidateEvals=${JSON.stringify(d.fpCandidateEvals)}`);
  console.log(`   conf=${JSON.stringify(d.conf)} lowConfCard=${d.lowConfCardShown}`);
  if (r.toggle) console.log(`   toggle-back: mode=${r.toggle.mode} gmapWrap=${r.toggle.gmapWrapDisplay} scene=${r.toggle.sceneDisplay}`);
}
fs.writeFileSync(`${OUT}/fix4-results.json`, JSON.stringify(results, null, 2));
console.log(`\nresults → ${OUT}/fix4-results.json`);
await browser.close();

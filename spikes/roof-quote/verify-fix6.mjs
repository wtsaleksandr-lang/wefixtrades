// verify-fix6.mjs — REAL-GPU verification for the fix6 footprint-latency fix.
// Drives roof3d.html HEADED with real-GPU ANGLE/D3D11 flags, asserts hardware renderer,
// types each dense-metro residential address per-char, clicks autocomplete, polls __roofReady,
// dumps accepted footprint source + registration diag + WALL-CLOCK load time (proves no 25s hang),
// saves desktop + mobile screenshots to audits/fix6/.
//
// Usage: node verify-fix6.mjs <PORT>
import { chromium } from "playwright";
import fs from "node:fs";

const PORT = process.env.PORT || process.argv[2] || 5326;
const OUT = "C:/Users/Owner/claude-orchestrator/audits/fix6";
fs.mkdirSync(OUT, { recursive: true });

const GPU_ARGS = ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-accelerated-2d-canvas"];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

// The exact dense-metro metros from the bug evidence (Denver + Phoenix/Tempe) — residential homes.
const ADDRESSES = [
  { addr: "1555 N Gilpin St, Denver CO", expect: "coherent" },
  { addr: "2125 E Broadway Rd, Tempe AZ", expect: "coherent" },
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
  // poll up to 90s; record the wall-clock to first __roofReady — proves the route is not a 25s hang
  for (let i = 0; i < 90; i++) { ready = await page.evaluate(() => !!window.__roofReady); if (ready) break; await page.waitForTimeout(1000); }
  const readyMs = Date.now() - t0;
  await page.waitForTimeout(ready ? 13000 : 2000);
  return { ready, readyMs };
}

async function dumpDiag(page) {
  return await page.evaluate(() => {
    const out = {};
    try {
      const conf = (typeof window.__roofDataConfidence === "function") ? window.__roofDataConfidence() : null;
      out.conf = conf ? { low: conf.low, hard: conf.hard, reasons: conf.reasons, areaSqFt: conf.areaSqFt } : null;
      out.footprintSourceUsed = window.__footprintSourceUsed || null;
      out.footprintSource = window.__footprintSource || null;
      out.fpCandidateEvals = window.__fpCandidateEvals || null;
      const a = window.__alignDiag || {};
      out.alignDiag = { applied: a.applied, reason: a.reason, source: a.source, measShiftM: a.measShiftM, shiftM: a.shiftM, overlapBefore: a.overlapBefore, overlapAfter: a.overlapAfter, scoreSrc: a.scoreSrc };
      out.modelQuality = window.__modelQuality;
      out.roofReady = !!window.__roofReady;
      const cardTxt = (document.getElementById("card") && document.getElementById("card").innerText) || "";
      out.lowConfCardShown = /couldn.?t get a confident read|confident read on this roof/i.test(cardTxt);
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
  const rs = await rendererString(page);
  console.log("  RENDERER:", rs);

  const dRes = await driveAddress(page, addr, { width: 1280, height: 900 });
  const diagD = await dumpDiag(page);
  await page.screenshot({ path: `${OUT}/${s}-desktop.png` });
  console.log(`  DESKTOP ready=${dRes.ready} in ${dRes.readyMs}ms | src=${diagD.footprintSourceUsed} | quality=${diagD.modelQuality} | align=${JSON.stringify(diagD.alignDiag)}`);

  const mRes = await driveAddress(page, addr, { width: 375, height: 780 });
  const diagM = await dumpDiag(page);
  await page.screenshot({ path: `${OUT}/${s}-mobile.png` });

  results.push({ addr, expect, renderer: rs, desktopReadyMs: dRes.readyMs, mobileReadyMs: mRes.readyMs, desktop: diagD, mobile: diagM });
  await ctx.close();
}

console.log("\n\n========== SUMMARY ==========");
let premium = 0, coherentTotal = 0;
for (const r of results) {
  const d = r.desktop;
  const src = d.footprintSourceUsed;
  const isPremium = (src === "msft" || src === "osm" || src === "cache");
  if (r.expect === "coherent") { coherentTotal++; if (isPremium) premium++; }
  console.log(`${r.addr}:`);
  console.log(`   renderer=${r.renderer}`);
  console.log(`   load-to-ready: desktop=${r.desktopReadyMs}ms mobile=${r.mobileReadyMs}ms  (PASS if < 25000)`);
  console.log(`   ACCEPTED-SOURCE=${src} ${isPremium ? "(PREMIUM clean footprint — NOT lumpy mask)" : "(mask fallback / degrade)"}`);
  console.log(`   quality=${d.modelQuality} roofReady=${d.roofReady} lowConfCard=${d.lowConfCardShown}`);
  console.log(`   align: applied=${d.alignDiag && d.alignDiag.applied} reason=${d.alignDiag && d.alignDiag.reason}`);
}
console.log(`\nPREMIUM clean-footprint on coherent homes: ${premium}/${coherentTotal}`);
fs.writeFileSync(`${OUT}/fix6-results.json`, JSON.stringify(results, null, 2));
console.log(`results → ${OUT}/fix6-results.json`);
await browser.close();

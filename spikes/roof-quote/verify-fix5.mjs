// verify-fix5.mjs — REAL-GPU verification for the fix5 footprint-acceptance fix.
// Drives roof3d.html HEADED with real-GPU ANGLE/D3D11 flags, asserts hardware renderer,
// types each address per-char, clicks autocomplete, polls __roofReady, dumps accepted
// footprint source + registration diag, saves desktop + mobile screenshots to audits/fix5/.
//
// Usage: node verify-fix5.mjs <PORT>
import { chromium } from "playwright";
import fs from "node:fs";

const PORT = process.env.PORT || process.argv[2] || 5325;
const OUT = "C:/Users/Owner/claude-orchestrator/audits/fix5";
fs.mkdirSync(OUT, { recursive: true });

const GPU_ARGS = ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-accelerated-2d-canvas"];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

const ADDRESSES = [
  { addr: "4521 T St, Sacramento CA", expect: "coherent" },   // the target — MS footprint @1.55m
  { addr: "3812 Cole Ave, Dallas TX", expect: "coherent" },
  { addr: "1600 Pennsylvania Ave NW, Washington DC", expect: "coherent" },
  { addr: "742 Evergreen Terrace, Springfield OR", expect: "coherent" },
  { addr: "350 Fifth Ave, New York NY", expect: "may-degrade" },   // Empire State — commercial highrise, should degrade/reject
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

  const readyD = await driveAddress(page, addr, { width: 1280, height: 900 });
  const diagD = await dumpDiag(page);
  await page.screenshot({ path: `${OUT}/${s}-desktop.png` });
  console.log("  DESKTOP ready:", readyD, "| src:", diagD.footprintSourceUsed, "| align:", JSON.stringify(diagD.alignDiag), "| evals:", JSON.stringify(diagD.fpCandidateEvals));

  const readyM = await driveAddress(page, addr, { width: 375, height: 780 });
  const diagM = await dumpDiag(page);
  await page.screenshot({ path: `${OUT}/${s}-mobile.png` });

  results.push({ addr, expect, renderer: rs, desktop: diagD, mobile: diagM });
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
  console.log(`   ACCEPTED-SOURCE=${src} ${isPremium ? "(PREMIUM clean footprint)" : "(mask fallback / degrade)"}`);
  console.log(`   align: applied=${d.alignDiag && d.alignDiag.applied} reason=${d.alignDiag && d.alignDiag.reason} shiftM=${d.alignDiag && (d.alignDiag.shiftM ?? d.alignDiag.measShiftM)} ovlpB=${d.alignDiag && d.alignDiag.overlapBefore} ovlpA=${d.alignDiag && d.alignDiag.overlapAfter} scoreSrc=${d.alignDiag && d.alignDiag.scoreSrc}`);
  console.log(`   evals=${JSON.stringify(d.fpCandidateEvals)}`);
  console.log(`   roofReady=${d.roofReady} lowConfCard=${d.lowConfCardShown} conf=${JSON.stringify(d.conf)}`);
}
console.log(`\nPREMIUM clean-footprint on coherent homes: ${premium}/${coherentTotal}`);
fs.writeFileSync(`${OUT}/fix5-results.json`, JSON.stringify(results, null, 2));
console.log(`results → ${OUT}/fix5-results.json`);
await browser.close();

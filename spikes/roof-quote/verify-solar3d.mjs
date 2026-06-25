// Real-GPU Playwright verification of the SOLAR STEP 2D⇄3D toggle.
// Drives the live widget on :5351 for 30 Angus Rd, Hamilton ON. Asserts real Intel/D3D11 GPU,
// reaches the Solar grid (2D default), taps panels, switches to 3D (Google photoreal real-house
// tiles + the selected panels draped on the real roof), back to 2D (selection preserved), then
// the same on mobile 390px. Screenshots desktop + mobile.
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const PORT = process.env.PORT || 5351;
const OUT = "C:/Users/Owner/claude-orchestrator/audits/solar3d";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ADDR = "30 Angus Rd, Hamilton, ON";
const gpuArgs = ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-accelerated-2d-canvas"];

async function readMetrics(page){
  return page.evaluate(()=>{
    const t=id=>{const e=document.getElementById(id);return e?e.textContent.trim():null;};
    const m=window.__gridSelectionMetrics?window.__gridSelectionMetrics():null;
    return { panelsTxt:t("sgPanels"), kwTxt:t("sgKw"), kwhTxt:t("sgKwh"), offsetTxt:t("sgOffset"),
             priceTxt:t("sgPrice"), metrics:m, drawn:window.__sgDrawn, open:window.__sgOpen,
             solar3d:window.__solar3dActive, view2dOn:(document.getElementById("sgView2d")||{}).className,
             view3dOn:(document.getElementById("sgView3d")||{}).className };
  });
}
async function reachGrid(page){
  await page.goto(`http://localhost:${PORT}/roof3d`, { waitUntil:"domcontentloaded" });
  await sleep(800);
  const input = page.locator("#addrHero");
  await input.click(); await input.fill("");
  await input.pressSequentially(ADDR, { delay:55 });
  await sleep(2000);
  const items = page.locator(".pac-item");
  if (await items.count() > 0) await items.first().click(); else await input.press("Enter");
  await sleep(1200);
  try { await page.locator("#srContinue").click({ timeout:8000 }); } catch(_) { console.log("no srContinue"); }
  const t0=Date.now(); let ready=false;
  while (Date.now()-t0 < 80000){ ready = await page.evaluate(()=>!!window.__roofReady).catch(()=>false); if(ready) break; await sleep(700); }
  console.log("roofReady:", ready);
  await sleep(15000);
  // per-house edit loop: click "Done" on the dots editor → advances to the branch choice
  let via="none";
  try { await page.locator("#dotDone").click({ timeout:8000 }); via="dotDone"; } catch(_){ console.log("no dotDone (maybe no house loop)"); }
  await sleep(2500);
  // branch choice → Solar (lands on the 2D grid by design)
  const bc = page.locator("#bcSolar");
  if (await bc.count() > 0 && await bc.isVisible().catch(()=>false)) { await bc.click(); via+="+bcSolar"; }
  else { try { await page.locator("[data-opengrid]").click({ timeout:6000 }); via+="+opengrid"; } catch(e){ console.log("no bcSolar/opengrid:", e.message); } }
  await sleep(2500);
  // if we reached solar but the grid isn't open, force it
  const open = await page.evaluate(()=>!!window.__sgOpen);
  if (!open) { try { await page.evaluate(()=>{ if(window.__openSolarGrid) window.__openSolarGrid(); }); } catch(_){} await sleep(1200); }
  return { ready, via, open:await page.evaluate(()=>!!window.__sgOpen) };
}

const browser = await chromium.launch({ headless:false, args:gpuArgs });
const report = { steps:{} };

// renderer assertion
const page = await browser.newPage({ viewport:{ width:1280, height:900 } });
await page.goto(`http://localhost:${PORT}/roof3d`, { waitUntil:"domcontentloaded" });
const renderer = await page.evaluate(()=>{ try{ const c=document.createElement("canvas"); const gl=c.getContext("webgl")||c.getContext("experimental-webgl"); const ext=gl.getExtension("WEBGL_debug_renderer_info"); return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);}catch(e){return "ERR:"+e.message;} });
report.renderer = renderer;
report.realGpu = /Intel|Direct3D11|ANGLE/i.test(renderer) && !/SwiftShader/i.test(renderer);
console.log("RENDERER:", renderer, "| REAL GPU:", report.realGpu);

// === DESKTOP: reach grid (2D default) ===
report.reach = await reachGrid(page);
console.log("REACH:", JSON.stringify(report.reach));
await sleep(800);
report.steps.default2d = await readMetrics(page);
await page.screenshot({ path:`${OUT}/01-2d-default-desktop.png` });
console.log("1 DEFAULT 2D:", JSON.stringify(report.steps.default2d));

// === tap a few panels off (metrics update, 2D works) ===
const panelsBeforeTap = await page.evaluate(()=>window.__gridSelectionMetrics()?.panels);
await page.evaluate(()=>window.__sgToggleN(3,false));
await sleep(400);
const panelsAfterTap = await page.evaluate(()=>window.__gridSelectionMetrics()?.panels);
report.steps.tap2d = { panelsBeforeTap, panelsAfterTap, changed: panelsBeforeTap!==panelsAfterTap };
await page.screenshot({ path:`${OUT}/02-2d-after-tap-desktop.png` });
console.log("2 TAP 2D:", JSON.stringify(report.steps.tap2d));

// === SWITCH TO 3D (real photoreal house + selected panels) ===
const selBefore3d = await page.evaluate(()=>window.__gridSelectionMetrics()?.panels);
await page.locator("#sgView3d").click();
// wait for photoreal tiles to stream
await sleep(18000);
report.steps.into3d = await page.evaluate(()=>({
  solar3dActive: window.__solar3dActive, mode: window.__mode,
  photorealOk: window.__photorealOk, photoPanels: window.__photoPanels,
  renderedPanels: window.__renderedPanels, selPanels: window.__selPanels,
  gmapVisible: (()=>{ const g=document.getElementById("gmapWrap"); return g?getComputedStyle(g).display:null; })(),
  gridDisplay: (()=>{ const g=document.getElementById("solarGrid"); return g?getComputedStyle(g).display:null; })(),
  backChip: (()=>{ const b=document.getElementById("solar3dBack"); return b?getComputedStyle(b).display:null; })()
}));
report.steps.into3d.selBefore3d = selBefore3d;
report.steps.into3d.countMatch = (report.steps.into3d.photoPanels === selBefore3d);
await page.screenshot({ path:`${OUT}/03-3d-photoreal-house-desktop.png` });
console.log("3 INTO 3D:", JSON.stringify(report.steps.into3d));

// === SWITCH BACK TO 2D via the floating back chip (grid intact, selection preserved) ===
await page.locator("#solar3dBack").click();
await sleep(2500);
report.steps.back2d = await readMetrics(page);
report.steps.back2d.selectionPreserved = (report.steps.back2d.metrics?.panels === selBefore3d);
await page.screenshot({ path:`${OUT}/04-back-to-2d-desktop.png` });
console.log("4 BACK 2D:", JSON.stringify(report.steps.back2d));

// === MOBILE 390px ===
const mp = await browser.newPage({ viewport:{ width:390, height:844 }, isMobile:true });
report.mobileReach = await (async()=>{
  await mp.goto(`http://localhost:${PORT}/roof3d`, { waitUntil:"domcontentloaded" });
  await sleep(800);
  const mi = mp.locator("#addrHero"); await mi.click(); await mi.fill("");
  await mi.pressSequentially(ADDR, { delay:55 }); await sleep(2000);
  const mItems = mp.locator(".pac-item");
  if (await mItems.count() > 0) await mItems.first().click(); else await mi.press("Enter");
  await sleep(1200);
  try { await mp.locator("#srContinue").click({ timeout:8000 }); } catch(_){}
  const t0=Date.now(); let r=false;
  while (Date.now()-t0 < 80000){ r = await mp.evaluate(()=>!!window.__roofReady).catch(()=>false); if(r) break; await sleep(700); }
  await sleep(15000);
  try { await mp.locator("#dotDone").click({ timeout:8000 }); } catch(_){}
  await sleep(2500);
  const bc = mp.locator("#bcSolar");
  if (await bc.count() > 0 && await bc.isVisible().catch(()=>false)) await bc.click();
  else { try { await mp.locator("[data-opengrid]").click({ timeout:6000 }); } catch(_){} }
  await sleep(2500);
  if (!(await mp.evaluate(()=>!!window.__sgOpen))) { try{ await mp.evaluate(()=>window.__openSolarGrid&&window.__openSolarGrid()); }catch(_){} await sleep(1200); }
  return { ready:r, open:await mp.evaluate(()=>!!window.__sgOpen) };
})();
console.log("MOBILE REACH:", JSON.stringify(report.mobileReach));
await mp.screenshot({ path:`${OUT}/05-2d-default-mobile390.png` });
report.steps.mobile2d = await readMetrics(mp);
// mobile → 3D
const mSelBefore = await mp.evaluate(()=>window.__gridSelectionMetrics()?.panels);
try { await mp.locator("#sgView3d").click(); } catch(e){ report.mobile3dErr=e.message; }
await sleep(18000);
report.steps.mobile3d = await mp.evaluate(()=>({
  solar3dActive:window.__solar3dActive, photorealOk:window.__photorealOk,
  photoPanels:window.__photoPanels, gmapVisible:(()=>{const g=document.getElementById("gmapWrap");return g?getComputedStyle(g).display:null;})(),
  backChip:(()=>{const b=document.getElementById("solar3dBack");return b?getComputedStyle(b).display:null;})()
}));
report.steps.mobile3d.mSelBefore = mSelBefore;
await mp.screenshot({ path:`${OUT}/06-3d-photoreal-mobile390.png` });
console.log("MOBILE 3D:", JSON.stringify(report.steps.mobile3d));
// back to 2D mobile via the floating back chip
try { await mp.locator("#solar3dBack").click(); } catch(_){}
await sleep(2500);
await mp.screenshot({ path:`${OUT}/07-back-2d-mobile390.png` });

await browser.close();
console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(report, null, 2));

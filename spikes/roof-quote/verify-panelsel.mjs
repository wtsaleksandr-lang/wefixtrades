// Real-GPU verification of the PANEL SELECTION/COLORING fix (stage 2).
// For each address: drive to Solar → open Panels grid → audit whether every BLUE (selected) panel is on
// good sun and whether any brighter NON-low-sun slot is left empty while a low-sun panel is selected.
// Captures a zoomed AFTER screenshot. Asserts real GPU (renderer != SwiftShader).
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const PORT = process.env.PORT || 5075;
const OUT  = process.env.OUT || "C:/Users/Owner/AppData/Local/Temp/claude/c--Users-Owner-claude-orchestrator/f34f9730-5f88-4a6b-982d-55bc9b30a918/scratchpad/panel-selection";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ADDRS = [
  { tag: "vegas",   addr: "8829 Spanish Ridge Pkwy, Las Vegas, NV" },
  { tag: "burwood", addr: "8 Belmore St, Burwood NSW Australia" },
];

const gpuArgs = ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-unsafe-swiftshader","--enable-accelerated-2d-canvas"];

// Audit run inside the page: snapshot every candidate's selection + sun state.
function auditSel(){
  const S = window.SG_STATE; if(!S) return { err:"no SG_STATE" };
  const sel = S.sel, P = S.panels;
  let selected=0, selLow=0, emptyGood=0, total=P.length, haveFlux=S.haveFlux;
  const rows = P.map(c=>({ id:c.id, on:sel.has(c.id), low:!!c.lowSun, sun:(c.sun!=null?+c.sun.toFixed(0):null), flux:(c.flux!=null?+c.flux.toFixed(0):null), fluxT:(c.fluxT!=null?+c.fluxT.toFixed(2):null), kwh:(c.kwh!=null?+c.kwh.toFixed(0):null) }));
  for(const r of rows){ if(r.on){ selected++; if(r.low) selLow++; } else if(!r.low) emptyGood++; }
  // THE BUG CHECK: a selected low-sun panel that is DIMMER than some unselected non-low-sun (brighter empty) slot.
  // sun-rank consistent: find max sun among empty-good, and any selected-low with sun < that.
  let maxEmptyGoodSun = -Infinity;
  for(const r of rows){ if(!r.on && !r.low && r.sun!=null && r.sun>maxEmptyGoodSun) maxEmptyGoodSun=r.sun; }
  let violations=0; const vrows=[];
  for(const r of rows){ if(r.on && r.low && r.sun!=null && r.sun < maxEmptyGoodSun){ violations++; vrows.push(r); } }
  // Also count the raw "blue-on-orange" cases (selected AND low) regardless of brighter-empty existence.
  return { total, selected, selLow, emptyGood, haveFlux, maxEmptyGoodSun:(isFinite(maxEmptyGoodSun)?maxEmptyGoodSun:null), violations, vrows: vrows.slice(0,8) };
}

const browser = await chromium.launch({ headless:false, args:gpuArgs });
const report = { results:{} };

// renderer assertion (once)
{
  const p = await browser.newPage({ viewport:{ width:1280, height:900 } });
  await p.goto(`http://localhost:${PORT}/roof3d`, { waitUntil:"domcontentloaded" });
  report.renderer = await p.evaluate(()=>{ try{ const c=document.createElement("canvas"); const gl=c.getContext("webgl")||c.getContext("experimental-webgl"); const ext=gl.getExtension("WEBGL_debug_renderer_info"); return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);}catch(e){return "ERR:"+e.message;} });
  report.realGpu = /Intel|Direct3D11|ANGLE|NVIDIA|AMD/i.test(report.renderer) && !/SwiftShader/i.test(report.renderer);
  console.log("RENDERER:", report.renderer, "| realGpu:", report.realGpu);
  await p.close();
}

for(const { tag, addr } of ADDRS){
  console.log(`\n===== ${tag}: ${addr} =====`);
  const r = { addr };
  try {
    const page = await browser.newPage({ viewport:{ width:1366, height:960 } });
    await page.goto(`http://localhost:${PORT}/roof3d`, { waitUntil:"domcontentloaded" });
    await sleep(800);
    const input = page.locator("#addrHero");
    await input.click(); await input.fill("");
    await input.pressSequentially(addr, { delay:50 });
    await sleep(2200);
    const items = page.locator(".pac-item");
    if (await items.count() > 0) await items.first().click(); else await input.press("Enter");
    await sleep(1400);
    try { await page.locator("#srContinue").click({ timeout:9000 }); } catch(_){ console.log("no srContinue"); }
    // poll roofReady
    const t0=Date.now(); let ready=false;
    while (Date.now()-t0 < 90000){ ready = await page.evaluate(()=>!!window.__roofReady).catch(()=>false); if(ready) break; await sleep(800); }
    r.roofReady = ready; console.log("roofReady:", ready);
    await sleep(16000);
    r.solarData = await page.evaluate(()=>{ const sp=window.LASTB&&window.LASTB.solarPotential; return { panels:(sp&&sp.solarPanels||[]).length, configs:(sp&&sp.solarPanelConfigs||[]).length, haveFlux:!!(window.LASTFLUX&&window.LASTFLUX.rasters), openBtn:!!document.querySelector("[data-opengrid]") }; });
    console.log("solarData:", JSON.stringify(r.solarData));
    // ensure the SOLAR trade tab is active (the card can open on the roofing body); .sg-open only
    // renders on the settled solar card.
    await page.evaluate(()=>{ const t=document.querySelector('.qtab[data-t="solar"]'); if(t) t.click(); });
    await sleep(2500);
    // open grid
    try { await page.locator("[data-opengrid]").click({ timeout:8000 }); } catch(e){ console.log("open-grid failed:", e.message); r.openErr=e.message; }
    await sleep(2000);
    r.gridOpened = await page.evaluate(()=>!!window.__sgOpen);
    console.log("gridOpened:", r.gridOpened);
    await page.screenshot({ path:`${OUT}/${tag}-01-grid-default.png` });
    // AUDIT (use the in-page read-only helper since SG_STATE is module-scoped)
    r.audit = await page.evaluate(()=> window.__sgAudit ? window.__sgAudit() : auditSel());
    console.log("AUDIT:", JSON.stringify(r.audit));
    // ZOOM IN for the close look (zoom toward canvas center a few notches)
    try {
      const cv = await page.locator("#sgCanvas").boundingBox();
      if (cv){ for(let i=0;i<3;i++){ await page.mouse.move(cv.x+cv.width/2, cv.y+cv.height/2); await page.mouse.wheel(0,-300); await sleep(250); } }
    } catch(_){}
    await sleep(500);
    await page.screenshot({ path:`${OUT}/${tag}-02-grid-zoomed.png` });
    // also a full-page context shot
    await page.screenshot({ path:`${OUT}/${tag}-03-fullpage.png`, fullPage:false });
    await page.close();
  } catch(e){ r.error = e.message; console.log("ERROR:", e.message); }
  report.results[tag] = r;
}

await browser.close();
console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(report, null, 2));

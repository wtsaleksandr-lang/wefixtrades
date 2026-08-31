// Flux-render verification. Drives the widget to the Solar grid for two addresses and screenshots
// the #sgCanvas (the flux heatmap). Tag the output set via FLUXTAG env (before|after).
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const PORT = process.env.PORT || 5434;
const TAG  = process.env.FLUXTAG || "after";
const OUT  = "C:/Users/Owner/claude-orchestrator/audits/google-render";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ADDRS = [
  { key:"sacramento", addr:"4521 T St, Sacramento, CA" },
  { key:"denver",   addr:"1842 Glencoe St, Denver, CO" },
];
const gpuArgs = ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-accelerated-2d-canvas"];

const browser = await chromium.launch({ headless:false, args:gpuArgs });
const page = await browser.newPage({ viewport:{ width:1280, height:900 } });

await page.goto(`http://localhost:${PORT}/roof3d`, { waitUntil:"domcontentloaded" });
const renderer = await page.evaluate(()=>{ try{ const c=document.createElement("canvas"); const gl=c.getContext("webgl")||c.getContext("experimental-webgl"); const ext=gl.getExtension("WEBGL_debug_renderer_info"); return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);}catch(e){return "ERR:"+e.message;} });
const realGpu = /Intel|Direct3D11|ANGLE/i.test(renderer) && !/SwiftShader/i.test(renderer);
console.log("RENDERER:", renderer, "| REAL GPU:", realGpu);
if (!realGpu) { console.error("!!! NOT REAL GPU — aborting"); await browser.close(); process.exit(2); }

const summary = { tag:TAG, renderer, realGpu, addrs:{} };

for (const { key, addr } of ADDRS) {
  console.log(`\n=== ${key}: ${addr} ===`);
  await page.goto(`http://localhost:${PORT}/roof3d`, { waitUntil:"domcontentloaded" });
  await sleep(800);
  const input = page.locator("#addrHero");
  await input.click(); await input.fill("");
  await input.pressSequentially(addr, { delay:55 });
  await sleep(2100);
  const items = page.locator(".pac-item");
  if (await items.count() > 0) await items.first().click(); else await input.press("Enter");
  await sleep(1300);
  try { await page.locator("#srContinue").click({ timeout:8000 }); } catch(_) { console.log("no srContinue"); }

  const t0=Date.now(); let ready=false;
  while (Date.now()-t0 < 85000){ ready = await page.evaluate(()=>!!window.__roofReady).catch(()=>false); if(ready) break; await sleep(700); }
  console.log("roofReady:", ready);
  await sleep(15000);

  const pre = await page.evaluate(()=>{
    const sp = window.LASTB && window.LASTB.solarPotential;
    return { panels:(sp&&sp.solarPanels||[]).length, haveFlux: !!(window.LASTFLUX&&window.LASTFLUX.rasters),
             haveMask: !!(window.LASTMASK&&window.LASTMASK.rasters), rendered:window.__renderedPanels };
  });
  console.log("solar:", JSON.stringify(pre));

  let opened=false;
  try { await page.locator("[data-opengrid]").click({ timeout:6000 }); opened=true; } catch(e){ console.log("open-grid btn click failed, calling openSolarGrid() directly:", e.message); }
  if (!opened) { await page.evaluate(()=>{ try{ if(typeof window.__openSolarGrid==="function") window.__openSolarGrid(); }catch(_){} }); }
  await sleep(2500);
  const open = await page.evaluate(()=>!!window.__sgOpen);
  const fr = await page.evaluate(()=>{ try{ return { fmin:window.SG_STATE&&SG_STATE.fmin, fmax:window.SG_STATE&&SG_STATE.fmax, fluxBest:window.SG_STATE&&SG_STATE.fluxBest, haveFlux:window.SG_STATE&&SG_STATE.haveFlux }; }catch(_){ return null; } });
  console.log("grid open:", open, "| SG_STATE flux range:", JSON.stringify(fr));
  summary.addrs[key] = { ...pre, open, fluxRange:fr };

  // full grid screenshot
  await page.screenshot({ path:`${OUT}/flux-${key}-${TAG}.png` });
  // tight crop of just the canvas
  try {
    const box = await page.locator("#sgCanvas").boundingBox();
    if (box) await page.screenshot({ path:`${OUT}/flux-${key}-${TAG}-canvas.png`,
      clip:{ x:Math.max(0,box.x), y:Math.max(0,box.y), width:box.width, height:box.height } });
  } catch(e){ console.log("canvas crop failed:", e.message); }
}

await browser.close();
console.log("\n=== SUMMARY ===\n" + JSON.stringify(summary, null, 2));

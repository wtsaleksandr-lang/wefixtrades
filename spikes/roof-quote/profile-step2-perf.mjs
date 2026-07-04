// Real-GPU perf verification of the step-2 roofline outline widget fixes.
// Drives /roof3d HEADED with ANGLE/Direct3D11 (asserts NOT SwiftShader), enters Select-Roof for
// 12417 Osborne St LA, dwells, clicks Continue, and MEASURES: click -> outline interactive
// (#dotEditor + RoofDots.editing() + #matCanvas painted). Runs COLD then WARM (same session).
// Captures the loading state (must show satellite + progressive outline, NOT a grey void) and the
// final interactive outline. Uses the main-checkout playwright.
import { chromium } from "playwright";

const PORT = process.env.PORT || 5210;
const OUT  = process.env.OUT  || "C:/Users/Owner/.codex/wft-perfwidget/spikes/roof-quote/showroom";
const ADDR = "12417 Osborne St, Los Angeles, CA 91331";
const GPU_FLAGS = ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-accelerated-2d-canvas"];

function log(...a){ console.log(...a); }

const browser = await chromium.launch({ headless:false, args:GPU_FLAGS });
const ctx = await browser.newContext({ viewport:{width:1280,height:860} });
const page = await ctx.newPage();
const consoleErrs = [];
page.on("console", m=>{ const t=m.text(); if(m.type()==="error"||/error|fail|undefined is not/i.test(t)){ consoleErrs.push(t.slice(0,200)); } });
page.on("pageerror", e=>consoleErrs.push("PAGEERR:"+String(e&&e.message||e).slice(0,200)));

await page.goto(`http://localhost:${PORT}/roof3d?noauto=1`, { waitUntil:"domcontentloaded" });

const gpu = await page.evaluate(()=>{ try{ const c=document.createElement("canvas"); const gl=c.getContext("webgl")||c.getContext("experimental-webgl"); const e=gl.getExtension("WEBGL_debug_renderer_info"); return gl.getParameter(e.UNMASKED_RENDERER_WEBGL); }catch(e){ return "ERR:"+e.message; } });
log("RENDERER:", gpu);
const gpuOk = /intel|direct3d11|angle/i.test(gpu) && !/swiftshader/i.test(gpu);
if(!gpuOk){ log("!! GPU is SwiftShader/blind — aborting (mandate: real GPU)"); await browser.close(); process.exit(2); }

async function enterAddressAndReachContinue(){
  const useHero = await page.evaluate(()=>{ const h=document.querySelector("#addrHero"); return h && h.offsetParent!==null; });
  const target = useHero ? "#addrHero" : "#addr";
  await page.click(target);
  await page.fill(target, "");
  await page.locator(target).pressSequentially(ADDR, { delay: 25 });
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter");
  // wait for the Select-Roof step + Continue to enable
  await page.waitForFunction(()=>{ const b=document.querySelector("#srContinue"); const sr=document.querySelector("#selectRoof"); return sr && sr.style.display!=="none" && b && !b.disabled; }, { timeout:45000 });
}

// Poll the app state right up to interactive, sampling the loading UX along the way.
async function clickContinueAndMeasure(tag){
  // snapshot before click
  const t0 = await page.evaluate(()=>performance.now());
  await page.evaluate(()=>{ window.__perfClickT = performance.now(); });
  await page.click("#srContinue");

  // Capture the loading state ~1.6s after click — should be satellite + settling outline, NOT grey void.
  let loadingShot=false, loadingDom=null;
  const grab = (async()=>{
    await page.waitForTimeout(1600);
    try{ loadingDom = await loadingStateSnapshot(); }catch(_){}
    try{ await page.screenshot({ path:`${OUT}/perf-loading-state${tag?"-"+tag:""}.png` }); loadingShot=true; }catch(_){}
    log("  ["+tag+"] loading DOM @1.6s:", JSON.stringify(loadingDom));
  })();

  // Wait for interactive: #dotEditor visible + RoofDots.editing() + #matCanvas painted (display!=none)
  await page.waitForFunction(()=>{
    try{
      const de=document.querySelector("#dotEditor"); const mc=document.querySelector("#matCanvas");
      const deVis = de && de.offsetParent!==null && getComputedStyle(de).display!=="none";
      const editing = window.RoofDots && typeof window.RoofDots.editing==="function" && window.RoofDots.editing();
      const mcPainted = mc && getComputedStyle(mc).display!=="none";
      return !!(deVis && editing && mcPainted);
    }catch(e){ return false; }
  }, { timeout:60000 });
  const tInteractive = await page.evaluate(()=>performance.now() - window.__perfClickT);
  await grab;

  // also record when __facetsReady / __roofReady flipped (relative to click) for diagnostics
  const flags = await page.evaluate(()=>({ facetsReady:!!window.__facetsReady, roofReady:!!window.__roofReady, srUpgrade:window.__srUpgrade||null }));
  return { tInteractive, loadingShot, flags };
}

// Inspect the loading DOM state at ~1.5s: is #selectRoof (satellite) still visible + settling? is #load grey void shown?
async function loadingStateSnapshot(){
  return await page.evaluate(()=>{
    const sr=document.querySelector("#selectRoof");
    const ld=document.querySelector("#load");
    const st=document.querySelector("#srSettle");
    const srMap=document.querySelector("#srMap");
    const cs=(el)=>el?getComputedStyle(el):null;
    return {
      selectRoofDisplay: sr?sr.style.display||cs(sr).display:null,
      selectRoofSettling: sr?sr.classList.contains("settling"):null,
      srMapVisible: srMap? (cs(srMap).display!=="none" && srMap.offsetParent!==null) : null,
      loadVeilShown: ld? cs(ld).display!=="none" : null,
      settlePillShown: st? cs(st).display!=="none" : null,
    };
  });
}

// ---- COLD VISIT ----
log("\n=== COLD VISIT ===");
await enterAddressAndReachContinue();
// dwell (like a real buyer) so the raster prefetch fires + warms before Continue
await page.waitForTimeout(3000);
const coldSnap = await loadingStateSnapshot();   // pre-click baseline
const cold = await clickContinueAndMeasure("cold");
// re-snapshot the loading DOM right after (best-effort; interactive may already be up)
log("COLD: click->interactive = " + cold.tInteractive.toFixed(0) + " ms   flags=" + JSON.stringify(cold.flags && {facetsReady:cold.flags.facetsReady, roofReady:cold.flags.roofReady, srUpgradeApplied:cold.flags.srUpgrade&&cold.flags.srUpgrade.applied}));
await page.waitForTimeout(1500);
await page.screenshot({ path:`${OUT}/perf-outline.png` });
const coldFinalErrs = consoleErrs.slice();

// verify outline accuracy signal: facet count + area from the editor
const coldMeasure = await page.evaluate(()=>{ const t=window.__editTotals||window.__roofTotals||{}; return { areaSqFt:t.areaSqFt||t.roofAreaSqFt||null, squares:t.squares||null, facets:t.facets||t.facetCount||null, dotsEditing: window.RoofDots&&window.RoofDots.editing&&window.RoofDots.editing() }; });
log("COLD measure:", JSON.stringify(coldMeasure));

// ---- WARM VISIT (same session): restart the flow for the SAME address ----
log("\n=== WARM VISIT (same session) ===");
// return to hero/start: reload keeps the server disk cache + browser HTTP cache warm (true warm floor)
await page.evaluate(()=>{ try{ if(window.RoofDots) window.RoofDots.hide(); }catch(_){} });
await page.goto(`http://localhost:${PORT}/roof3d?noauto=1`, { waitUntil:"domcontentloaded" });
await enterAddressAndReachContinue();
await page.waitForTimeout(3000);
const warm = await clickContinueAndMeasure("warm");
log("WARM: click->interactive = " + warm.tInteractive.toFixed(0) + " ms   flags=" + JSON.stringify(warm.flags && {facetsReady:warm.flags.facetsReady, roofReady:warm.flags.roofReady}));
await page.waitForTimeout(1200);
const warmMeasure = await page.evaluate(()=>{ const t=window.__editTotals||window.__roofTotals||{}; return { areaSqFt:t.areaSqFt||t.roofAreaSqFt||null, squares:t.squares||null, facets:t.facets||t.facetCount||null, dotsEditing: window.RoofDots&&window.RoofDots.editing&&window.RoofDots.editing() }; });
log("WARM measure:", JSON.stringify(warmMeasure));

// ---- REPORT ----
log("\n===================== RESULTS =====================");
log("RENDERER:", gpu, "(real GPU, not SwiftShader:", gpuOk, ")");
log("COLD loading-state snapshot (pre-click):", JSON.stringify(coldSnap));
log("COLD click->interactive:", cold.tInteractive.toFixed(0), "ms   (profile baseline: 9360 ms)");
log("WARM click->interactive:", warm.tInteractive.toFixed(0), "ms   (profile baseline: 2490 ms)");
log("Console errors during run:", consoleErrs.length ? JSON.stringify(consoleErrs.slice(0,8)) : "0");
log("Screenshots: perf-loading-state-cold.png, perf-loading-state-warm.png, perf-outline.png");
log("==================================================");

await browser.close();
process.exit(0);

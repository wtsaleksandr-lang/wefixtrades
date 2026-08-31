// Real-GPU headed verification for the Select-Your-Roof cold-flash fixes (FIX A + FIX B).
// Drives the deployed spike at PORT=5086. Two tests:
//   COLD  — fresh server, FIRST visit to 1842 Glencoe St, Denver CO: home must paint immediately; neighbours pop
//           in within a few seconds (decoupled background load). Clicking a neighbour → "2 buildings selected".
//   SLOW  — Playwright-intercepts /buildings and DELAYS it ~5s to deterministically PROVE the first paint is
//           NOT gated on neighbours: home visible while /buildings is still pending; neighbours pop in after.
//   FLASH — watches the detected outline on a Microsoft-source home: no jarring coarse→precise snap.
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import path from "path";

const OUT = process.env.OUT_DIR || "./out-selectroof";
mkdirSync(OUT, { recursive: true });
const PORT = process.env.PORT || 5086;
const BASE = `http://localhost:${PORT}/roof3d?noauto=1`;
const ADDR = "1842 Glencoe St, Denver, CO 80220, USA";
const GPU_ARGS = ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-unsafe-swiftshader"];
const shot = (page,name)=>page.screenshot({ path: path.join(OUT,name), animations:"disabled" }).then(()=>console.log("  shot:",name));
const sleep = ms=>new Promise(r=>setTimeout(r,ms));

async function buildingCount(page){ return page.evaluate(()=>Array.isArray(window.__srBuildings)?window.__srBuildings.length:-1); }
async function selectedCountText(page){ return page.evaluate(()=>{ const t=document.getElementById("srCountT"); return t?t.textContent.trim():"(no chip)"; }); }
async function hintText(page){ return page.evaluate(()=>{ const t=document.getElementById("srHintT"); return t?t.textContent.trim():"(no hint)"; }); }
async function detectedRefining(page){ return page.evaluate(()=>{ const d=(window.__srBuildings||[]).find(b=>b&&b.detected); return d?{source:d.source,refining:!!d._refining,verts:Array.isArray(d.ring)?d.ring.length:0}:null; }); }

async function enterAddress(page){
  // Type into the hero address field + submit via the page's own entry point for determinism.
  await page.waitForFunction(()=>typeof window.__enterSelectRoof==="function",{timeout:20000});
  await page.evaluate((a)=>window.__enterSelectRoof(a), ADDR);
}

async function renderGpuOk(page){
  return page.evaluate(()=>{ try{ const c=document.createElement("canvas"); const gl=c.getContext("webgl2")||c.getContext("webgl");
    if(!gl) return {ok:false,renderer:"no-webgl"}; const ext=gl.getExtension("WEBGL_debug_renderer_info");
    const r=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER); return {ok:true,renderer:String(r)}; }catch(e){ return {ok:false,renderer:String(e)}; } });
}

(async()=>{
  const browser = await chromium.launch({ headless:false, args:GPU_ARGS });
  const results = {};

  // ───────── TEST 1: COLD first visit ─────────
  {
    const ctx = await browser.newContext({ viewport:{width:1280,height:900} });
    const page = await ctx.newPage();
    const blog=[]; page.on("console",m=>{ const t=m.text(); if(/serving|buildings|footprint|sr-|upgrade/i.test(t)) blog.push(t); });
    const buildReqs=[]; page.on("response",async r=>{ const u=r.url(); if(u.includes("/buildings")){ buildReqs.push({t:Date.now(),status:r.status(),cache:r.headers()["x-cache"]||""}); } });

    const gpu = await renderGpuOk(await (async()=>{ await page.goto(BASE,{waitUntil:"domcontentloaded"}); return page; })());
    console.log("[COLD] GPU renderer:", gpu.renderer);
    results.gpuRenderer = gpu.renderer;

    const t0=Date.now();
    await enterAddress(page);
    // wait until the DETECTED home is on the map (first paint)
    await page.waitForFunction(()=>{ const b=window.__srBuildings; return Array.isArray(b)&&b.some(x=>x&&x.detected&&x.poly); },{timeout:20000});
    const tHome=Date.now()-t0;
    const nAtHome=await buildingCount(page);
    console.log(`[COLD] home painted at +${tHome}ms, buildings now=${nAtHome}`);
    await shot(page,"cold-1-home-painted.png");

    // poll for neighbours to POP IN (background load). A genuine cold first visit needs the MS tile to warm:
    // first /buildings ~6.5s (OSM-only partial) → client retries ~3.5s later → warm /buildings ~2s. Allow ~20s.
    let nMax=nAtHome, tPop=null;
    for(let i=0;i<90;i++){ await sleep(500); const n=await buildingCount(page); if(n>nMax){ nMax=n; if(tPop===null&&n>1) tPop=Date.now()-t0; }
      if(n>1) break; }
    console.log(`[COLD] max buildings=${nMax}, neighbours popped at +${tPop}ms; hint="${await hintText(page)}"`);
    await shot(page,"cold-2-neighbours-popped.png");

    // click a neighbour → expect "2 buildings selected" (fire the real polygon click listener)
    const clicked = await page.evaluate(()=>{ const nb=(window.__srBuildings||[]).find(b=>b&&!b.detected); if(!nb||!nb.poly) return false; try{ google.maps.event.trigger(nb.poly,"click"); return true; }catch(e){ return false; } });
    await sleep(600);
    const selTxt = await selectedCountText(page);
    console.log(`[COLD] clicked neighbour=${clicked}, selected chip="${selTxt}"`);
    await shot(page,"cold-3-after-click.png");

    results.cold = { tHomeMs:tHome, buildingsAtHome:nAtHome, maxBuildings:nMax, neighbourPopMs:tPop, hint:await hintText(page), neighbourClicked:clicked, selectedAfterClick:selTxt, buildingsReqs:buildReqs };
    await ctx.close();
  }

  // ───────── TEST 2: SLOW /buildings (deterministic decoupling proof) ─────────
  {
    const ctx = await browser.newContext({ viewport:{width:1280,height:900} });
    const page = await ctx.newPage();
    // Delay every /buildings response by ~5s so we can OBSERVE the home painting while it's still pending.
    await page.route("**/buildings**", async route=>{ await sleep(5000); await route.continue(); });

    await page.goto(BASE,{waitUntil:"domcontentloaded"});
    const t0=Date.now();
    await enterAddress(page);
    await page.waitForFunction(()=>{ const b=window.__srBuildings; return Array.isArray(b)&&b.some(x=>x&&x.detected&&x.poly); },{timeout:20000});
    const tHome=Date.now()-t0;
    const nAtHome=await buildingCount(page);
    console.log(`[SLOW] home painted at +${tHome}ms (while /buildings artificially delayed 5s), buildings=${nAtHome}`);
    await shot(page,"slow-1-home-while-buildings-pending.png");
    const homeBeforeBuildings = tHome < 4500; // must paint well before the 5s /buildings resolves

    // now wait past the 5s delay for neighbours to inject
    let nMax=nAtHome, tPop=null;
    for(let i=0;i<30;i++){ await sleep(500); const n=await buildingCount(page); if(n>nMax){ nMax=n; if(tPop===null&&n>1) tPop=Date.now()-t0; } if(n>1&&(Date.now()-t0)>7000) break; }
    console.log(`[SLOW] after delay: max buildings=${nMax}, popped at +${tPop}ms`);
    await shot(page,"slow-2-neighbours-after-delay.png");

    results.slow = { tHomeMs:tHome, homePaintedBeforeBuildings:homeBeforeBuildings, buildingsAtHome:nAtHome, maxBuildings:nMax, neighbourPopMs:tPop };
    await ctx.close();
  }

  // ───────── TEST 3: FLASH (coarse→precise hold) ─────────
  {
    const ctx = await browser.newContext({ viewport:{width:1280,height:900} });
    const page = await ctx.newPage();
    await page.goto(BASE,{waitUntil:"domcontentloaded"});
    await enterAddress(page);
    await page.waitForFunction(()=>{ const b=window.__srBuildings; return Array.isArray(b)&&b.some(x=>x&&x.detected&&x.poly); },{timeout:20000});

    // sample the detected home state rapidly to capture the "refining" hold then the settled reveal
    const samples=[];
    for(let i=0;i<24;i++){ const s=await detectedRefining(page); samples.push({t:i*150, ...(s||{})}); if(i===2) await shot(page,"flash-1-initial-refining.png"); await sleep(150); }
    await sleep(800);
    await shot(page,"flash-2-settled.png");
    const sawRefining = samples.some(s=>s.refining===true);
    const settledSource = (await detectedRefining(page))||{};
    const upgrade = await page.evaluate(()=>window.__srUpgrade||null);
    console.log(`[FLASH] sawRefiningHold=${sawRefining}, settledSource=${settledSource.source}, upgrade=`, JSON.stringify(upgrade));
    results.flash = { sawRefiningHold:sawRefining, settled:settledSource, upgrade, samples:samples.filter((s,i)=>i%2===0) };
    await ctx.close();
  }

  await browser.close();
  console.log("\n===RESULTS_JSON===");
  console.log(JSON.stringify(results,null,2));
})().catch(e=>{ console.error("VERIFY FAILED:", e); process.exit(1); });

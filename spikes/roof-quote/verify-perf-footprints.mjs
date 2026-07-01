// Headed real-GPU verification that the perf/footprints changes still render the main outline + neighbours
// correctly on Select-Your-Roof. Drives the widget on a real address, waits for the detected home outline,
// waits for neighbours to fill in, and screenshots desktop + mobile (375px). PASS = home poly present AND
// >=1 neighbour building with a poly.
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import path from "path";

const OUT = process.env.OUT_DIR || "./out-perf-footprints";
mkdirSync(OUT, { recursive: true });
const PORT = process.env.PORT || 5150;
const BASE = `http://localhost:${PORT}/roof3d?noauto=1`;
const ADDR = process.env.ADDR || "4210 Prospect Dr, McKinney, TX 75070";
const GPU_ARGS = ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-unsafe-swiftshader"];
const shot = (page,name)=>page.screenshot({ path: path.join(OUT,name), animations:"disabled" }).then(()=>console.log("  shot:",name));
const sleep = ms=>new Promise(r=>setTimeout(r,ms));

async function renderGpu(page){
  return page.evaluate(()=>{ try{ const c=document.createElement("canvas"); const gl=c.getContext("webgl2")||c.getContext("webgl");
    if(!gl) return {renderer:"no-webgl"}; const ext=gl.getExtension("WEBGL_debug_renderer_info");
    return {renderer:String(ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER))}; }catch(e){ return {renderer:String(e)}; } });
}
async function snap(page){
  return page.evaluate(()=>{
    const bs = window.__srBuildings||[];
    return { total: bs.length, withPoly: bs.filter(b=>b&&b.poly).length,
      detected: bs.filter(b=>b&&b.detected).length, neighbours: bs.filter(b=>b&&!b.detected&&b.poly).length };
  });
}

(async()=>{
  const browser = await chromium.launch({ headless:false, args:GPU_ARGS });
  const errors=[]; const results={};
  try{
    const ctx = await browser.newContext({ viewport:{width:1280,height:900}, deviceScaleFactor:1 });
    const page = await ctx.newPage();
    page.on("console", m=>{ if(m.type()==="error") errors.push("[console] "+m.text()); });
    page.on("pageerror", e=>errors.push("[pageerror] "+String(e)));
    const t0=Date.now();
    await page.goto(BASE,{waitUntil:"domcontentloaded"});
    results.gpu = await renderGpu(page);
    console.log("GPU:", JSON.stringify(results.gpu), "ADDR:", ADDR);
    await page.waitForFunction(()=>typeof window.__enterSelectRoof==="function",{timeout:20000});
    await page.evaluate((a)=>window.__enterSelectRoof(a), ADDR);
    // wait for the detected home outline (poly)
    await page.waitForFunction(()=>{ const b=window.__srBuildings; return Array.isArray(b)&&b.some(x=>x&&x.detected&&x.poly); },{timeout:30000});
    results.homeMs = Date.now()-t0;
    console.log("home outline in", results.homeMs, "ms");
    await sleep(800); await shot(page,"desktop-1-home.png");
    // poll for neighbours (up to ~20s)
    let s=await snap(page); for(let i=0;i<40 && s.total<4;i++){ await sleep(500); s=await snap(page); }
    await sleep(1000); results.desktop = await snap(page);
    console.log("desktop snap:", JSON.stringify(results.desktop));
    await shot(page,"desktop-2-neighbours.png");
    await ctx.close();

    // ---------- MOBILE 375 ----------
    const mctx = await browser.newContext({ viewport:{width:375,height:780}, deviceScaleFactor:2, isMobile:true });
    const mp = await mctx.newPage();
    mp.on("pageerror", e=>errors.push("[m-pageerror] "+String(e)));
    await mp.goto(BASE,{waitUntil:"domcontentloaded"});
    await mp.waitForFunction(()=>typeof window.__enterSelectRoof==="function",{timeout:20000});
    await mp.evaluate((a)=>window.__enterSelectRoof(a), ADDR);
    await mp.waitForFunction(()=>{ const b=window.__srBuildings; return Array.isArray(b)&&b.some(x=>x&&x.detected&&x.poly); },{timeout:30000});
    let ms=await snap(mp); for(let i=0;i<40 && ms.total<4;i++){ await sleep(500); ms=await snap(mp); }
    await sleep(1000); results.mobile = await snap(mp);
    console.log("mobile snap:", JSON.stringify(results.mobile));
    await shot(mp,"mobile-1-neighbours.png");
    await mctx.close();
  } catch(e){ errors.push("[fatal] "+String(e&&e.stack||e)); }
  finally { await browser.close(); }

  const d=results.desktop||{}, m=results.mobile||{};
  const pass = d.detected>=1 && d.withPoly>=1 && (d.neighbours>=1 || m.neighbours>=1);
  console.log("\n=== RESULT ===");
  console.log("PASS:", pass);
  console.log("home outline ms:", results.homeMs);
  console.log("desktop:", JSON.stringify(d), "mobile:", JSON.stringify(m));
  if(errors.length) console.log("errors:\n"+errors.slice(0,12).join("\n"));
  process.exit(pass?0:1);
})();

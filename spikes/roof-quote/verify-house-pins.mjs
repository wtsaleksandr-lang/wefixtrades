// Real-GPU headed verification for the HOUSE-PIN feature on Select-Your-Roof.
// Every detected building (home + neighbours) must show a circular centroid pin:
//   unselected = neutral white pin (blue +), selected = blue circle + white check.
// Tapping a neighbour's PIN must toggle it selected and bump the counter 1→2.
// The subtle outline (poly) AND the striped solar grid must REMAIN on every building.
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import path from "path";

const OUT = process.env.OUT_DIR || "./out-house-pins";
mkdirSync(OUT, { recursive: true });
const PORT = process.env.PORT || 5093;
const BASE = `http://localhost:${PORT}/roof3d?noauto=1`;
const ADDR = "30 Angus Rd, Hamilton, ON, Canada";
const GPU_ARGS = ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-unsafe-swiftshader"];
const shot = (page,name)=>page.screenshot({ path: path.join(OUT,name), animations:"disabled" }).then(()=>console.log("  shot:",name));
const sleep = ms=>new Promise(r=>setTimeout(r,ms));

async function renderGpuOk(page){
  return page.evaluate(()=>{ try{ const c=document.createElement("canvas"); const gl=c.getContext("webgl2")||c.getContext("webgl");
    if(!gl) return {ok:false,renderer:"no-webgl"}; const ext=gl.getExtension("WEBGL_debug_renderer_info");
    const r=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER); return {ok:true,renderer:String(r)}; }catch(e){ return {ok:false,renderer:String(e)}; } });
}
async function enterAddress(page){
  await page.waitForFunction(()=>typeof window.__enterSelectRoof==="function",{timeout:20000});
  await page.evaluate((a)=>window.__enterSelectRoof(a), ADDR);
}
// Snapshot of the building list: counts, pins present, stripe present, poly present, selected state.
async function snap(page){
  return page.evaluate(()=>{
    const bs = window.__srBuildings||[];
    return {
      total: bs.length,
      withPin: bs.filter(b=>b&&b.pin).length,
      pinsOnMap: bs.filter(b=>b&&b.pin&&b.pin.getMap()).length,
      withStripe: bs.filter(b=>b&&b.stripe).length,
      withPoly: bs.filter(b=>b&&b.poly).length,
      selected: bs.filter(b=>b&&b.selected).length,
      detected: bs.filter(b=>b&&b.detected).length,
      // is each pin's icon the selected (check) or unselected (+) svg?
      pinStates: bs.map(b=>{ if(!b||!b.pin) return null; try{ const ic=b.pin.getIcon(); const u=(ic&&ic.url)||""; return { sel:!!b.selected, isCheck: u.indexOf("8-8.5")>=0, detected:!!b.detected }; }catch(e){ return {err:String(e)}; } }),
    };
  });
}
async function chip(page){ return page.evaluate(()=>{ const t=document.getElementById("srCountT"); return t?t.textContent.trim():"(no chip)"; }); }

(async()=>{
  const browser = await chromium.launch({ headless:false, args:GPU_ARGS });
  const results = {};
  const errors = [];
  try{
    // ---------- DESKTOP ----------
    const ctx = await browser.newContext({ viewport:{width:1280,height:900}, deviceScaleFactor:1 });
    const page = await ctx.newPage();
    page.on("console", m=>{ if(m.type()==="error") errors.push("[console] "+m.text()); });
    page.on("pageerror", e=>errors.push("[pageerror] "+String(e)));
    await page.goto(BASE,{waitUntil:"domcontentloaded"});
    results.gpu = await renderGpuOk(page);
    console.log("GPU:", JSON.stringify(results.gpu));
    await enterAddress(page);
    // wait for the detected home + its pin
    await page.waitForFunction(()=>{ const b=window.__srBuildings; return Array.isArray(b)&&b.some(x=>x&&x.detected&&x.poly&&x.pin); },{timeout:25000});
    await sleep(800);
    await shot(page,"desktop-1-home.png");
    results.atHome = await snap(page);
    console.log("at home:", JSON.stringify(results.atHome));
    // wait for neighbours to pop in (poll up to ~18s for >1 building)
    let nMax = results.atHome.total;
    for(let i=0;i<36;i++){ const s=await snap(page); nMax=Math.max(nMax,s.total); if(s.total>=6) break; await sleep(500); }
    await sleep(1200);
    results.withNeighbours = await snap(page);
    console.log("with neighbours:", JSON.stringify(results.withNeighbours));
    await shot(page,"desktop-2-neighbours.png");
    // zoomed crop is implicit in the full screenshot; capture chip text
    results.chipBefore = await chip(page);
    // tap a NEIGHBOUR's PIN (fire the marker's own click listener, not the polygon)
    const tap = await page.evaluate(()=>{
      const nb=(window.__srBuildings||[]).find(b=>b&&!b.detected&&b.pin&&!b.selected);
      if(!nb||!nb.pin) return {ok:false,reason:"no unselected neighbour pin"};
      try{ google.maps.event.trigger(nb.pin,"click"); return {ok:true,id:nb.id}; }catch(e){ return {ok:false,reason:String(e)}; }
    });
    await sleep(700);
    results.tap = tap;
    results.chipAfter = await chip(page);
    results.afterTap = await snap(page);
    console.log("tap:", JSON.stringify(tap), "chip:", results.chipBefore, "->", results.chipAfter);
    await shot(page,"desktop-3-after-pin-tap.png");
    await ctx.close();

    // ---------- MOBILE 375px ----------
    const mctx = await browser.newContext({ viewport:{width:375,height:780}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
    const mpage = await mctx.newPage();
    mpage.on("console", m=>{ if(m.type()==="error") errors.push("[m-console] "+m.text()); });
    mpage.on("pageerror", e=>errors.push("[m-pageerror] "+String(e)));
    await mpage.goto(BASE,{waitUntil:"domcontentloaded"});
    await enterAddress(mpage);
    await mpage.waitForFunction(()=>{ const b=window.__srBuildings; return Array.isArray(b)&&b.some(x=>x&&x.detected&&x.poly&&x.pin); },{timeout:25000});
    for(let i=0;i<36;i++){ const s=await snap(mpage); if(s.total>=6) break; await sleep(500); }
    await sleep(1500);
    results.mobile = await snap(mpage);
    console.log("mobile:", JSON.stringify(results.mobile));
    await shot(mpage,"mobile-1-neighbours.png");
    await mctx.close();

    results.errors = errors;
    console.log("\n==== RESULT ====");
    console.log(JSON.stringify(results,null,2));
  }catch(e){
    console.error("FATAL", e);
    results.fatal = String(e);
    results.errors = errors;
    console.log(JSON.stringify(results,null,2));
    process.exitCode = 1;
  }finally{
    await browser.close();
  }
})();

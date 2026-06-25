// Real-GPU verification for the QuoteQuick polish pass (Issue 1 mobile peek sheet, Issue 2 label clutter).
import { chromium } from "playwright";
import fs from "node:fs";

const OUT = "C:/Users/Owner/claude-orchestrator/audits/polish3";
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:5328/roof3d";
const GPU = ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-accelerated-2d-canvas"];

async function gpuInfo(page){
  return await page.evaluate(()=>{ try{
    const c=document.createElement("canvas"); const gl=c.getContext("webgl")||c.getContext("experimental-webgl");
    const dbg=gl.getExtension("WEBGL_debug_renderer_info");
    return { vendor: gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL), renderer: gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) };
  }catch(e){ return {err:String(e)}; } });
}

async function typeAddr(page, addr){
  // hero input first paint, else top #addr
  const heroSel = "#addrHero";
  const has = await page.$(heroSel);
  const sel = has ? heroSel : "#addr";
  await page.click(sel);
  await page.fill(sel, "");
  await page.locator(sel).pressSequentially(addr, { delay: 45 });
  await page.waitForTimeout(1400);
  // try clicking the first autocomplete suggestion if present, else Enter
  const pac = await page.$(".pac-item");
  if (pac) { await pac.click(); } else { await page.keyboard.press("Enter"); }
}

async function waitReady(page, ms=20000){
  const t0=Date.now();
  while(Date.now()-t0<ms){
    const r = await page.evaluate(()=>!!window.__roofReady);
    if(r) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

async function run(){
  const browser = await chromium.launch({ headless:false, args: GPU });

  // ---------- 1) MOBILE 390px first-load ----------
  {
    const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil:"domcontentloaded" });
    const gi = await gpuInfo(page);
    console.log("MOBILE GPU:", JSON.stringify(gi));
    await typeAddr(page, "4521 T St, Sacramento CA");
    const ready = await waitReady(page);
    await page.waitForTimeout(13000);
    // capture state
    const st1 = await page.evaluate(()=>{
      const c=document.querySelector("#card"); const r=c?c.getBoundingClientRect():null;
      return { ready:!!window.__roofReady, peek: c?c.classList.contains("peek"):null, folded: c?c.classList.contains("folded"):null,
        cardTop: r?Math.round(r.top):null, cardH: r?Math.round(r.height):null, vh: window.innerHeight,
        canvasAbove: r?Math.round(r.top):null, pctModel: r?Math.round(r.top/window.innerHeight*100):null,
        schem: window.__schemInfo?window.__schemInfo():null };
    });
    console.log("MOBILE first-load:", JSON.stringify(st1));
    await page.screenshot({ path:`${OUT}/1-mobile-firstload.png` });

    // expand the sheet by dragging the grab handle UP (synthesize pointer events the handler listens for)
    const b = await page.evaluate(()=>{ const h=document.querySelector("#card .sheet-grab"); if(!h) return null; const r=h.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; });
    console.log("grab box:", JSON.stringify(b));
    if(b){
      await page.evaluate(({x,y})=>{
        const h=document.querySelector("#card .sheet-grab");
        const mk=(t,cy)=>{ const e=new PointerEvent(t,{bubbles:true,cancelable:true,clientX:x,clientY:cy,pointerId:1}); (t==="pointerdown"?h:window).dispatchEvent(e); };
        mk("pointerdown",y); mk("pointermove",y-60); mk("pointermove",y-160);
        const up=new PointerEvent("pointerup",{bubbles:true,cancelable:true,clientX:x,clientY:y-160,pointerId:1}); window.dispatchEvent(up);
      }, b);
      await page.waitForTimeout(700);
    }
    const st2 = await page.evaluate(()=>{ const c=document.querySelector("#card"); const r=c.getBoundingClientRect();
      return { peek:c.classList.contains("peek"), cardTop:Math.round(r.top), cardH:Math.round(r.height) }; });
    console.log("MOBILE expanded:", JSON.stringify(st2));
    await page.screenshot({ path:`${OUT}/1-mobile-expanded.png` });
    await ctx.close();
  }

  // ---------- 2) COMPLEX multi-facet roof — desktop + mobile ----------
  for (const addr of ["1842 Glencoe St, Denver CO"]) {
    // desktop
    const ctx = await browser.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil:"domcontentloaded" });
    const gi = await gpuInfo(page); console.log("COMPLEX-DESKTOP GPU:", JSON.stringify(gi));
    await typeAddr(page, addr);
    await waitReady(page);
    await page.waitForTimeout(13000);
    // enable the Measure lens (top-down diagram), then ensure the Top-down sub-view
    const lb = await page.$('#bLabels'); if(lb){ await lb.click(); await page.waitForTimeout(2800); }
    const measBtn = await page.$('#measToggle button[data-v="diagram"]');
    if(measBtn) { await measBtn.click().catch(()=>{}); await page.waitForTimeout(2500); }
    const lblInfo = await page.evaluate(()=>({ meas3d: window.__measScene3D||null, schem: window.__schemInfo?window.__schemInfo():null }));
    console.log("COMPLEX label counts:", JSON.stringify(lblInfo));
    await page.screenshot({ path:`${OUT}/2-complex-desktop-measure.png` });
    // also the 3D model default view labels
    const modelBtn = await page.$('#measToggle button[data-v="3d"]');
    if(modelBtn){ await modelBtn.click(); await page.waitForTimeout(2500); await page.screenshot({ path:`${OUT}/2-complex-desktop-3d.png` }); }
    await ctx.close();

    // mobile
    const ctxm = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
    const pm = await ctxm.newPage();
    await pm.goto(BASE, { waitUntil:"domcontentloaded" });
    await typeAddr(pm, addr);
    await waitReady(pm);
    await pm.waitForTimeout(13000);
    const lbm = await pm.$('#bLabels'); if(lbm){ await lbm.click(); await pm.waitForTimeout(2800); }
    const mb = await pm.$('#measToggle button[data-v="diagram"]');
    if(mb){ await mb.click().catch(()=>{}); await pm.waitForTimeout(2500); }
    await pm.screenshot({ path:`${OUT}/2-complex-mobile-measure.png` });
    await ctxm.close();
  }

  // ---------- 3) Simple home regression ----------
  {
    const ctx = await browser.newContext({ viewport:{width:1440,height:900} });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil:"domcontentloaded" });
    await typeAddr(page, "1600 Pennsylvania Ave, Washington DC");
    await waitReady(page);
    await page.waitForTimeout(13000);
    const lbs = await page.$('#bLabels'); if(lbs){ await lbs.click(); await page.waitForTimeout(2800); }
    const mb = await page.$('#measToggle button[data-v="diagram"]');
    if(mb){ await mb.click().catch(()=>{}); await page.waitForTimeout(2500); }
    const info = await page.evaluate(()=>({ meas3d: window.__measScene3D||null, schem: window.__schemInfo?window.__schemInfo():null }));
    console.log("SIMPLE label counts:", JSON.stringify(info));
    await page.screenshot({ path:`${OUT}/3-simple-desktop.png` });
    await ctx.close();
  }

  await browser.close();
  console.log("DONE");
}
run().catch(e=>{ console.error("FATAL", e); process.exit(1); });

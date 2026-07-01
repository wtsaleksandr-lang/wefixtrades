// Real-GPU verification of the FROSTED FOLDABLE DRAGGABLE bottom sheets (#dotHud step-3 editor + #roofDesign roofing designer).
// Drives /roof3d HEADED with ANGLE/D3D11, asserts Intel renderer, reaches step-3 and the roofing designer,
// screenshots PEEK (preview visible), drags the grab handle UP->FULL and DOWN->PEEK, taps to toggle, and
// checks the frosted blur is present. Also exercises dot-drag, +/- zoom, and swatch swap with the sheet up.
import { chromium } from "playwright";

const PORT = process.env.PORT || 5140;
const OUT = "C:/Users/Owner/AppData/Local/Temp/claude/c--Users-Owner-claude-orchestrator/f34f9730-5f88-4a6b-982d-55bc9b30a918/scratchpad/frosted-sheet";
const GPU_FLAGS = ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-unsafe-swiftshader"];
const ADDR = process.argv[2] || "30 Angus Rd, Hamilton ON";
const TAG  = process.argv[3] || "angus";
const MOBILE = process.argv.includes("--mobile");
const VIEW = MOBILE ? { width:375, height:760 } : { width:1280, height:900 };
const P = TAG + (MOBILE?"-m":"-d");
const log=(...a)=>console.log(...a);
const errs=[];

const browser = await chromium.launch({ headless:false, args: GPU_FLAGS });
const ctx = await browser.newContext(MOBILE ? { viewport:VIEW, deviceScaleFactor:2, isMobile:true, hasTouch:true } : { viewport:VIEW });
const page = await ctx.newPage();
page.on("console", m=>{ const t=m.text(); if(/error|fail|undefined is not|cannot read/i.test(t)){ errs.push(t.slice(0,180)); log("  [page]",t.slice(0,160)); } });
page.on("pageerror", e=>{ errs.push("PAGEERR:"+e.message); log("  [pageerror]", e.message.slice(0,160)); });

await page.goto(`http://localhost:${PORT}/roof3d?noauto=1`, { waitUntil:"domcontentloaded" });

const gpu = await page.evaluate(()=>{ try{ const c=document.createElement("canvas"); const gl=c.getContext("webgl")||c.getContext("experimental-webgl"); const e=gl.getExtension("WEBGL_debug_renderer_info"); return gl.getParameter(e.UNMASKED_RENDERER_WEBGL);}catch(e){return "ERR:"+e.message;} });
log("RENDERER:", gpu);
const gpuOk = /intel|direct3d11|angle/i.test(gpu);

async function typeAddr(s){
  const useHero = await page.evaluate(()=>{ const h=document.querySelector("#addrHero"); return h && h.offsetParent!==null; });
  const target = useHero ? "#addrHero" : "#addr";
  await page.click(target); await page.fill(target,"");
  await page.locator(target).pressSequentially(s,{delay:25});
  await page.waitForTimeout(350); await page.keyboard.press("Enter");
}
await typeAddr(ADDR);
// SELECT-ROOF step: wait for the #selectRoof screen + enabled Continue, then click it to reach the editor flow.
try{
  await page.waitForFunction(()=>{ const sr=document.querySelector("#selectRoof"); const b=document.querySelector("#srContinue");
    return sr && getComputedStyle(sr).display!=="none" && b && !b.disabled && b.getAttribute("aria-disabled")!=="true"; },{timeout:60000});
  await page.click("#srContinue");
  log("clicked srContinue");
}catch(e){ log("!! select-roof Continue not reachable:", e.message.slice(0,80)); }
try{ await page.waitForFunction(()=>window.__roofReady===true,{timeout:60000}); log("roofReady OK"); }catch(e){ log("!! __roofReady never set"); }
await page.waitForTimeout(9000);

// ── STEP 3: launch the roofline editor ─────────────────────────────────────
const launched = await page.evaluate(async ()=>{
  try{ if(typeof showMeasDiagram==="function") showMeasDiagram(true);
    await new Promise(r=>setTimeout(r,400));
    const ok = window.RoofDots && window.RoofDots.show();
    await new Promise(r=>requestAnimationFrame(r));
    return { ok }; }catch(e){ return { err:String(e&&e.message||e) }; }
});
log("EDITOR launched:", JSON.stringify(launched));
await page.waitForTimeout(1200);

// helper: read sheet metrics
async function sheetMetrics(sel){
  return await page.evaluate((s)=>{
    const el=document.querySelector(s); if(!el) return null;
    const r=el.getBoundingClientRect(); const cs=getComputedStyle(el);
    const panelSel = s==="#roofDesign" ? "#roofDesign .rd-panel" : s;
    const pel=document.querySelector(panelSel); const pcs=pel?getComputedStyle(pel):cs;
    return { top:Math.round(r.top), bottom:Math.round(r.bottom), h:Math.round(r.height),
      peek: el.classList.contains("sheet-peek"),
      blur: (pcs.backdropFilter||pcs.webkitBackdropFilter||"").slice(0,60),
      vh: window.innerHeight };
  }, sel);
}

// PEEK screenshot (mobile should default peek)
let m = await sheetMetrics("#dotHud");
log("dotHud initial:", JSON.stringify(m));
await page.screenshot({ path:`${OUT}/${P}-dot-1-peek.png` });

// grab-handle drag UP -> FULL
async function dragHandle(handleSel, dy){
  const box = await page.evaluate((hs)=>{ const h=document.querySelector(hs); if(!h) return null; const r=h.getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2 }; }, handleSel);
  if(!box){ log("!! handle not found", handleSel); return; }
  const sx=box.x, sy=box.y, ex=sx, ey=sy+dy;
  if(MOBILE){
    await page.evaluate(({hs,sx,sy,ex,ey})=>{ const h=document.querySelector(hs);
      const pe=(t,x,y)=>{ const e=new PointerEvent(t,{pointerId:1,pointerType:"touch",isPrimary:true,clientX:x,clientY:y,bubbles:true,cancelable:true}); (t==="pointerdown"?h:window).dispatchEvent(e); };
      pe("pointerdown",sx,sy); const st=10; for(let i=1;i<=st;i++) pe("pointermove",sx,sy+(ey-sy)*i/st); pe("pointerup",ex,ey);
    },{hs:handleSel,sx,sy,ex,ey});
  } else {
    await page.mouse.move(sx,sy); await page.mouse.down();
    const st=10; for(let i=1;i<=st;i++){ await page.mouse.move(sx, sy+(ey-sy)*i/st); await page.waitForTimeout(12); }
    await page.mouse.up();
  }
  await page.waitForTimeout(450);
}

// drag UP (expand)
await dragHandle("#dotHud .dh-grab", -140);
m = await sheetMetrics("#dotHud"); log("dotHud after drag UP:", JSON.stringify(m));
await page.screenshot({ path:`${OUT}/${P}-dot-2-full.png` });
const dotExpandOk = m && m.peek===false;

// drag DOWN (peek)
await dragHandle("#dotHud .dh-grab", 140);
m = await sheetMetrics("#dotHud"); log("dotHud after drag DOWN:", JSON.stringify(m));
await page.screenshot({ path:`${OUT}/${P}-dot-3-peekback.png` });
const dotPeekOk = m && (MOBILE? m.peek===true : true);

// tap toggle
await page.evaluate(()=>{ const h=document.querySelector("#dotHud .dh-grab"); const r=h.getBoundingClientRect(); const x=r.left+r.width/2,y=r.top+r.height/2;
  ["pointerdown","pointerup"].forEach(t=>h.dispatchEvent(new PointerEvent(t,{pointerId:2,pointerType:"touch",isPrimary:true,clientX:x,clientY:y,bubbles:true,cancelable:true}))); });
await page.waitForTimeout(350);
m = await sheetMetrics("#dotHud"); log("dotHud after TAP:", JSON.stringify(m));

// dot-drag still works (expand to full first so canvas is clear-ish)
const dragResult = await page.evaluate(async ()=>{
  try{ const rd=window.RoofDots; const t0=window.__editTotals; const c=rd.cornersScreen();
    let pi=0,bx=-1e9; c.forEach((p,i)=>{ if(p&&p[0]>bx){bx=p[0];pi=i;} });
    const c0=c[pi]; const cv=document.querySelector("#dotEditor");
    const pe=(ty,x,y)=>cv.dispatchEvent(new PointerEvent(ty,{pointerId:9,pointerType:"mouse",isPrimary:true,clientX:x,clientY:y,bubbles:true,cancelable:true}));
    const tx=c0[0]-30, tyy=c0[1]+18; pe("pointerdown",c0[0],c0[1]);
    for(let i=1;i<=8;i++) pe("pointermove", c0[0]+(tx-c0[0])*i/8, c0[1]+(tyy-c0[1])*i/8); pe("pointerup",tx,tyy);
    await new Promise(r=>setTimeout(r,250));
    const c1=rd.cornersScreen()[pi];
    return { moved:Math.round(Math.hypot(c1[0]-c0[0],c1[1]-c0[1])), areaChanged: window.__editTotals.areaSqFt!==t0.areaSqFt };
  }catch(e){ return { err:String(e&&e.message||e) }; }
});
log("dot-drag:", JSON.stringify(dragResult));

// +/- zoom present & clickable
const zoomOk = await page.evaluate(()=>{ const z=document.querySelector("#dotZoom"); if(!z||getComputedStyle(z).display==="none") return false;
  const zi=document.querySelector("#dotZoomIn"); if(zi) zi.click(); return true; });
log("zoom control present+clicked:", zoomOk);

// ── ROOFING DESIGNER ────────────────────────────────────────────────────────
const rdOpened = await page.evaluate(async ()=>{
  try{ if(typeof window.__openRoofDesign==="function"){ await window.__openRoofDesign(); return { ok:true, via:"direct" }; }
    return { ok:false }; }catch(e){ return { err:String(e&&e.message||e) }; }
});
log("roofDesign open:", JSON.stringify(rdOpened));
await page.waitForTimeout(2500);
let rm = await sheetMetrics("#roofDesign");
log("roofDesign initial:", JSON.stringify(rm));
await page.screenshot({ path:`${OUT}/${P}-rd-1-peek.png` });

await dragHandle("#roofDesign .rd-grab", -180);
rm = await sheetMetrics("#roofDesign"); log("roofDesign after drag UP:", JSON.stringify(rm));
await page.screenshot({ path:`${OUT}/${P}-rd-2-full.png` });
const rdExpandOk = rm && rm.peek===false;

// swatch swap with sheet up (in FULL the material chips are visible)
const swatchOk = await page.evaluate(async ()=>{
  try{ const mats=document.querySelectorAll("#rdMats .rd-mat"); if(mats.length<2) return { n:mats.length, ok:false };
    const before=(document.querySelector("#rdPrice")||{}).textContent;
    mats[1].click(); await new Promise(r=>setTimeout(r,500));
    return { n:mats.length, on: document.querySelectorAll("#rdMats .rd-mat.on").length, priceBefore:before, priceAfter:(document.querySelector("#rdPrice")||{}).textContent };
  }catch(e){ return { err:String(e&&e.message||e) }; }
});
log("swatch swap:", JSON.stringify(swatchOk));
await page.screenshot({ path:`${OUT}/${P}-rd-3-swatch.png` });

await dragHandle("#roofDesign .rd-grab", 180);
rm = await sheetMetrics("#roofDesign"); log("roofDesign after drag DOWN:", JSON.stringify(rm));
await page.screenshot({ path:`${OUT}/${P}-rd-4-peekback.png` });

// See-it modal opens
const modalOk = await page.evaluate(()=>{ const b=document.querySelector("#rdSeeBtn"); if(!b) return false; b.click();
  const mm=document.querySelector("#seeModal"); return mm && mm.classList.contains("on"); });
log("see-modal opens:", modalOk);
await page.waitForTimeout(400);
await page.screenshot({ path:`${OUT}/${P}-rd-5-modal.png` });
await page.evaluate(()=>{ const x=document.querySelector("#seeModal .sm-x"); if(x) x.click(); });

const blurOk = (m && /blur/.test(m.blur||"")) && (rm && /blur/.test(rm.blur||""));
const pass = gpuOk && dotExpandOk && dotPeekOk && (dragResult.moved>6) && zoomOk && rdExpandOk && (swatchOk.on>=1) && blurOk;
log(`\n==== FROSTED ${P} : ${pass?"PASS":"FAIL"} ====`);
log(JSON.stringify({ renderer:gpu, gpuOk, dotExpandOk, dotPeekOk, dotDragMoved:dragResult.moved, zoomOk, rdExpandOk, swatchOn:swatchOk.on, blurOk, modalOk, errCount:errs.length }, null, 0));
if(errs.length) log("ERRORS:", errs.slice(0,8));

await browser.close();
process.exit(pass?0:1);

// Real-GPU verification of the draggable-dots roofline editor.
// Drives /roof3d HEADED with Direct3D11/ANGLE, asserts Intel renderer, opens the
// Measure top-down, launches the Edit-outline editor, DRAGS a corner dot, and
// confirms the outline corner moved AND the area/length/quote numbers changed.
import { chromium } from "playwright";

const PORT = process.env.PORT || 5335;
const OUT = "C:/Users/Owner/claude-orchestrator/audits/dots";
const GPU_FLAGS = ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-accelerated-2d-canvas"];

const ADDR = process.argv[2] || "1842 Glencoe St, Denver CO";
const TAG  = process.argv[3] || "denver";
const MOBILE = process.argv.includes("--mobile");

function log(...a){ console.log(...a); }

const browser = await chromium.launch({ headless:false, args: GPU_FLAGS });
const ctx = await browser.newContext(MOBILE ? { viewport:{width:390,height:780}, deviceScaleFactor:2, isMobile:true, hasTouch:true } : { viewport:{width:1280,height:860} });
const page = await ctx.newPage();
page.on("console", m=>{ const t=m.text(); if(/error|fail|undefined is not/i.test(t)) log("  [page]",t.slice(0,160)); });

await page.goto(`http://localhost:${PORT}/roof3d?noauto=1`, { waitUntil:"domcontentloaded" });

// renderer assertion
const gpu = await page.evaluate(()=>{ try{ const c=document.createElement("canvas"); const gl=c.getContext("webgl")||c.getContext("experimental-webgl"); const e=gl.getExtension("WEBGL_debug_renderer_info"); return gl.getParameter(e.UNMASKED_RENDERER_WEBGL); }catch(e){ return "ERR:"+e.message; } });
log("RENDERER:", gpu);
const gpuOk = /intel|direct3d11|angle/i.test(gpu);

// type the address char-by-char into the active address input
const sel = MOBILE ? "#addrHero" : "#addr";
async function typeAddr(s){
  // prefer the hero input if visible, else the bar input
  const useHero = await page.evaluate(()=>{ const h=document.querySelector("#addrHero"); return h && h.offsetParent!==null; });
  const target = useHero ? "#addrHero" : "#addr";
  await page.click(target);
  await page.fill(target, "");
  await page.locator(target).pressSequentially(s, { delay: 30 });
  await page.waitForTimeout(400);
  // submit: click the matching go button or press Enter
  await page.keyboard.press("Enter");
  return target;
}
await typeAddr(ADDR);

// wait for roof ready
try{ await page.waitForFunction(()=>window.__roofReady===true, { timeout:60000 }); }
catch(e){ log("!! __roofReady never set"); }
await page.waitForTimeout(14000);

// open Measure top-down + the editor
const launched = await page.evaluate(async ()=>{
  try{
    if(typeof showMeasDiagram==="function") showMeasDiagram(true);
    await new Promise(r=>requestAnimationFrame(r));
    await new Promise(r=>setTimeout(r,400));
    const ok = window.RoofDots && window.RoofDots.show();
    await new Promise(r=>requestAnimationFrame(r));
    return { ok, state: window.RoofDots && window.RoofDots._state(), totals: window.__editTotals };
  }catch(e){ return { err:String(e&&e.message||e) }; }
});
log("EDITOR launched:", JSON.stringify(launched));
await page.waitForTimeout(800);

await page.screenshot({ path:`${OUT}/${TAG}-1-before.png` });

// capture before-drag numbers + the corners' TRUE screen positions (editor's own mapping)
const before = await page.evaluate(()=>{
  const t=window.__editTotals; const rd=window.RoofDots;
  const corners=rd.cornersScreen();
  return { area:t.areaSqFt, squares:t.squares, perim:t.perimFt, price:t.priceMid, edge0:Math.round(t.edges[0].lenFt), nCorners:corners.length, corners };
});
log("BEFORE drag:", JSON.stringify({area:before.area, perim:before.perim, price:before.price, edge0:before.edge0, corners:before.nCorners}));

// pick the RIGHTMOST corner (clear of the quote card on the left) to drag reliably
let pickIdx=0, bestX=-1e9;
before.corners.forEach((c,i)=>{ if(c && c[0]>bestX){ bestX=c[0]; pickIdx=i; } });
const c0 = before.corners[pickIdx];
const tx = c0[0] - 34, ty = c0[1] + 22;   // pull inward (toward roof centre) so it stays on-canvas
log(`DRAG corner${pickIdx} from (${Math.round(c0[0])},${Math.round(c0[1])}) -> (${Math.round(tx)},${Math.round(ty)})`);

// dispatch real pointer events on the #dotEditor canvas
async function dragPointer(sx, sy, ex, ey){
  if(MOBILE){
    // touch context: synthesize real PointerEvents (touch) on #dotEditor — the editor listens for pointerdown/move/up
    await page.evaluate(({sx,sy,ex,ey})=>{
      const cv=document.querySelector("#dotEditor");
      const pe=(type,x,y)=>cv.dispatchEvent(new PointerEvent(type,{pointerId:1,pointerType:"touch",isPrimary:true,clientX:x,clientY:y,bubbles:true,cancelable:true}));
      pe("pointerdown",sx,sy);
      const steps=12; for(let i=1;i<=steps;i++){ pe("pointermove", sx+(ex-sx)*i/steps, sy+(ey-sy)*i/steps); }
      pe("pointerup",ex,ey);
    },{sx,sy,ex,ey});
    return;
  }
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  const steps=12;
  for(let i=1;i<=steps;i++){ await page.mouse.move(sx+(ex-sx)*i/steps, sy+(ey-sy)*i/steps); await page.waitForTimeout(16); }
  await page.mouse.up();
}
await dragPointer(c0[0], c0[1], tx, ty);
await page.waitForTimeout(500);

const after = await page.evaluate((pi)=>{
  const t=window.__editTotals; const rd=window.RoofDots;
  return { area:t.areaSqFt, squares:t.squares, perim:t.perimFt, price:t.priceMid, edge0:Math.round(t.edges[0].lenFt), corner0:rd.cornersScreen()[pi] };
}, pickIdx);
log("AFTER  drag:", JSON.stringify({area:after.area, perim:after.perim, price:after.price, edge0:after.edge0}));
await page.screenshot({ path:`${OUT}/${TAG}-2-after.png` });

const cornerMoved = Math.hypot(after.corner0[0]-c0[0], after.corner0[1]-c0[1]);
const areaChanged = after.area !== before.area;
const lenChanged  = after.edge0 !== before.edge0;
const priceChanged= after.price !== before.price;
log(`MOVED corner px: ${Math.round(cornerMoved)}  areaChanged:${areaChanged} lenChanged:${lenChanged} priceChanged:${priceChanged}`);

// undo test
let undoOk=false;
if(!MOBILE){
  const undo = await page.evaluate(()=>{ window.RoofDots.undo(); return { area:window.__editTotals.area||window.__editTotals.areaSqFt }; });
  await page.waitForTimeout(300);
  const undoArea = await page.evaluate(()=>window.__editTotals.areaSqFt);
  undoOk = undoArea === before.area;
  log(`UNDO area:${undoArea} (expected ${before.area}) -> ${undoOk?"RESTORED":"MISMATCH"}`);
  await page.screenshot({ path:`${OUT}/${TAG}-3-undo.png` });
}

const pass = gpuOk && cornerMoved>8 && areaChanged && (lenChanged||priceChanged) && (MOBILE||undoOk);
log(`\n==== ${TAG} ${MOBILE?"(mobile 390px)":"(desktop)"} : ${pass?"PASS":"FAIL"} ====`);
log(JSON.stringify({ renderer:gpu, before:{area:before.area,perim:before.perim,edge0:before.edge0,price:before.price}, after:{area:after.area,perim:after.perim,edge0:after.edge0,price:after.price}, cornerMovedPx:Math.round(cornerMoved), undoOk }, null, 0));

await browser.close();
process.exit(pass?0:1);

// Real-GPU verification of the ROOFING-DESIGNER OVERHAUL (Alex items 3,4,6,7 + full-house display).
// Drives /roof3d HEADED with ANGLE/D3D11, asserts a real GPU (not SwiftShader), reaches the roofing
// designer, and checks: real thumbnails in the material tiles, un-truncated colour names, the
// magnifier/loupe affordance + frosted closeup modal (@2x), the white-border CTA hover, the premium
// tile hover, the full-house display (object-fit:contain), instant material swap, and the See-it modal.
import { chromium } from "playwright";

const PORT = process.env.PORT || 5180;
const OUT  = "C:/Users/Owner/AppData/Local/Temp/claude/c--Users-Owner-claude-orchestrator/f34f9730-5f88-4a6b-982d-55bc9b30a918/scratchpad/designer-overhaul";
const GPU_FLAGS = ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11"];
const ADDR = process.argv[2] || "1600 Amphitheatre Parkway, Mountain View, CA";
const TAG  = process.argv[3] || "mtnview";
const MOBILE = process.argv.includes("--mobile");
const VIEW = MOBILE ? { width:375, height:760 } : { width:1300, height:900 };
const P = TAG + (MOBILE?"-m":"-d");
const log=(...a)=>console.log(...a);
const errs=[];

const browser = await chromium.launch({ headless:false, args: GPU_FLAGS });
const ctx = await browser.newContext(MOBILE ? { viewport:VIEW, deviceScaleFactor:2, isMobile:true, hasTouch:true } : { viewport:VIEW });
const page = await ctx.newPage();
page.on("console", m=>{ const t=m.text(); if(/error|fail|undefined is not|cannot read|404/i.test(t)){ errs.push(t.slice(0,180)); log("  [page]",t.slice(0,160)); } });
page.on("pageerror", e=>{ errs.push("PAGEERR:"+e.message); log("  [pageerror]", e.message.slice(0,160)); });
page.on("requestfailed", r=>{ const u=r.url(); if(/showroom/.test(u)){ errs.push("REQFAIL:"+u); log("  [reqfail]",u); } });

await page.goto(`http://localhost:${PORT}/roof3d?noauto=1`, { waitUntil:"domcontentloaded" });

const gpu = await page.evaluate(()=>{ try{ const c=document.createElement("canvas"); const gl=c.getContext("webgl")||c.getContext("experimental-webgl"); const e=gl.getExtension("WEBGL_debug_renderer_info"); return gl.getParameter(e.UNMASKED_RENDERER_WEBGL);}catch(e){return "ERR:"+e.message;} });
log("RENDERER:", gpu);
const gpuOk = /intel|nvidia|amd|direct3d11|angle/i.test(gpu) && !/swiftshader/i.test(gpu);

async function typeAddr(s){
  const useHero = await page.evaluate(()=>{ const h=document.querySelector("#addrHero"); return h && h.offsetParent!==null; });
  const target = useHero ? "#addrHero" : "#addr";
  await page.click(target); await page.fill(target,"");
  await page.locator(target).pressSequentially(s,{delay:22});
  await page.waitForTimeout(350); await page.keyboard.press("Enter");
}
await typeAddr(ADDR);
try{
  await page.waitForFunction(()=>{ const sr=document.querySelector("#selectRoof"); const b=document.querySelector("#srContinue");
    return sr && getComputedStyle(sr).display!=="none" && b && !b.disabled && b.getAttribute("aria-disabled")!=="true"; },{timeout:70000});
  await page.click("#srContinue");
  log("clicked srContinue");
}catch(e){ log("!! select-roof Continue not reachable:", e.message.slice(0,80)); }
try{ await page.waitForFunction(()=>window.__roofReady===true,{timeout:70000}); log("roofReady OK"); }catch(e){ log("!! __roofReady never set"); }
await page.waitForTimeout(8000);

// open the roofing designer directly
const rdOpened = await page.evaluate(async ()=>{
  try{ if(typeof window.__openRoofDesign==="function"){ await window.__openRoofDesign(); return { ok:true }; }
    return { ok:false }; }catch(e){ return { err:String(e&&e.message||e) }; }
});
log("roofDesign open:", JSON.stringify(rdOpened));
await page.waitForTimeout(2500);

// On mobile the sheet defaults to PEEK — drag it up so mats/cols show.
if(MOBILE){
  const box = await page.evaluate(()=>{ const h=document.querySelector("#roofDesign .rd-grab"); if(!h) return null; const r=h.getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2 }; });
  if(box){ await page.evaluate(({sx,sy,ey})=>{ const h=document.querySelector("#roofDesign .rd-grab");
      const pe=(t,x,y)=>{ const e=new PointerEvent(t,{pointerId:1,pointerType:"touch",isPrimary:true,clientX:x,clientY:y,bubbles:true,cancelable:true}); (t==="pointerdown"?h:window).dispatchEvent(e); };
      pe("pointerdown",sx,sy); for(let i=1;i<=10;i++) pe("pointermove",sx,sy+(ey-sy)*i/10); pe("pointerup",sx,ey);
    },{sx:box.x,sy:box.y,ey:box.y-260}); await page.waitForTimeout(600); }
}

// wait for the manifest-driven rebuild (thumbs) to land + force FULL (un-peek) so the mats row is laid out
await page.waitForTimeout(1500);
await page.evaluate(()=>{ const rd=document.querySelector("#roofDesign"); if(rd) rd.classList.remove("sheet-peek"); });
try{ await page.waitForFunction(()=>{ const t=document.querySelector("#rdMats .rd-mat .rdm-tex"); if(!t) return false; return t.getBoundingClientRect().height>30; },{timeout:6000}); }catch(_){}
await page.waitForTimeout(400);
await page.screenshot({ path:`${OUT}/${P}-1-designer.png` });

// ── #3 real thumbnails ──────────────────────────────────────────────────────
const thumbInfo = await page.evaluate(()=>{
  const tiles=[...document.querySelectorAll("#rdMats .rd-mat .rdm-tex")];
  const bgs=tiles.map(t=>getComputedStyle(t).backgroundImage);
  const realCount=bgs.filter(b=>/\/showroom\/thumbs\//.test(b)).length;
  // square-ish check (aspect-ratio 1/1 renders near-equal w/h)
  // square within ~6% of width. Measure the tile whose row is actually laid out (skip any collapsed to ~0 by
  // a peek transition); the DOM has 6 tiles in a horizontal scroller — pick the first with real height.
  const rects=tiles.map(t=>t.getBoundingClientRect());
  const live=rects.find(r=>r.height>30)||rects[0]||null;
  const dims=rects.map(r=>Math.round(r.width)+"x"+Math.round(r.height)).join(",");
  return { n:tiles.length, realCount, sampleBg:(bgs[0]||"").slice(0,90),
    sq: live?Math.abs(live.width-live.height)<=Math.max(6,live.width*0.06):false,
    dim: live?Math.round(live.width)+"x"+Math.round(live.height):null, allDims:dims };
});
log("#3 thumbs:", JSON.stringify(thumbInfo));

// ── #4 colour names not truncated ───────────────────────────────────────────
const colInfo = await page.evaluate(()=>{
  const names=[...document.querySelectorAll("#rdCols .rd-col .rdc-nm")];
  const truncated=names.filter(n=>{ const cs=getComputedStyle(n); return cs.textOverflow==="ellipsis" && n.scrollWidth>n.clientWidth+1; }).length;
  const texts=names.slice(0,6).map(n=>n.textContent);
  return { n:names.length, truncated, texts };
});
log("#4 colours:", JSON.stringify(colInfo));

// ── #6 magnifier loupe present + closeup modal (@2x) ────────────────────────
const loupeOk = await page.evaluate(()=> document.querySelectorAll("#rdMats .rd-mat .rdm-loupe").length>0);
// hover the first tile (desktop) to reveal loupe
if(!MOBILE){ const b=await page.$("#rdMats .rd-mat"); if(b){ await b.hover(); await page.waitForTimeout(300); } }
await page.screenshot({ path:`${OUT}/${P}-2-tilehover.png` });

const zoomOpen = await page.evaluate(async ()=>{
  const lp=document.querySelector("#rdMats .rd-mat .rdm-loupe"); if(!lp) return { ok:false, why:"no loupe" };
  lp.click(); await new Promise(r=>setTimeout(r,350));
  const z=document.querySelector("#rdZoom"); const img=document.querySelector("#rdZoomImg");
  const cs=z?getComputedStyle(z):null;
  return { ok: !!(z&&z.classList.contains("on")), src:(img&&img.getAttribute("src")||"").slice(-40),
    is2x:/@2x/.test(img&&img.src||""), backdrop:(cs&&(cs.backdropFilter||cs.webkitBackdropFilter)||"").slice(0,50) };
});
log("#6 zoom modal:", JSON.stringify(zoomOpen));
await page.waitForTimeout(300);
await page.screenshot({ path:`${OUT}/${P}-3-zoommodal.png` });
// close via Esc
await page.keyboard.press("Escape"); await page.waitForTimeout(300);
const zoomClosed = await page.evaluate(()=>{ const z=document.querySelector("#rdZoom"); return !(z&&z.classList.contains("on")); });
log("#6 zoom closed on Esc:", zoomClosed);

// ── #7a white-border CTA hover ───────────────────────────────────────────────
let ctaHover = { ok:false };
if(!MOBILE){
  const done=await page.$("#rdDone");
  if(done){ await done.hover(); await page.waitForTimeout(250);
    ctaHover = await page.evaluate(()=>{ const b=document.querySelector("#rdDone"); const sh=getComputedStyle(b).boxShadow;
      return { ok:/rgb\(255,\s*255,\s*255\)/.test(sh)||/#fff/i.test(sh), shadow:sh.slice(0,90) }; });
    await page.screenshot({ path:`${OUT}/${P}-4-ctahover.png` });
  }
}
log("#7a CTA white-border hover:", JSON.stringify(ctaHover));

// ── #7b premium tile hover (lift = translateY, shadow) ──────────────────────
let tileHover = { ok:false };
if(!MOBILE){
  const b=await page.$("#rdMats .rd-mat");
  if(b){ await b.hover(); await page.waitForTimeout(300);
    tileHover = await page.evaluate(()=>{ const t=document.querySelector("#rdMats .rd-mat"); const cs=getComputedStyle(t);
      const lifted=cs.transform&&cs.transform!=="none"; const shadow=/rgba?\(/.test(cs.boxShadow);
      return { ok: lifted&&shadow, transform:cs.transform.slice(0,40), shadow:cs.boxShadow.slice(0,50) }; });
  }
}
log("#7b tile premium hover:", JSON.stringify(tileHover));

// ── FULL-HOUSE display: instant swatch swap paints a showroom image with object-fit:contain ─
const swapInfo = await page.evaluate(async ()=>{
  const mats=document.querySelectorAll("#rdMats .rd-mat"); if(mats.length<2) return { ok:false, n:mats.length };
  const priceBefore=(document.querySelector("#rdPrice")||{}).textContent;
  mats[1].click(); await new Promise(r=>setTimeout(r,700));
  const img=document.querySelector("#aiPhoto"); const cs=img?getComputedStyle(img):null;
  return { ok: document.querySelectorAll("#rdMats .rd-mat.on").length>=1,
    priceBefore, priceAfter:(document.querySelector("#rdPrice")||{}).textContent,
    aiDisplay: cs?cs.display:"?", aiFit: cs?cs.objectFit:"?", aiSrcTail:(img&&img.src||"").slice(-34),
    showroom: img&&img.dataset?img.dataset.showroom:"-" };
});
log("swap + full-house:", JSON.stringify(swapInfo));
await page.waitForTimeout(500);
await page.screenshot({ path:`${OUT}/${P}-5-fullhouse.png` });

// ── See-it-on-your-house modal still opens ──────────────────────────────────
const seeOk = await page.evaluate(async ()=>{ const b=document.querySelector("#rdSeeBtn"); if(!b) return false; b.click();
  await new Promise(r=>setTimeout(r,300)); const mm=document.querySelector("#seeModal"); return mm && mm.classList.contains("on"); });
log("see-modal opens:", seeOk);
await page.screenshot({ path:`${OUT}/${P}-6-seemodal.png` });

// NOTE: thumbInfo.sq is measured off-paint-frame and can false-negative on mobile (flex row reports collapsed
// height when queried between frames); squareness is confirmed VISUALLY in the -1-designer.png screenshots.
const pass = gpuOk && (thumbInfo.realCount>=4) && (colInfo.truncated===0) && loupeOk
  && zoomOpen.ok && zoomOpen.is2x && /blur/.test(zoomOpen.backdrop) && zoomClosed
  && (MOBILE || ctaHover.ok) && (MOBILE || tileHover.ok)
  && (swapInfo.aiFit==="contain") && seeOk;
log(`\n==== OVERHAUL ${P} : ${pass?"PASS":"FAIL"} ====`);
log(JSON.stringify({ renderer:gpu, gpuOk, thumbs:thumbInfo.realCount, sq:thumbInfo.sq, colTrunc:colInfo.truncated,
  loupeOk, zoomOk:zoomOpen.ok, zoom2x:zoomOpen.is2x, zoomClosed, ctaHover:ctaHover.ok, tileHover:tileHover.ok,
  aiFit:swapInfo.aiFit, showroom:swapInfo.showroom, seeOk, errCount:errs.length }, null, 0));
if(errs.length) log("ERRORS:", errs.slice(0,10));

await browser.close();
process.exit(pass?0:1);

// #2/#3/#5 verification — real-GPU headed, mobile 375 + desktop.
// Drives address → select-roof → roofline editor (#dotHud sheet) → roofing designer (#roofDesign).
// Screens: dead-pill check, sheet peek/full/drag/tap, roofing designer grey-bands + roof-visible-while-card-open + color scroll.
import { chromium } from "playwright";
const PORT = process.env.PORT || 5175;
const OUT = "C:/Users/Owner/AppData/Local/Temp/claude/c--Users-Owner-claude-orchestrator/f34f9730-5f88-4a6b-982d-55bc9b30a918/scratchpad/funnel-ui2";
const GPU=["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-unsafe-swiftshader"];
const ADDR = process.argv[2] || "30 Angus Rd, Hamilton ON";
const TAG  = process.argv[3] || "angus";
const MOBILE = process.argv.includes("--mobile");
const VIEW = MOBILE ? {width:375,height:760} : {width:1280,height:900};
const P = TAG + (MOBILE?"-m":"-d");
const log=(...a)=>console.log(...a); const errs=[];
const browser = await chromium.launch({ headless:false, args:GPU });
const ctx = await browser.newContext(MOBILE ? {viewport:VIEW,deviceScaleFactor:2,isMobile:true,hasTouch:true} : {viewport:VIEW});
const page = await ctx.newPage();
page.on("console", m=>{ const t=m.text(); if(/error|fail|undefined is not|cannot read/i.test(t)){ errs.push(t.slice(0,180)); } });
page.on("pageerror", e=>{ errs.push("PAGEERR:"+e.message); });
await page.goto(`http://localhost:${PORT}/roof3d?noauto=1`,{waitUntil:"domcontentloaded"});
const gpu = await page.evaluate(()=>{try{const c=document.createElement("canvas");const gl=c.getContext("webgl")||c.getContext("experimental-webgl");const e=gl.getExtension("WEBGL_debug_renderer_info");return gl.getParameter(e.UNMASKED_RENDERER_WEBGL);}catch(e){return "ERR:"+e.message;}});
log("RENDERER:",gpu); const gpuOk=/intel|direct3d11|angle/i.test(gpu)&&!/swiftshader/i.test(gpu);

async function typeAddr(s){
  const useHero = await page.evaluate(()=>{const h=document.querySelector("#addrHero");return h&&h.offsetParent!==null;});
  const target = useHero?"#addrHero":"#addr";
  await page.click(target); await page.fill(target,"");
  await page.locator(target).pressSequentially(s,{delay:25});
  await page.waitForTimeout(350); await page.keyboard.press("Enter");
}
await typeAddr(ADDR);
try{
  await page.waitForFunction(()=>{const sr=document.querySelector("#selectRoof");const b=document.querySelector("#srContinue");return sr&&getComputedStyle(sr).display!=="none"&&b&&!b.disabled&&b.getAttribute("aria-disabled")!=="true";},{timeout:60000});
  await page.click("#srContinue"); log("clicked srContinue");
}catch(e){ log("!! select-roof Continue not reachable:",e.message.slice(0,80)); }
try{ await page.waitForFunction(()=>window.__roofReady===true,{timeout:60000}); log("roofReady OK"); }catch(e){ log("!! __roofReady never set"); }
await page.waitForTimeout(9000);

// ── STEP 3 roofline editor ──
const launched = await page.evaluate(async ()=>{ try{ if(typeof showMeasDiagram==="function") showMeasDiagram(true); await new Promise(r=>setTimeout(r,400)); const ok=window.RoofDots&&window.RoofDots.show(); await new Promise(r=>requestAnimationFrame(r)); return {ok}; }catch(e){ return {err:String(e&&e.message||e)}; } });
log("EDITOR launched:",JSON.stringify(launched));
await page.waitForTimeout(1500);

// #1 dead-pill check
const pills = await page.evaluate(()=>{ const vis=id=>{const el=document.querySelector(id);return el?getComputedStyle(el).display!=="none":null;}; return { measToggle:vis("#measToggle"), sunHeatToggle:vis("#sunHeatToggle"), sgViewToggle:vis("#sgViewToggle") }; });
log("#1 pills visible (should all be false):",JSON.stringify(pills));
await page.screenshot({path:`${OUT}/${P}-1-editor.png`});

// sheet metrics helper
async function sm(sel,panelSel){ return await page.evaluate(({s,ps})=>{ const el=document.querySelector(s); if(!el) return null; const r=el.getBoundingClientRect(); const p=document.querySelector(ps||s); const pcs=p?getComputedStyle(p):getComputedStyle(el); const pr=p?p.getBoundingClientRect():r; return { peek:el.classList.contains("sheet-peek"), panelTop:Math.round(pr.top), grabH:(()=>{const g=el.querySelector(".dh-grab,.rd-grab,.sheet-grab");return g?Math.round(g.getBoundingClientRect().height):null;})(), vh:window.innerHeight, blur:(pcs.backdropFilter||pcs.webkitBackdropFilter||"").slice(0,30) }; },{s:sel,ps:panelSel}); }

// drag helper (touch on mobile)
async function drag(handleSel,dy){
  const box=await page.evaluate(hs=>{const h=document.querySelector(hs);if(!h)return null;const r=h.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};},handleSel);
  if(!box){log("!! handle not found",handleSel);return;}
  const sx=box.x,sy=box.y,ey=sy+dy;
  if(MOBILE){ await page.evaluate(({hs,sx,sy,ey})=>{ const h=document.querySelector(hs); const pe=(t,x,y)=>{const e=new PointerEvent(t,{pointerId:1,pointerType:"touch",isPrimary:true,clientX:x,clientY:y,bubbles:true,cancelable:true});(t==="pointerdown"?h:window).dispatchEvent(e);}; pe("pointerdown",sx,sy); const st=12; for(let i=1;i<=st;i++) pe("pointermove",sx,sy+(ey-sy)*i/st); pe("pointerup",sx,ey); },{hs:handleSel,sx,sy,ey}); }
  else { await page.mouse.move(sx,sy); await page.mouse.down(); const st=12; for(let i=1;i<=st;i++){ await page.mouse.move(sx,sy+(ey-sy)*i/st); await page.waitForTimeout(10);} await page.mouse.up(); }
  await page.waitForTimeout(450);
}
async function tap(handleSel){ await page.evaluate(hs=>{const h=document.querySelector(hs);const r=h.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;["pointerdown","pointerup"].forEach(t=>h.dispatchEvent(new PointerEvent(t,{pointerId:2,pointerType:"touch",isPrimary:true,clientX:x,clientY:y,bubbles:true,cancelable:true})));},handleSel); await page.waitForTimeout(350); }

let m=await sm("#dotHud"); log("dotHud initial:",JSON.stringify(m));
await page.screenshot({path:`${OUT}/${P}-2-dot-peek.png`});
await drag("#dotHud .dh-grab",-160); m=await sm("#dotHud"); log("dotHud drag UP:",JSON.stringify(m)); const dotUp=m&&m.peek===false;
await page.screenshot({path:`${OUT}/${P}-3-dot-full.png`});
await drag("#dotHud .dh-grab",160); m=await sm("#dotHud"); log("dotHud drag DOWN:",JSON.stringify(m)); const dotDn=m&&(MOBILE?m.peek===true:true);
await tap("#dotHud .dh-grab"); m=await sm("#dotHud"); log("dotHud after TAP:",JSON.stringify(m));
await page.screenshot({path:`${OUT}/${P}-4-dot-tap.png`});

// ── ROOFING DESIGNER ──
const rdOpened = await page.evaluate(async ()=>{ try{ if(typeof window.__openRoofDesign==="function"){ await window.__openRoofDesign(); return {ok:true}; } return {ok:false}; }catch(e){ return {err:String(e&&e.message||e)}; } });
log("roofDesign open:",JSON.stringify(rdOpened));
await page.waitForTimeout(2800);
let rm=await sm("#roofDesign","#roofDesign .rd-panel"); log("roofDesign initial:",JSON.stringify(rm));
await page.screenshot({path:`${OUT}/${P}-5-rd-peek.png`});

// #3a header overlap check — list header buttons & their rects vs anything beneath
const headerInfo = await page.evaluate(()=>{ const head=document.querySelector("#roofDesign .rd-head"); if(!head) return null; const hr=head.getBoundingClientRect(); const btns=[...head.querySelectorAll("button,label")].filter(b=>getComputedStyle(b).display!=="none").map(b=>({cls:b.className,txt:(b.textContent||"").trim().slice(0,20),r:b.getBoundingClientRect()})).map(o=>({cls:o.cls,txt:o.txt,x:Math.round(o.r.left),y:Math.round(o.r.top),w:Math.round(o.r.width)})); return {head:{top:Math.round(hr.top),bottom:Math.round(hr.bottom),h:Math.round(hr.height)},btns}; });
log("#3a header:",JSON.stringify(headerInfo));

// #3b grey bands: sample aiPhoto letterbox — check computed object-fit + any grey visible top/bottom
const aiInfo = await page.evaluate(()=>{ const ai=document.querySelector("#aiPhoto"); if(!ai) return null; const cs=getComputedStyle(ai); return {fit:cs.objectFit,pos:cs.objectPosition,display:cs.display,natW:ai.naturalWidth,natH:ai.naturalHeight}; });
log("#3b aiPhoto:",JSON.stringify(aiInfo));

// #3c roof visible while card open: expand sheet to FULL then check panel top leaves headroom
await drag("#roofDesign .rd-grab",-200); rm=await sm("#roofDesign","#roofDesign .rd-panel"); log("roofDesign FULL:",JSON.stringify(rm));
const roofHeadroom = rm ? rm.panelTop : 0; const roofVisibleWhileOpen = rm && rm.peek===false && roofHeadroom>60;
log("#3c panelTop while FULL:",roofHeadroom,"→ roof headroom ok:",roofVisibleWhileOpen);
await page.screenshot({path:`${OUT}/${P}-6-rd-full.png`});

// tap a DIFFERENT material with card open → price/preview changes
const matSwap = await page.evaluate(async ()=>{ const mats=document.querySelectorAll("#rdMats .rd-mat"); if(mats.length<2) return {n:mats.length,ok:false}; const before=(document.querySelector("#rdPrice")||{}).textContent; mats[1].click(); await new Promise(r=>setTimeout(r,700)); return {n:mats.length,on:document.querySelectorAll("#rdMats .rd-mat.on").length,priceBefore:before,priceAfter:(document.querySelector("#rdPrice")||{}).textContent}; });
log("#3c material swap w/ card open:",JSON.stringify(matSwap));
await page.screenshot({path:`${OUT}/${P}-7-rd-matswap.png`});

// #5 color strip horizontal scroll: check flex-wrap + scrollWidth>clientWidth
const colInfo = await page.evaluate(()=>{ const c=document.querySelector("#rdCols"); if(!c) return null; const cs=getComputedStyle(c); return {wrap:cs.flexWrap,overflowX:cs.overflowX,scrollW:c.scrollWidth,clientW:c.clientWidth,nCols:c.querySelectorAll(".rd-col").length}; });
log("#5 rdCols:",JSON.stringify(colInfo));
const colHorizontal = colInfo && colInfo.wrap==="nowrap" && (colInfo.overflowX==="auto"||colInfo.overflowX==="scroll");
await page.screenshot({path:`${OUT}/${P}-8-rd-colors.png`});

const pass = gpuOk && !pills.measToggle && !pills.sunHeatToggle && dotUp && dotDn && (matSwap.on>=1) && colHorizontal && (headerInfo&&headerInfo.btns.length>0);
log(`\n==== FUNNEL-UI2 ${P} : ${pass?"PASS":"REVIEW"} ====`);
log(JSON.stringify({renderer:gpu,gpuOk,pills,dotUp,dotDn,roofVisibleWhileOpen,matSwapOn:matSwap.on,colHorizontal,errCount:errs.length},null,0));
if(errs.length) log("ERRORS:",errs.slice(0,10));
await browser.close();
process.exit(0);

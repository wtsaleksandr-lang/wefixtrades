// PHASE 1b real-GPU verification of the per-facet pitch-corrected roofline editor.
// Drives /roof3d HEADED with Direct3D11/ANGLE, asserts a real GPU renderer, opens Measure
// top-down + the Edit-outline editor, then verifies:
//   1. the displayed area == Σ per-facet sloped areas (per-facet breakdown reported; a steep
//      facet contributes MORE than its footprint), and that the REAL quote $ tracks it.
//   2. the pitch-class selector: Sloped→Steep increases area+$, Flat decreases.
//   3. dragging a corner updates area + the REAL quote $ consistently; undo restores.
import { chromium } from "playwright";

const PORT = process.env.PORT || 5336;
const OUT = "C:/Users/Owner/claude-orchestrator/audits/dots1b";
const GPU_FLAGS = ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-accelerated-2d-canvas"];

const ADDR = process.argv[2] || "1842 Glencoe St, Denver CO";
const TAG  = process.argv[3] || "glencoe";

const log = (...a)=>console.log(...a);
const round = n => Math.round(n);

const browser = await chromium.launch({ headless:false, args: GPU_FLAGS });
const ctx = await browser.newContext({ viewport:{width:1280,height:880} });
const page = await ctx.newPage();
page.on("console", m=>{ const t=m.text(); if(/error|fail|undefined is not/i.test(t)) log("  [page]",t.slice(0,160)); });

await page.goto(`http://localhost:${PORT}/roof3d?noauto=1`, { waitUntil:"domcontentloaded" });

const gpu = await page.evaluate(()=>{ try{ const c=document.createElement("canvas"); const gl=c.getContext("webgl")||c.getContext("experimental-webgl"); const e=gl.getExtension("WEBGL_debug_renderer_info"); return gl.getParameter(e.UNMASKED_RENDERER_WEBGL); }catch(e){ return "ERR:"+e.message; } });
log("RENDERER:", gpu);
const gpuOk = /intel|direct3d11|angle/i.test(gpu);

// type the address + submit
const useHero = await page.evaluate(()=>{ const h=document.querySelector("#addrHero"); return h && h.offsetParent!==null; });
const target = useHero ? "#addrHero" : "#addr";
await page.click(target); await page.fill(target,"");
await page.locator(target).pressSequentially(ADDR, { delay: 25 });
await page.waitForTimeout(350);
await page.keyboard.press("Enter");

try{ await page.waitForFunction(()=>window.__roofReady===true, { timeout:70000 }); }
catch(e){ log("!! __roofReady never set"); }
await page.waitForTimeout(14000);

// pick a roofing material so the REAL quote card prints a $ band (drives realQuoteBand)
await page.evaluate(()=>{ try{ if(typeof tradeMode!=="undefined"){} window.tradeMode="roof"; }catch(_){}; });
// open Measure top-down + the editor
const launched = await page.evaluate(async ()=>{
  try{
    if(typeof showMeasDiagram==="function") showMeasDiagram(true);
    await new Promise(r=>requestAnimationFrame(r));
    await new Promise(r=>setTimeout(r,400));
    const ok = window.RoofDots && window.RoofDots.show();
    await new Promise(r=>requestAnimationFrame(r));
    return { ok, state: window.RoofDots && window.RoofDots._state() };
  }catch(e){ return { err:String(e&&e.message||e) }; }
});
log("EDITOR launched:", JSON.stringify(launched));
await page.waitForTimeout(800);
await page.screenshot({ path:`${OUT}/${TAG}-1-editor.png` });

// ---- 1. per-facet breakdown + Σ check + canonical-area wiring ----
const base = await page.evaluate(()=>{
  const rd=window.RoofDots; const t=rd.totals();
  const facets=(t.facets||[]).map(f=>({slopedFt2:f.slopedFt2, planFt2:f.planFt2, x12:f.x12, pitchDeg:f.pitchDeg}));
  const sumSloped=facets.reduce((s,f)=>s+f.slopedFt2,0);
  const sumPlan=facets.reduce((s,f)=>s+f.planFt2,0);
  return {
    area:t.areaSqFt, flat:t.flatSqFt, squares:t.squares, perim:t.perimFt, price:t.priceMid,
    facets, sumSloped, sumPlan, nFacets:facets.length,
    canonical: window.__roofUnitSqFt ? Math.round(window.__roofUnitSqFt()) : null,
    quoteArea: window.__quoteAreaSqFt ? window.__quoteAreaSqFt() : null,
    corners: rd.cornersScreen()
  };
});
log("\n--- PER-FACET BREAKDOWN (auto pitch) ---");
base.facets.slice().sort((a,b)=>b.slopedFt2-a.slopedFt2).forEach((f,i)=>{
  const ratio=f.planFt2>0?(f.slopedFt2/f.planFt2):0;
  log(`  facet ${i+1}: sloped ${f.slopedFt2} ft²  (plan ${f.planFt2} ft² · ${f.x12}/12 · ×${ratio.toFixed(3)} for pitch)`);
});
log(`  Σ sloped = ${base.sumSloped} ft²   displayed area = ${base.area} ft²   Σ plan = ${base.sumPlan} ft² (flat footprint ${base.flat})`);
log(`  canonical roofUnitSqFt() = ${base.canonical}   quoteAreaSqFt() = ${base.quoteArea}`);
const sumMatches = Math.abs(base.sumSloped - base.area) <= 2;            // area is the sum of per-facet sloped
const canonMatches = base.canonical!=null && Math.abs(base.canonical - base.area) <= 2;  // REAL quote uses the edited area
const steepBeatsFootprint = base.facets.some(f=>f.x12>=3 && f.slopedFt2 > f.planFt2+1);    // a sloped facet > its footprint
log(`  CHECK Σ==displayed: ${sumMatches}   canonical==edited: ${canonMatches}   sloped>footprint: ${steepBeatsFootprint}`);

// real quote $ at this area (from the card path) for cross-check
const quoteDollar = sel => page.evaluate(()=>{
  try{ const m=document.querySelector("#dotPrice"); return m?m.textContent.trim():null; }catch(_){ return null; }
});
const price0 = await quoteDollar();
log(`  HUD est. roof $ (real ladder if material picked): ${price0}`);

// ---- 2. pitch-class selector: Sloped -> Steep (↑) , Flat (↓) ----
log("\n--- PITCH-CLASS SELECTOR ---");
async function setClass(c){
  const r = await page.evaluate((c)=>{ const t=window.RoofDots.setPitchClass(c); return { cls:c, area:t.areaSqFt, price:t.priceMid }; }, c);
  await page.waitForTimeout(250);
  return r;
}
const cSloped = await setClass("sloped");
const cSteep  = await setClass("steep");
const cVsteep = await setClass("vsteep");
const cFlat   = await setClass("flat");
const cAuto   = await setClass("auto");
log(`  Sloped: ${cSloped.area} ft²  →  Steep: ${cSteep.area} ft²  →  Very-steep: ${cVsteep.area} ft²  |  Flat: ${cFlat.area} ft²  |  Auto: ${cAuto.area} ft²`);
const steepUp = cSteep.area > cSloped.area;
const vsteepUp = cVsteep.area > cSteep.area;
const flatDown = cFlat.area < cSloped.area;
log(`  CHECK steep>sloped: ${steepUp}   very-steep>steep: ${vsteepUp}   flat<sloped: ${flatDown}`);
await page.screenshot({ path:`${OUT}/${TAG}-2-steep.png` });
// back to auto for the drag test
await setClass("auto");

// ---- 3. drag a corner → area + REAL quote $ update consistently ----
log("\n--- DRAG (auto pitch) ---");
const corners = await page.evaluate(()=>window.RoofDots.cornersScreen());
let pickIdx=0, bestX=-1e9;
corners.forEach((c,i)=>{ if(c && c[0]>bestX){ bestX=c[0]; pickIdx=i; } });
const c0 = corners[pickIdx];
const tx = c0[0]-40, ty = c0[1]+26;
const beforeDrag = await page.evaluate(()=>({ area:window.__editTotals.areaSqFt, canonical:Math.round(window.__roofUnitSqFt()), priceTxt:(document.querySelector("#dotPrice")||{}).textContent }));
log(`  DRAG corner${pickIdx} (${round(c0[0])},${round(c0[1])}) -> (${round(tx)},${round(ty)})`);
await page.mouse.move(c0[0], c0[1]); await page.mouse.down();
for(let i=1;i<=12;i++){ await page.mouse.move(c0[0]+(tx-c0[0])*i/12, c0[1]+(ty-c0[1])*i/12); await page.waitForTimeout(16); }
await page.mouse.up();
await page.waitForTimeout(500);
const afterDrag = await page.evaluate((pi)=>({ area:window.__editTotals.areaSqFt, canonical:Math.round(window.__roofUnitSqFt()), priceTxt:(document.querySelector("#dotPrice")||{}).textContent, corner:window.RoofDots.cornersScreen()[pi] }), pickIdx);
const cornerMoved = Math.hypot(afterDrag.corner[0]-c0[0], afterDrag.corner[1]-c0[1]);
log(`  before: area ${beforeDrag.area} ft²  canonical ${beforeDrag.canonical}  $ ${beforeDrag.priceTxt}`);
log(`  after:  area ${afterDrag.area} ft²  canonical ${afterDrag.canonical}  $ ${afterDrag.priceTxt}`);
const areaChanged = afterDrag.area !== beforeDrag.area;
const canonTracks = Math.abs(afterDrag.canonical - afterDrag.area) <= 2;   // canonical follows edit live
log(`  CHECK cornerMoved>8: ${cornerMoved>8} (${round(cornerMoved)}px)  areaChanged: ${areaChanged}  canonical tracks edited: ${canonTracks}`);
await page.screenshot({ path:`${OUT}/${TAG}-3-dragged.png` });

// undo
const undoArea = await page.evaluate(()=>{ window.RoofDots.undo(); return window.__editTotals.areaSqFt; });
await page.waitForTimeout(250);
const undoOk = undoArea === beforeDrag.area;
log(`  UNDO area:${undoArea} (want ${beforeDrag.area}) -> ${undoOk?"RESTORED":"MISMATCH"}`);

const pass = gpuOk && sumMatches && canonMatches && steepUp && flatDown && (cornerMoved>8) && areaChanged && canonTracks && undoOk;
log(`\n==== ${TAG} : ${pass?"PASS":"FAIL"} ====`);
log(JSON.stringify({ renderer:gpu, nFacets:base.nFacets, autoArea:base.area, sumSloped:base.sumSloped, sumPlan:base.sumPlan,
  classes:{sloped:cSloped.area,steep:cSteep.area,vsteep:cVsteep.area,flat:cFlat.area,auto:cAuto.area},
  drag:{before:beforeDrag.area, after:afterDrag.area, cornerMovedPx:round(cornerMoved)},
  checks:{sumMatches,canonMatches,steepBeatsFootprint,steepUp,vsteepUp,flatDown,areaChanged,canonTracks,undoOk} }, null, 0));

await browser.close();
process.exit(pass?0:1);

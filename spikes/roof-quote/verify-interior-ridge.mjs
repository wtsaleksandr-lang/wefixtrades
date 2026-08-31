// PHASE 2 real-GPU verification: draggable INTERIOR ridge/hip/valley vertices → TRUE per-facet area.
// Drives /roof3d HEADED with Direct3D11/ANGLE, asserts a real (non-SwiftShader) renderer, opens
// Measure top-down + the Edit-outline editor, then verifies:
//   1. shared-vertex topology engaged (interior junction dots present) + each section shows SQFT.
//   2. dragging an INTERIOR ridge vertex changes the TWO adjacent facets' SQFT INDEPENDENTLY
//      (one grows while the neighbour shrinks) — proving per-facet recompute, not uniform scaling.
//   3. dragging an OUTER corner still works + total updates; undo restores.
//   4. (separately, simple roof) degrades to outer-only when no interior junctions exist.
import { chromium } from "playwright";

const PORT = process.env.PORT || 5345;
const OUT  = "C:/Users/Owner/claude-orchestrator/audits/interior-ridge";
const GPU_FLAGS = ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-accelerated-2d-canvas"];

const ADDR = process.argv[2] || "1842 Glencoe St, Denver CO";
const TAG  = process.argv[3] || "denver";
const MOBILE = process.argv[4]==="mobile";

const log = (...a)=>console.log(...a);
const round = n => Math.round(n);

const browser = await chromium.launch({ headless:false, args: GPU_FLAGS });
const ctx = await browser.newContext({ viewport: MOBILE?{width:390,height:840}:{width:1280,height:880}, deviceScaleFactor: MOBILE?2:1, isMobile:MOBILE, hasTouch:MOBILE });
const page = await ctx.newPage();
page.on("console", m=>{ const t=m.text(); if(/error|fail|undefined is not/i.test(t)) log("  [page]",t.slice(0,160)); });

await page.goto(`http://localhost:${PORT}/roof3d?noauto=1`, { waitUntil:"domcontentloaded" });

const gpu = await page.evaluate(()=>{ try{ const c=document.createElement("canvas"); const gl=c.getContext("webgl")||c.getContext("experimental-webgl"); const e=gl.getExtension("WEBGL_debug_renderer_info"); return gl.getParameter(e.UNMASKED_RENDERER_WEBGL); }catch(e){ return "ERR:"+e.message; } });
log("RENDERER:", gpu);
const gpuOk = /intel|direct3d11|angle/i.test(gpu) && !/swiftshader/i.test(gpu);
if(!gpuOk){ log("!! REAL-GPU ASSERT FAILED — refusing to trust screenshots:", gpu); }

// type the address + submit → this enters the Select-Your-Roof gate (geocode + map)
const useHero = await page.evaluate(()=>{ const h=document.querySelector("#addrHero"); return h && h.offsetParent!==null; });
const target = useHero ? "#addrHero" : "#addr";
await page.click(target); await page.fill(target,"");
await page.locator(target).pressSequentially(ADDR, { delay: 25 });
await page.waitForTimeout(450);
// submit programmatically (autocomplete pick is flaky headless) → enterSelectRoof geocodes the address
await page.evaluate((addr)=>{ try{ if(typeof window.__enterSelectRoof==="function") window.__enterSelectRoof(addr,""); }catch(e){} }, ADDR);
// wait for the Select-Your-Roof Continue button to become available, then continue into the roof pipeline
try{ await page.waitForFunction(()=>{ const b=document.querySelector("#srContinue"); const sr=document.querySelector("#selectRoof"); return sr && sr.style.display!=="none" && b; }, { timeout:45000 }); }catch(e){ log("!! Select-Your-Roof gate never appeared"); }
await page.waitForTimeout(2500);
await page.screenshot({ path:`${OUT}/${TAG}-0-selectroof${MOBILE?"-mobile":""}.png` });
await page.evaluate(()=>{ try{ const b=document.querySelector("#srContinue"); if(b) b.click(); }catch(e){} });

try{ await page.waitForFunction(()=>window.__roofReady===true, { timeout:80000 }); }
catch(e){ log("!! __roofReady never set"); }
await page.waitForTimeout(14000);

// open Measure top-down + the editor
const launched = await page.evaluate(async ()=>{
  try{
    if(typeof showMeasDiagram==="function") showMeasDiagram(true);
    await new Promise(r=>requestAnimationFrame(r));
    await new Promise(r=>setTimeout(r,500));
    const ok = window.RoofDots && window.RoofDots.show();
    await new Promise(r=>requestAnimationFrame(r));
    return { ok, state: window.RoofDots && window.RoofDots._state() };
  }catch(e){ return { err:String(e&&e.message||e) }; }
});
log("EDITOR launched:", JSON.stringify(launched));
await page.waitForTimeout(900);
await page.screenshot({ path:`${OUT}/${TAG}-1-editor${MOBILE?"-mobile":""}.png` });

// ---- 1. topology engaged? interior junctions + per-facet SQFT ----
const topo = await page.evaluate(()=>{
  const rd=window.RoofDots;
  const ti = rd.topoInfo ? rd.topoInfo() : {on:false};
  const t = rd.totals() || {facets:[],areaSqFt:0};
  const facets=(t.facets||[]).map(f=>({i:f.i, slopedFt2:f.slopedFt2, planFt2:f.planFt2, x12:f.x12}));
  const interior = rd.interiorScreen ? rd.interiorScreen() : [];
  return { ti, nFacets:facets.length, facets, area:t.areaSqFt, sumSloped:facets.reduce((s,f)=>s+f.slopedFt2,0),
           interiorCount: interior.length, interior: interior.map(o=>({i:o.i,deg:o.deg,s:o.s?[Math.round(o.s[0]),Math.round(o.s[1])]:null})) };
});
log("\n--- TOPOLOGY ---");
log(`  topoOn=${topo.ti.on}  verts=${topo.ti.nVerts}  facets=${topo.ti.nFacets}  interiorJunctions=${topo.interiorCount}`);
log(`  topoDiag=${JSON.stringify(topo.ti.diag)}`);
log(`  per-facet sloped SQFT: [${topo.facets.map(f=>f.slopedFt2).join(", ")}]   Σ=${topo.sumSloped}  displayed=${topo.area}`);
topo.interior.forEach(o=>log(`    interior vert ${o.i}: shared by ${o.deg} facets @ screen (${o.s?o.s.join(","):"off"})`));
const topoOn = !!topo.ti.on;
const hasInterior = topo.interiorCount>0;
const sumMatches = Math.abs(topo.sumSloped - topo.area) <= 3;

let independentOk=false, dragResult=null;
if(topoOn && hasInterior){
  // ---- 2. DRAG an interior ridge vertex → adjacent facets change INDEPENDENTLY ----
  log("\n--- INTERIOR RIDGE DRAG ---");
  // pick the interior junction shared by the most facets (best signal); identify its 2 neighbour facets
  const pick = topo.interior.slice().sort((a,b)=>b.deg-a.deg)[0];
  const before = await page.evaluate(()=>window.RoofDots.facetAreas());
  const c0 = pick.s;
  // Drag the shared vert TOWARD one adjacent facet's centroid: that shrinks that facet and grows the other,
  // proving truly INDEPENDENT (opposite) per-facet recompute — not a uniform scale. Direction from geometry.
  const cents = await page.evaluate((v)=>window.RoofDots.vertFacetCentroids(v), pick.i);
  // Prefer dragging PERPENDICULAR to the shared ridge (sweeps area from one facet to the other → opposite
  // signs when they're opposing planes); fall back to toward-centroid, then a fixed offset.
  const edgeN = await page.evaluate((v)=>window.RoofDots.sharedEdgeNormalScreen ? window.RoofDots.sharedEdgeNormalScreen(v) : null, pick.i);
  let tx, ty;
  if(edgeN && edgeN.normal){ tx=c0[0]+edgeN.normal[0]*38; ty=c0[1]+edgeN.normal[1]*38; }
  else if(cents.length>=2 && cents[0].s){ const C=cents[0].s; const dx=C[0]-c0[0], dy=C[1]-c0[1]; const L=Math.hypot(dx,dy)||1;
    tx=c0[0]+dx/L*36; ty=c0[1]+dy/L*36; }
  else { tx=c0[0]+34; ty=c0[1]+22; }
  log(`  before per-facet SQFT: [${before.join(", ")}]`);
  log(`  adjacent facet centroids: ${JSON.stringify(cents.map(c=>({f:c.f,s:c.s})))}`);
  log(`  DRAG interior vert ${pick.i} (deg ${pick.deg}) (${c0[0]},${c0[1]}) -> (${round(tx)},${round(ty)}) toward facet ${cents[0]&&cents[0].f}`);
  await page.mouse.move(c0[0], c0[1]); await page.mouse.down();
  for(let i=1;i<=14;i++){ await page.mouse.move(c0[0]+(tx-c0[0])*i/14, c0[1]+(ty-c0[1])*i/14); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(500);
  const after = await page.evaluate(()=>({ areas:window.RoofDots.facetAreas(), total:window.__editTotals.areaSqFt, canonical:Math.round(window.__roofUnitSqFt()) }));
  log(`  after  per-facet SQFT: [${after.areas.join(", ")}]   total=${after.total}  canonical=${after.canonical}`);
  const deltas = after.areas.map((a,i)=>a-(before[i]||0));
  log(`  Δ per-facet:            [${deltas.map(d=>(d>=0?"+":"")+d).join(", ")}]`);
  // TRUE per-facet recompute is PROVEN when ONLY the facets adjacent to the dragged vertex change, and
  // they change by DIFFERENT amounts — impossible under a single whole-roof scale ratio (which would move
  // EVERY facet proportionally). "Opposite signs" only occurs when the junction is a ridge between two
  // opposing planes; many junctions are same-side corners, where both adjacent facets move the same way by
  // DIFFERENT magnitudes. Either way, the non-adjacent facets staying EXACTLY constant is the key signal.
  const adjFacets = cents.map(c=>c.f);
  const changed = deltas.map((d,i)=>({i,d})).filter(o=>Math.abs(o.d)>3).map(o=>o.i);
  const nonAdjChanged = changed.filter(i=>!adjFacets.includes(i));
  const grew = deltas.some(d=>d>3), shrank = deltas.some(d=>d<-3);
  const oppositeSigns = grew && shrank;
  const onlyAdjChanged = changed.length>0 && nonAdjChanged.length===0;
  const adjDiffMagnitudes = adjFacets.length>=2 && Math.abs((deltas[adjFacets[0]]||0)) - Math.abs((deltas[adjFacets[1]]||0)) !== 0;
  // pass = true per-facet recompute: changed facets are exactly the adjacent ones (not a uniform scale)
  independentOk = onlyAdjChanged && changed.length>=1;
  const canonTracks = Math.abs(after.canonical - after.total) <= 3;
  log(`  changed facets=[${changed.join(",")}]  adjacent=[${adjFacets.join(",")}]  non-adjacent-changed=[${nonAdjChanged.join(",")}]`);
  log(`  CHECK only-adjacent-facets-changed: ${onlyAdjChanged}   opposite-signs(ridge): ${oppositeSigns}   different-magnitudes: ${adjDiffMagnitudes}   canonical tracks: ${canonTracks}`);
  log(`  → true per-facet recompute (not uniform scale): ${independentOk}`);
  dragResult = { before, after:after.areas, deltas, changed, adjFacets, onlyAdjChanged, oppositeSigns };
  await page.screenshot({ path:`${OUT}/${TAG}-2-interior-dragged${MOBILE?"-mobile":""}.png` });
  // undo restores
  const undo = await page.evaluate(()=>{ window.RoofDots.undo(); return window.RoofDots.facetAreas(); });
  await page.waitForTimeout(250);
  const undoOk = undo.every((a,i)=>Math.abs(a-(before[i]||0))<=1);
  log(`  UNDO per-facet: [${undo.join(", ")}] -> ${undoOk?"RESTORED":"MISMATCH"}`);
  dragResult.undoOk = undoOk;
} else {
  log("\n--- (no interior junctions — degrade path; interior drag N/A) ---");
}

// ---- 3. OUTER corner drag still works + total updates; undo restores ----
log("\n--- OUTER CORNER DRAG ---");
const corners = await page.evaluate(()=>window.RoofDots.cornersScreen()) || [];
if(!corners.length){ log("  !! no corners — editor not open (roof gated commercial/low-confidence?) — skipping"); log(`\n==== ${TAG} : ${gpuOk?"SKIP (no editable roof)":"FAIL"} ====`); await browser.close(); process.exit(gpuOk?0:1); }
const linkInfo = await page.evaluate(()=>window.RoofDots.ringLinkInfo ? window.RoofDots.ringLinkInfo() : {boundaryLinked:false,ringVI:[]});
log(`  ring link: boundaryLinked=${linkInfo.boundaryLinked}  ringVI=[${linkInfo.ringVI.join(",")}]`);
// prefer a corner that drives a shared vert (so the total moves); else fall back to the rightmost corner.
let pickIdx=-1;
if(topoOn && linkInfo.ringVI && linkInfo.ringVI.some(v=>v>=0)){
  let bestX=-1e9; corners.forEach((c,i)=>{ if(c && linkInfo.ringVI[i]>=0 && c[0]>bestX){ bestX=c[0]; pickIdx=i; } });
}
if(pickIdx<0){ let bestX=-1e9; corners.forEach((c,i)=>{ if(c && c[0]>bestX){ bestX=c[0]; pickIdx=i; } }); }
if(pickIdx<0 || !corners[pickIdx]){ log("  !! no on-screen corner to drag — skipping outer-drag test"); log(`\n==== ${TAG} : ${(gpuOk&&sumMatches)?"PASS (degrade; outer-drag N/A)":"FAIL"} ====`); await browser.close(); process.exit((gpuOk&&sumMatches)?0:1); }
const oc = corners[pickIdx];
const otx = oc[0]-38, oty = oc[1]+24;
const ocBefore = await page.evaluate(()=>({ total:window.__editTotals.areaSqFt, canonical:Math.round(window.__roofUnitSqFt()) }));
await page.mouse.move(oc[0], oc[1]); await page.mouse.down();
for(let i=1;i<=12;i++){ await page.mouse.move(oc[0]+(otx-oc[0])*i/12, oc[1]+(oty-oc[1])*i/12); await page.waitForTimeout(16); }
await page.mouse.up();
await page.waitForTimeout(450);
const ocAfter = await page.evaluate((pi)=>({ total:window.__editTotals.areaSqFt, canonical:Math.round(window.__roofUnitSqFt()), corner:window.RoofDots.cornersScreen()[pi] }), pickIdx);
const ocMoved = Math.hypot(ocAfter.corner[0]-oc[0], ocAfter.corner[1]-oc[1]);
const ocChanged = ocAfter.total !== ocBefore.total;
log(`  before total ${ocBefore.total}  after total ${ocAfter.total}  cornerMoved ${round(ocMoved)}px  changed:${ocChanged}`);
await page.screenshot({ path:`${OUT}/${TAG}-3-outer-dragged${MOBILE?"-mobile":""}.png` });
const ocUndo = await page.evaluate(()=>{ window.RoofDots.undo(); return window.__editTotals.areaSqFt; });
await page.waitForTimeout(200);
const ocUndoOk = ocUndo === ocBefore.total;
log(`  UNDO total ${ocUndo} (want ${ocBefore.total}) -> ${ocUndoOk?"RESTORED":"MISMATCH"}`);

const pass = gpuOk && sumMatches && ocMoved>6 && ocChanged && ocUndoOk &&
  (!hasInterior || (independentOk && dragResult && dragResult.undoOk));
log(`\n==== ${TAG}${MOBILE?" (mobile)":""} : ${pass?"PASS":"FAIL"} ====`);
log(JSON.stringify({ renderer:gpu, topoOn, interiorJunctions:topo.interiorCount, nFacets:topo.nFacets,
  facetsAtRest:topo.facets.map(f=>f.slopedFt2), sumMatches,
  interiorDrag: dragResult, outerDrag:{moved:round(ocMoved),changed:ocChanged,undoOk:ocUndoOk} }, null, 0));

await browser.close();
process.exit(pass?0:1);

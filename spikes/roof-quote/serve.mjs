import http from "http"; import https from "https"; import zlib from "zlib"; import readline from "readline"; import { readFileSync, appendFileSync, existsSync, writeFileSync, mkdirSync } from "fs"; import path from "path"; import { createHash } from "crypto"; import { pathToFileURL } from "url"; import { createRequire } from "module";
const _require = createRequire(import.meta.url);
// ---- persistent disk cache: captures + AI renders survive restarts (cost lever; foundation for cross-tenant cache) ----
const CACHE_DIR=path.join(import.meta.dirname,"cache");
try{ mkdirSync(CACHE_DIR,{recursive:true}); }catch(_){}
const ckey=s=>createHash("sha1").update(String(s)).digest("hex").slice(0,16);
function diskGetJSON(prefix,key){ const f=path.join(CACHE_DIR,prefix+"-"+ckey(key)+".json"); if(existsSync(f)){ try{ return JSON.parse(readFileSync(f,"utf8")); }catch(_){} } return null; }
function diskSetJSON(prefix,key,val){ try{ writeFileSync(path.join(CACHE_DIR,prefix+"-"+ckey(key)+".json"), JSON.stringify(val)); }catch(_){} }
function diskGetBuf(prefix,key){ const f=path.join(CACHE_DIR,prefix+"-"+ckey(key)+".bin"); if(existsSync(f)){ try{ return readFileSync(f); }catch(_){} } return null; }
function diskSetBuf(prefix,key,buf){ try{ writeFileSync(path.join(CACHE_DIR,prefix+"-"+ckey(key)+".bin"), buf); }catch(_){} }
const TILES=process.env.TILES_KEY||"";
const SOLAR=process.env.SOLAR_KEY||"";
const EIA=process.env.EIA_KEY||process.env.EIA_API_KEY||"";   // US residential electricity rates (public-domain, free commercial use)
const NREL=process.env.NREL_API_KEY||"";   // api.data.gov key for PVWatts production fallback (no Google Solar coverage)
import { detectRoofFeatures } from "./rooffeatures.mjs";
import { buildRoofMask, compositeThroughMask } from "./airoof.mjs";   // roof-ONLY masked-inpaint helpers (Web-Mercator mask + post-composite passthrough)
const REPLICATE=process.env.REPLICATE_KEY||"";
const GEMINI=process.env.GEMINI_KEY||"";
const FAL=process.env.FAL_KEY||"";
const OPENAI=process.env.OPENAI_KEY||"";
const aiCache=new Map();   // address|material → rendered image url (avoid paying twice for the same render)
const featuresCache=new Map();   // address → roof feature detection (chimneys/vents/skylights/dormers)

function roofPrompt(material, pkg, view){
  // STRONG preservation anchor — img2img models (Flux Kontext) will otherwise regenerate a whole new house for
  // dramatic materials (e.g. metal). Lead with "edit THIS photo / same house / do NOT generate a new house".
  const geom = pkg ? (" The roof is "+pkg+"; keep that exact roof geometry — ridges, planes, pitch and outline.") : "";
  if(view==="street"){
    // Street-level base photo (prod fallback when no headless capture): only the visible roof slope changes.
    return "Edit THIS exact street-level photo of a house. Replace ONLY the visible roof covering (the sloped roof surface) of the main house in the centre with "+material+", covering the whole visible roof."+geom+
      " Keep the IDENTICAL same house from the input photo — same walls, siding, windows, doors, porch, chimney, gutters, lawn, driveway, vehicles, fences, trees, neighbouring houses, sky, camera angle and lighting. Do NOT generate a new or different house, building or scene; preserve every other pixel exactly. Photorealistic, sharp, natural realistic roof colour."; }
  return "Edit THIS exact photo. Change ONLY the roof covering of the main house in the centre to "+material+", covering the whole roof."+geom+
    " Keep the IDENTICAL same house from the input photo — same walls, siding, windows, doors, chimney, gutters, lawn, driveway, vehicles, trees, neighbouring houses, camera angle and lighting. Do NOT generate a new or different house, building or scene; preserve every other pixel exactly. Photorealistic, sharp, natural realistic roof colour."; }

// Street View "before" photo as a base image (plain signed-URL fetch, no headless browser) → the prod-safe fallback base.
// Probes metadata first: the Static SV image API returns 200 + a grey "no imagery" placeholder for uncovered spots,
// so check metadata status (OK vs ZERO_RESULTS/NOT_FOUND) to detect real coverage before using the image.
async function streetViewBuf(address){
  try{
    const m=await fetch("https://maps.googleapis.com/maps/api/streetview/metadata?location="+encodeURIComponent(address)+"&key="+SOLAR);
    const mj=await m.json();
    if(mj.status && mj.status!=="OK") return { ok:false, status:404, error:"no_coverage:"+mj.status };
  }catch(_){ /* best-effort; fall through */ }
  const r=await fetch("https://maps.googleapis.com/maps/api/streetview?size=640x640&location="+encodeURIComponent(address)+"&key="+SOLAR+"&fov=80&pitch=12");
  if(!r.ok) return { ok:false, status:r.status, error:"upstream "+r.status };
  return { ok:true, buf:Buffer.from(await r.arrayBuffer()) };
}

// ---- image-render providers (failover chain). Each returns an <img>-loadable url (http or data:) or throws ----
async function renderOpenAI(dataUri,material,pkg,view){
  // GPT-4o image model (gpt-image-1) via the edits endpoint — the model ChatGPT uses; crispest + best house preservation.
  if(!OPENAI) throw new Error("no_openai_key");
  const buf=Buffer.from(dataUri.split(",")[1],"base64");
  const fd=new FormData();
  fd.append("model","gpt-image-1");
  fd.append("image", new Blob([buf],{type:"image/png"}), "house.png");
  fd.append("prompt", roofPrompt(material,pkg,view));
  fd.append("size","1536x1024");        // force consistent high-res landscape (auto returns inconsistent square/landscape)
  fd.append("quality","high");
  fd.append("input_fidelity","high");   // keep the input house faithful
  const r=await fetch("https://api.openai.com/v1/images/edits",{ method:"POST", headers:{ Authorization:"Bearer "+OPENAI }, body:fd });
  if(!r.ok){ const t=await r.text().catch(()=>""); throw new Error("openai_"+r.status+":"+t.slice(0,140)); }
  const j=await r.json(); const b=j.data&&j.data[0]&&j.data[0].b64_json;
  if(!b) throw new Error("openai_no_image");
  return "data:image/png;base64,"+b;
}
// Deterministic per-house seed: SAME input image (same address) → SAME seed for every material, so Flux Kontext's
// stochastic sampling lands on the SAME house each time and only the roof (driven by the prompt) changes. Without a
// fixed seed each material is a fresh random draw → the model re-imagines walls/trees/cars ("different house per material").
function houseSeed(dataUri){ const h=createHash("sha1").update(dataUri).digest();
  return ((h[0]<<23)|(h[1]<<15)|(h[2]<<7)|(h[3]&0x7f))&0x7fffffff; }
async function renderReplicate(dataUri,material,pkg,view){
  if(!REPLICATE) throw new Error("no_replicate_key");
  // Replicate (Flux Kontext) is true img2img → keeps the house identical, only the roof changes, framing matches the
  // capture. Retry transient failures so it stays the CONSISTENT provider rather than intermittently dropping to Gemini.
  const seed=houseSeed(dataUri);   // lock seed per-house so every material renders the SAME house
  let lastErr;
  for(let attempt=0; attempt<3; attempt++){
    try{
      const rr=await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions",{
        method:"POST", headers:{ "Authorization":"Bearer "+REPLICATE, "Content-Type":"application/json", "Prefer":"wait" },
        body:JSON.stringify({ input:{ prompt:roofPrompt(material,pkg,view), input_image:dataUri, output_format:"jpg", safety_tolerance:2, seed } }) });
      let j=await rr.json(); let tries=0;
      while(j.status && !["succeeded","failed","canceled"].includes(j.status) && tries<40){
        await new Promise(s=>setTimeout(s,1500));
        const pr=await fetch(j.urls.get,{headers:{"Authorization":"Bearer "+REPLICATE}}); j=await pr.json(); tries++;
      }
      if(j.status!=="succeeded") throw new Error("replicate_"+(j.error||j.status||"failed"));
      const out=Array.isArray(j.output)?j.output[0]:j.output;
      if(!out) throw new Error("replicate_no_output");
      return out;
    }catch(e){ lastErr=e; await new Promise(s=>setTimeout(s,1800)); }
  }
  throw lastErr;
}
async function renderGemini(dataUri,material,pkg,view){
  if(!GEMINI) throw new Error("no_gemini_key");
  const b64=dataUri.split(",")[1];
  const mime=(dataUri.slice(5).split(";")[0])||"image/jpeg";
  const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key="+GEMINI,{
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ contents:[{ parts:[ {inline_data:{mime_type:mime,data:b64}}, {text:roofPrompt(material,pkg,view)} ] }] }) });
  if(!r.ok) throw new Error("gemini_"+r.status);
  const j=await r.json();
  const parts=(((j.candidates||[])[0]||{}).content||{}).parts||[];
  const img=parts.find(p=>p.inline_data||p.inlineData);
  if(!img) throw new Error("gemini_no_image");
  return "data:image/jpeg;base64,"+(img.inline_data||img.inlineData).data;
}
async function renderFal(dataUri,material,pkg,view){
  if(!FAL) throw new Error("no_fal_key");
  const fr=await fetch("https://fal.run/fal-ai/flux-pro/kontext",{
    method:"POST", headers:{ "Authorization":"Key "+FAL, "Content-Type":"application/json" },
    body:JSON.stringify({ image_url:dataUri, prompt:roofPrompt(material,pkg,view), num_images:1, safety_tolerance:"5", output_format:"jpeg" }) });
  if(!fr.ok) throw new Error("fal_"+fr.status);
  const j=await fr.json();
  const url=j.images && j.images[0] && j.images[0].url;
  if(!url) throw new Error("fal_no_image");
  return url;
}
const RENDER_CHAIN=[ ["openai",renderOpenAI], ["replicate",renderReplicate], ["gemini",renderGemini], ["fal",renderFal] ];

// ─── ROOF-ONLY top-down masked re-render ──────────────────────────────────────
// The guaranteed roof-only path (vs the Kontext img2img above, which can edit cars/yard).
//  1. Static-Maps SATELLITE (top-down, exact Web Mercator).
//  2. Building-footprint ring → roof MASK in the SAME pixel space (alignment by construction).
//  3. Flux Fill inpaint — only the masked (roof) pixels can be repainted.
//  4. POST-COMPOSITE the result back through the mask onto the ORIGINAL bytes → every non-roof
//     pixel is provably the original (proven: composited outsideMeanDiff/maxDiff == 0).
// Flux Fill bleeds outside the mask on its own (proven outsideMeanDiff ~33), so the composite
// is REQUIRED, not optional. Returns { dataUri, whiteFrac } or throws.
const TD_ZOOM=20, TD_SIZE=640, TD_SCALE=2;   // → 1280×1280 static-map satellite
async function topDownSatellite(lat,lng){
  const url="https://maps.googleapis.com/maps/api/staticmap?center="+lat+","+lng+
    "&zoom="+TD_ZOOM+"&size="+TD_SIZE+"x"+TD_SIZE+"&scale="+TD_SCALE+"&maptype=satellite&key="+TILES;
  const r=await fetch(url);
  if(!r.ok) throw new Error("staticmap_"+r.status);
  return Buffer.from(await r.arrayBuffer());
}
async function fluxFillInpaint(satBuf,maskBuf,material){
  if(!REPLICATE) throw new Error("no_replicate_key");
  // guidance≈3 (a Flux guidance scale, NOT a 0-100 %); 60 washed the colour out in testing.
  const prompt="Aerial top-down photo of a house roof. The masked roof is now covered entirely in "+material+
    ". Photorealistic shingle texture, the whole roof surface this exact colour, sharp, with shadows and lighting matching the surrounding aerial photo. Keep the exact same roof shape, ridges, hips and outline.";
  const body={ input:{ image:"data:image/png;base64,"+satBuf.toString("base64"),
    mask:"data:image/png;base64,"+maskBuf.toString("base64"), prompt, steps:50, guidance:3,
    output_format:"png", safety_tolerance:2 } };
  let rr=await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-fill-pro/predictions",{
    method:"POST", headers:{ "Authorization":"Bearer "+REPLICATE, "Content-Type":"application/json", "Prefer":"wait" },
    body:JSON.stringify(body) });
  let j=await rr.json(), tries=0;
  while(j.status && !["succeeded","failed","canceled"].includes(j.status) && tries<60){
    await new Promise(s=>setTimeout(s,1500));
    j=await fetch(j.urls.get,{headers:{"Authorization":"Bearer "+REPLICATE}}).then(r=>r.json()); tries++;
  }
  if(j.status!=="succeeded") throw new Error("flux_fill_"+(j.error||j.status||"failed"));
  const out=Array.isArray(j.output)?j.output[0]:j.output;
  if(!out) throw new Error("flux_fill_no_output");
  const raw=Buffer.from(await fetch(out).then(r=>r.arrayBuffer()));
  return raw;
}
// Full roof-only render for an address+material. Caches the composited PNG on disk per (address|material).
async function renderRoofOnlyTopDown(address,material){
  // 1) geocode
  const g=await fetch("https://maps.googleapis.com/maps/api/geocode/json?address="+encodeURIComponent(address)+"&key="+SOLAR).then(r=>r.json());
  const loc=g.status==="OK"&&g.results[0]&&g.results[0].geometry.location;
  if(!loc) throw new Error("geocode_failed");
  // 2) footprint ring (OSM→MS→cache) — the mask source. No ring → no roof-only guarantee → caller falls back.
  const fp=await footprintForPoint(loc.lat,loc.lng);
  if(!fp.ring || fp.ring.length<3) throw new Error("no_footprint");
  // 3) satellite (cache the base per-address so material flips reuse it)
  let sat=diskGetBuf("tdsat",address);
  if(!sat){ sat=await topDownSatellite(loc.lat,loc.lng); diskSetBuf("tdsat",address,sat); }
  const W=TD_SIZE*TD_SCALE, H=TD_SIZE*TD_SCALE;
  // 4) mask (feather 4px so eave edges are covered; stays roof-only)
  const m=buildRoofMask(fp.ring,loc.lat,loc.lng,TD_ZOOM,W,H,TD_SCALE,4);
  if(!(m.whiteFrac>0.002)) throw new Error("mask_empty:"+m.whiteFrac.toFixed(4));   // footprint projected off-frame → bail
  // 5) inpaint + 6) composite passthrough (guarantees non-roof == original)
  const raw=await fluxFillInpaint(sat,m.buf,material);
  const comp=compositeThroughMask(sat,raw,m.png);
  return { buf:comp.buf, base:sat, whiteFrac:m.whiteFrac, footprintSource:fp.source, attribution:fp.attribution };
}

// ---- DURABLE re-host of rendered images (audit-6 P1) ----
// Provider delivery URLs (e.g. replicate.delivery/...) are EPHEMERAL → expire to 404.
// The FIRST visitor cached that soon-dead url, so every LATER visitor got a 404 → black
// "after" panel. Fix: while the provider url is still alive, fetch the bytes server-side,
// store them in the on-disk byte cache ("airimg"), and serve them from a STABLE self-hosted
// route. data: URIs (gemini/openai b64) are already self-contained → no re-host needed.
// Returns the stable url on success, or null on failure (caller falls back to the raw url).
async function rehostRenderedImage(ck, providerUrl){
  if(!providerUrl || providerUrl.startsWith("data:")) return providerUrl;   // data URIs are durable as-is
  try{
    const r=await fetch(providerUrl);
    if(!r.ok) throw new Error("fetch "+r.status);
    const buf=Buffer.from(await r.arrayBuffer());
    if(!buf.length) throw new Error("empty");
    const ct=r.headers.get("content-type")||"image/jpeg";
    diskSetBuf("airimg",ck,buf);
    diskSetJSON("airimgct",ck,{ct});   // remember the content-type for the streaming route
    return "/airender-img?key="+encodeURIComponent(ck);
  }catch(e){
    console.error("[airender rehost fail]",e&&e.message||e);   // log + graceful fallback (not a silent swallow)
    return null;
  }
}

// ─── Property Analysis Agent: build a "House Knowledge Package" (Solar API facets + Gemini vision) ───
const knowledgeCache=new Map();   // address → knowledge package string
async function geminiVision(buf){
  if(!GEMINI) return {};
  try{
    const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key="+GEMINI,{
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ contents:[{ parts:[
        {inline_data:{mime_type:"image/png",data:buf.toString("base64")}},
        {text:'This is an aerial view of a house. Identify the MAIN house in the centre. Return ONLY compact JSON, no prose: {"roof_type":"gable|hip|flat|gambrel|complex","chimneys":<int>,"vents":<int>}'}
      ]}] }) });
    if(!r.ok) return {};
    const j=await r.json();
    const txt=(((j.candidates||[])[0]||{}).content||{}).parts||[];
    const raw=(txt.find(p=>p.text)||{}).text||"";
    const m=raw.match(/\{[\s\S]*\}/); if(!m) return {};
    return JSON.parse(m[0]);
  }catch(_){ return {}; }
}
async function houseKnowledge(address){
  if(knowledgeCache.has(address)) return knowledgeCache.get(address);
  const parts=[]; let x12=null;
  // Solar API facets (planes + pitch) — same data the widget already uses
  try{
    const g=await fetch("https://maps.googleapis.com/maps/api/geocode/json?address="+encodeURIComponent(address)+"&key="+SOLAR);
    const gj=await g.json();
    const loc=gj.status==="OK"&&gj.results[0]&&gj.results[0].geometry.location;
    if(loc){
      const bi=await fetch("https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude="+loc.lat+"&location.longitude="+loc.lng+"&requiredQuality=LOW&key="+SOLAR);
      if(bi.ok){
        const b=await bi.json();
        const segs=(b.solarPotential&&b.solarPotential.roofSegmentStats)||[];
        if(segs.length) parts.push(segs.length+" roof plane"+(segs.length>1?"s":""));
        const pitches=segs.map(s=>s.pitchDegrees).filter(x=>typeof x==="number");
        if(pitches.length){ const avg=pitches.reduce((a,b)=>a+b,0)/pitches.length; x12=Math.round(Math.tan(avg*Math.PI/180)*12); if(x12>0) parts.push("~"+x12+"/12 pitch"); }
      }
    }
  }catch(_){}
  // Gemini vision on the oblique aerial (roof type, chimneys, vents)
  try{
    const buf=await captureOblique(address);
    const v=await geminiVision(buf);
    // trust Solar's pitch over vision's type: drop a "flat" label that contradicts a steep measured pitch
    const rt=v.roof_type && String(v.roof_type).toLowerCase();
    if(rt && !(rt==="flat" && x12!=null && x12>=3)) parts.unshift(rt+" roof");
    if(typeof v.chimneys==="number") parts.push(v.chimneys+" chimney"+(v.chimneys===1?"":"s"));
    if(typeof v.vents==="number" && v.vents>0) parts.push(v.vents+" roof vent"+(v.vents===1?"":"s"));
  }catch(_){}
  const pkg=parts.join(", ");
  knowledgeCache.set(address,pkg);
  return pkg;
}

// ─── Image Collector: headless capture of the Google 3D oblique aerial (panels+UI hidden, framed on the house) ───
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let _browser=null;
async function getBrowser(){
  if(_browser){ try{ if(_browser.isConnected()) return _browser; }catch(_){} }
  // PLAYWRIGHT_PATH lets the host point at an installed playwright (e.g. a monorepo's node_modules).
  // On Windows, dynamic import() needs a file:// URL — a raw "C:\..." path throws, so convert it.
  const raw=process.env.PLAYWRIGHT_PATH;
  let spec="playwright";
  if(raw){ const full=raw.endsWith(".js")?raw:path.join(raw,"index.js"); spec=pathToFileURL(full).href; }
  const pw=await import(spec);
  const chromium=(pw.default||pw).chromium;
  // TRUE headless + software WebGL (SwiftShader): renders Google 3D tiles with no GPU/display → deployable on standard server containers
  _browser=await chromium.launch({ headless:true, args:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--no-sandbox","--ignore-gpu-blocklist"] });
  return _browser;
}
const captureCache=new Map();   // address → oblique aerial PNG buffer (one headless render per house; materials reuse it)
const captureInflight=new Map(); // address → Promise<Buffer> — de-dupe concurrent headless renders (two callers share one browser run)
const captureObliqueDown=new Map(); // address → expiry ms — oblique recently failed (no GPU/tiles); skip it & serve the fast fallback until it expires
const OBLIQUE_DOWN_TTL=10*60*1000;  // 10 min — long enough to keep /capture snappy, short enough to retry oblique later
// compass bearing from point A → point B (degrees, 0=N) — used to face the house FROM the street
function bearing(lat1,lng1,lat2,lng2){
  const r=Math.PI/180, y=Math.sin((lng2-lng1)*r)*Math.cos(lat2*r);
  const x=Math.cos(lat1*r)*Math.sin(lat2*r)-Math.sin(lat1*r)*Math.cos(lat2*r)*Math.cos((lng2-lng1)*r);
  return (Math.atan2(y,x)/r+360)%360;
}
// Public entry: cached + disk-backed + in-flight de-duped. Two concurrent callers for the same
// address share ONE headless render (never launch two browsers for one house).
async function captureOblique(address){
  // VERIFY HOOK: simulate the prod (Replit publish) runtime that ships no headless Chromium,
  // so the /airender oblique→Street View fallback can be exercised locally. Off by default.
  if(process.env.RQ_FORCE_NO_CHROMIUM==="1") throw new Error("headless browser unavailable in this runtime");
  if(captureCache.has(address)) return captureCache.get(address);
  { const d=diskGetBuf("cap",address); if(d){ captureCache.set(address,d); return d; } }
  if(captureInflight.has(address)) return captureInflight.get(address);   // a render is already running for this house → await it
  const p=(async()=>{
    const buf=await _captureObliqueRender(address);
    captureCache.set(address,buf); diskSetBuf("cap",address,buf);
    return buf;
  })().finally(()=>{ captureInflight.delete(address); });
  captureInflight.set(address,p);
  return p;
}
// The actual headless render. Bounded so it can never hang the request ~70s:
// poll __roofReady up to READY_MAX_MS, then give the tiles a short settle, then screenshot.
async function _captureObliqueRender(address){
  // Bounded readiness wait. Old code polled 60×1000ms (+9s tiles ≈ 70s worst case) which timed out
  // the client. Cap the readiness poll so /capture can fall back fast instead of hanging.
  const READY_MAX_MS=Number(process.env.RQ_CAPTURE_READY_MS||14000);   // ~14s ceiling on roof-ready (a GPU env reaches ready well under this; no-GPU never will → bail fast to fallback)
  const browser=await getBrowser();
  const ctx=await browser.newContext({ viewport:{width:1080,height:840} });
  const page=await ctx.newPage();
  try{
    const port=process.env.PORT||5300;
    await page.goto("http://localhost:"+port+"/roof3d?noauto=1",{ waitUntil:"domcontentloaded" });   // noauto → no default-address race
    await page.fill("#addr",address); await page.click("#go");
    const readyDeadline=Date.now()+READY_MAX_MS;
    let ready=false;
    while(Date.now()<readyDeadline){ if(await page.evaluate(()=>window.__roofReady===true)){ ready=true; break; } await sleep(1000); }
    // If readiness never arrived the scene/tiles aren't reliably painted (e.g. no GPU → SwiftShader can't
    // stream Google 3D tiles). Bail NOW so the route falls back to Street View FAST, instead of spending
    // another ~15s on camera+screenshot work that produces a blank/partial frame anyway.
    if(!ready) throw new Error("__roofReady not set within "+READY_MAX_MS+"ms — bailing to fallback");
    await sleep(3500);
    await page.click("#bPanels").catch(()=>{});          // solar panels OFF → clean roof
    await sleep(700);
    // face the house FROM the street (curb-appeal angle): bearing street-pano → house. Falls back to 180.
    const site=await page.evaluate(()=>(typeof window.__site==="function")?window.__site():null);
    let heading=180;
    try{
      const m=await fetch("https://maps.googleapis.com/maps/api/streetview/metadata?location="+encodeURIComponent(address)+"&key="+SOLAR);
      const mj=await m.json();
      if(mj.status==="OK" && mj.location && site) heading=bearing(mj.location.lat,mj.location.lng,site.lat,site.lng);
    }catch(_){}
    // set the camera DIRECTLY (animated flyCameraTo doesn't reliably apply under headless SwiftShader) + fly as backup
    await page.evaluate((h)=>{ try{ if(typeof window.__site!=="function") return; const s=window.__site(); const g=window.gmap;
      g.center={lat:s.lat,lng:s.lng,altitude:s.alt}; g.range=64; g.tilt=54; g.heading=h;   // zoomed OUT a bit (was 44) → more context, low-res Google imagery less obvious
      if(g.flyCameraTo) g.flyCameraTo({endCamera:{center:{lat:s.lat,lng:s.lng,altitude:s.alt},range:64,tilt:54,heading:h},durationMillis:300});
    }catch(e){} }, heading);
    await sleep(9000);                                     // SwiftShader streams the closer tiles slowly — give it time
    await page.addStyleTag({ content:"#card,#ctrls,#bar,#status,#matbar,#sunbar,#matHint,#load,#aiBtn,#aiBar,#report{display:none!important}" });
    await sleep(700);
    const buf=await page.screenshot({ type:"png" });
    return buf;
  } finally { await ctx.close(); }
}
// ─── Clean building-footprint resolver (OSM/Overpass primary → on-disk cache backstop) ───
// Pure geometry helpers (plan-metric via a local equirectangular projection about the query point).
const _m=(lat)=>({ mLat:111320, mLng:111320*Math.cos(lat*Math.PI/180) });
function ringAreaLL(ring,lat0){ const {mLat,mLng}=_m(lat0); let s=0;
  for(let i=0;i<ring.length;i++){ const a=ring[i],b=ring[(i+1)%ring.length];
    s+=(a[0]*mLng)*(b[1]*mLat)-(b[0]*mLng)*(a[1]*mLat); } return Math.abs(s)/2; }
function ringCentroidLL(ring){ let x=0,y=0; for(const[lng,lat]of ring){x+=lng;y+=lat;} return [x/ring.length,y/ring.length]; }
function pointInRingLL(pt,ring){ let inside=false; const x=pt[0],y=pt[1];
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){ const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
    if(((yi>y)!==(yj>y)) && x<(xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi) inside=!inside; } return inside; }
// drop a duplicate closing vertex; return an OPEN ring [[lng,lat],...]
function openRingLL(ring){ const r=ring.slice(); if(r.length>1){ const f=r[0],l=r[r.length-1];
  if(Math.abs(f[0]-l[0])<1e-9 && Math.abs(f[1]-l[1])<1e-9) r.pop(); } return r; }

// Choose the best building among Overpass elements: the ring that CONTAINS the point; else the
// nearest by centroid within ~40 m. Returns an open [[lng,lat]] ring or null.
function pickBuilding(elements,lat,lng){
  const cands=[];
  for(const el of (elements||[])){
    const geom=el.geometry; if(!Array.isArray(geom)||geom.length<4) continue;
    let ring=openRingLL(geom.map(g=>[g.lon,g.lat]));
    if(ring.length<3) continue;
    if(ringAreaLL(ring,lat)<8) continue;                 // skip tiny (<8 m²) noise blobs
    cands.push(ring);
  }
  if(!cands.length) return null;
  for(const ring of cands){ if(pointInRingLL([lng,lat],ring)) return ring; }   // containing building wins
  // else nearest centroid within ~40 m
  let best=null,bestD=Infinity; const {mLat,mLng}=_m(lat);
  for(const ring of cands){ const c=ringCentroidLL(ring);
    const d=Math.hypot((c[0]-lng)*mLng,(c[1]-lat)*mLat); if(d<bestD){bestD=d;best=ring;} }
  return (best && bestD<=40)?best:null;
}

async function overpassFootprint(lat,lng){
  const body="data="+encodeURIComponent('[out:json][timeout:25];way["building"](around:30,'+lat+','+lng+');out geom;');
  const headers={ "Content-Type":"application/x-www-form-urlencoded",
    // a descriptive UA is required — generic agents get 429'd by Overpass
    "User-Agent":"WeFixTrades-RoofQuote/1.0 (roof footprint lookup; contact support@wefixtrades.com)" };
  const endpoints=["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter"];
  for(const ep of endpoints){
    try{
      const r=await fetch(ep,{ method:"POST", headers, body });
      if(!r.ok) continue;                                 // 429 / 5xx → try the fallback instance
      const j=await r.json();
      const ring=pickBuilding(j.elements,lat,lng);
      if(ring) return ring;
      return null;                                        // valid empty answer (no OSM building here) → let the cache backstop handle it
    }catch(_){ /* network/parse → try next endpoint */ }
  }
  return null;
}

// ─── MULTI-building footprints inside a map-view bbox (Select-Your-Roof neighbour layer) ───
// Returns EVERY building polygon whose geometry intersects the visible map bounds, so the client can
// draw neighbouring houses as selectable outlines. bbox is the Overpass order (south,west,north,east).
// Each entry is an OPEN [[lng,lat]] ring with a stable id + centroid + area. OSM first; if OSM yields
// nothing (cold area), the Microsoft tile is scanned for every building inside the bbox as a fallback.
function _bboxClamp(s,w,n,e){
  // guard against an absurdly large bbox (whole-world query would hammer Overpass) — cap span ~0.01° (~1km)
  const cs=Math.min(s,n), cn=Math.max(s,n), cw=Math.min(w,e), ce=Math.max(w,e);
  const midLat=(cs+cn)/2, midLng=(cw+ce)/2;
  const MAXSPAN=0.012;
  const hs=Math.min((cn-cs)/2,MAXSPAN/2), hl=Math.min((ce-cw)/2,MAXSPAN/2);
  return [midLat-hs, midLng-hl, midLat+hs, midLng+hl];
}
function ringsFromOverpassEls(elements,bs,bw,bn,be){
  const out=[];
  for(const el of (elements||[])){
    const geom=el.geometry; if(!Array.isArray(geom)||geom.length<4) continue;
    const ring=openRingLL(geom.map(g=>[g.lon,g.lat]));
    if(ring.length<3) continue;
    if(ringAreaLL(ring,(bs+bn)/2)<8) continue;             // skip tiny noise blobs
    const c=ringCentroidLL(ring);
    out.push({ id:"osm/"+(el.type||"way")+"/"+(el.id!=null?el.id:(c[0].toFixed(6)+","+c[1].toFixed(6))),
               ring, centroid:c, area:ringAreaLL(ring,(bs+bn)/2), source:"osm" });
  }
  return out;
}
// Per-endpoint hard timeout so a single hung/rate-limited Overpass mirror can't eat the whole route
// budget and starve the retry. Keep it tight (the [timeout:7] server hint matches) so we get a quick
// FIRST attempt then a quick retry on the SECOND mirror, all inside OSM_FOOTPRINT_BUDGET_MS.
const OVERPASS_PER_TRY_MS=6000;
async function overpassBuildingsBbox(bs,bw,bn,be){
  const q='[out:json][timeout:7];way["building"]('+bs+','+bw+','+bn+','+be+');out geom;';
  const body="data="+encodeURIComponent(q);
  const headers={ "Content-Type":"application/x-www-form-urlencoded",
    "User-Agent":"WeFixTrades-RoofQuote/1.0 (roof footprint lookup; contact support@wefixtrades.com)" };
  const endpoints=["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter"];
  for(const ep of endpoints){
    try{
      // Tight abort so a hung mirror yields to the next one (the quick retry) well inside the budget.
      const r=await fetch(ep,{ method:"POST", headers, body, signal:AbortSignal.timeout(OVERPASS_PER_TRY_MS) });
      if(!r.ok) continue;                                   // 429/502/504 → treat as failure, try next mirror
      const j=await r.json();
      return ringsFromOverpassEls(j.elements,bs,bw,bn,be);  // possibly [] (valid empty — area genuinely has no OSM ways)
    }catch(_){ /* timeout / network → try next endpoint */ }
  }
  return null;                                              // both endpoints unreachable/failed (NOT a valid empty)
}
// Scan the Microsoft z9 tile covering the bbox centre and collect EVERY building whose centroid lands
// inside the bbox. Used only as a cold-area fallback (OSM empty). Re-uses the on-disk tile cache.
function scanMsftTileBbox(srcStream,bs,bw,bn,be){
  return new Promise((resolve)=>{
    const out=[], lat0=(bs+bn)/2;
    let done=false;
    const gun=zlib.createGunzip();
    const rl=readline.createInterface({ input:srcStream.pipe(gun), crlfDelay:Infinity });
    const finish=()=>{ if(done) return; done=true; try{ rl.close(); }catch(_){} try{ srcStream.destroy(); }catch(_){} resolve(out); };
    srcStream.on("error",finish); gun.on("error",finish); rl.on("error",finish);   // a corrupt/truncated gz tile makes gunzip error → readline re-emits it; guard the interface too so it can't crash the process
    rl.on("line",line=>{
      if(done||!line||out.length>=400) { if(out.length>=400) finish(); return; }
      let f; try{ f=JSON.parse(line); }catch(_){ return; }
      const g=f&&f.geometry; if(!g) return;
      const r=(g.type==="Polygon")?g.coordinates[0]:(g.type==="MultiPolygon"?g.coordinates[0][0]:null);
      if(!r||r.length<4) return;
      const open=openRingLL(r.map(c=>[c[0],c[1]]));
      if(open.length<3) return;
      if(ringAreaLL(open,lat0)<8) return;
      const c=ringCentroidLL(open);
      if(c[1]<bs||c[1]>bn||c[0]<bw||c[0]>be) return;        // centroid outside bbox
      out.push({ id:"msft/"+c[0].toFixed(6)+","+c[1].toFixed(6), ring:open, centroid:c, area:ringAreaLL(open,lat0), source:"msft" });
    });
    rl.on("close",finish);
  });
}
async function msftBuildingsBbox(bs,bw,bn,be){
  const lat=(bs+bn)/2, lng=(bw+be)/2;
  const idx=await loadMsftIndex();
  const qk=lngLatToQuadkey(lat,lng,9);
  const url=idx[qk];
  if(!url) return null;
  const tileFile=path.join(CACHE_DIR,"msfttile-"+qk+".gz");
  const fs=await import("fs");
  if(!existsSync(tileFile)){ const ok=await downloadMsftTile(url,tileFile); if(!ok) return null; }
  try{ return await scanMsftTileBbox(fs.createReadStream(tileFile),bs,bw,bn,be); }
  catch(_){ return null; }
}
// ─── VIDA Google–Microsoft–OSM Open Buildings (3rd footprint source — mirrors roofQuoteService.ts) ───
// FREE public anonymous S3 GeoParquet partitioned by ISO3 country, queried at request-time with DuckDB
// (no download — bbox row-group pruning). Fills coverage gaps (ZA/AU) where OSM + MS are empty. NEVER
// throws into the request path — any failure logs + returns []. ISO3 derived from the bbox centroid.
const VIDA_FOOTPRINT_BUDGET_MS=10000;   // duckdb S3 parquet read is ~9s COLD; 7s cut off genuine cold first requests
const VIDA_S3="s3://us-west-2.opendata.source.coop/vida/google-microsoft-osm-open-buildings/geoparquet/by_country";
const COUNTRY_BOXES=[
  { iso3:"ZAF", w:16.0, s:-35.0, e:33.0, n:-22.0 },
  { iso3:"AUS", w:112.0, s:-44.0, e:154.0, n:-10.0 },
  { iso3:"NZL", w:166.0, s:-47.5, e:179.0, n:-34.0 },
];
function iso3FromBbox(bs,bw,bn,be){
  const lat=(bs+bn)/2, lng=(bw+be)/2;
  for(const b of COUNTRY_BOXES) if(lng>=b.w&&lng<=b.e&&lat>=b.s&&lat<=b.n) return b.iso3;
  return null;
}
function wktOuterRing(wkt){
  if(!wkt) return null;
  const m=/\(\(([^()]*)\)/.exec(wkt);
  if(!m) return null;
  const ring=[];
  for(const pair of m[1].split(",")){
    const t=pair.trim().split(/\s+/); const lng=+t[0], lat=+t[1];
    if(!isFinite(lng)||!isFinite(lat)) continue;
    ring.push([lng,lat]);
  }
  const open=openRingLL(ring);
  return open.length>=3?open:null;
}
let _duckdbConn=null,_duckdbInit=false;
async function vidaConn(){
  if(_duckdbInit) return _duckdbConn;
  _duckdbInit=true;
  try{
    const duckdb=_require("duckdb");
    const db=new duckdb.Database(":memory:");
    const conn=db.connect();
    const run=(sql)=>new Promise((resolve,reject)=>conn.run(sql,(e)=>e?reject(e):resolve()));
    await run("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;");
    await run("SET s3_region='us-west-2'; SET s3_url_style='path'; SET s3_endpoint='s3.us-west-2.amazonaws.com';");
    _duckdbConn=conn;
  }catch(e){ console.warn("[vida] duckdb init failed — VIDA disabled:", e&&e.message); _duckdbConn=null; }
  return _duckdbConn;
}
async function vidaBuildingsBbox(bs,bw,bn,be,iso3){
  if(!iso3) return [];
  try{
    const conn=await vidaConn();
    if(!conn) return [];
    const file=`${VIDA_S3}/country_iso=${iso3}/${iso3}.parquet`;
    const sql=
      "SELECT ST_AsText(geometry) AS wkt, bf_source, confidence, area_in_meters "+
      `FROM read_parquet('${file.replace(/'/g,"''")}') `+
      `WHERE bbox.xmin <= ${be} AND bbox.xmax >= ${bw} AND bbox.ymin <= ${bn} AND bbox.ymax >= ${bs} `+
      "LIMIT 600;";
    const rows=await new Promise((resolve,reject)=>conn.all(sql,(e,r)=>e?reject(e):resolve(r||[])));
    const lat0=(bs+bn)/2, out=[];
    for(const row of rows){
      const ring=wktOuterRing(String(row.wkt||""));
      if(!ring) continue;
      if(ringAreaLL(ring,lat0)<8) continue;
      const c=ringCentroidLL(ring);
      if(c[1]<bs||c[1]>bn||c[0]<bw||c[0]>be) continue;
      out.push({ id:"vida/"+c[0].toFixed(6)+","+c[1].toFixed(6), ring, centroid:c, area:ringAreaLL(ring,lat0), source:"vida" });
    }
    return out;
  }catch(e){ console.warn("[vida] bbox query failed — skipping:", iso3, e&&e.message); return []; }
}
async function buildingsInBbox(bs,bw,bn,be){
  [bs,bw,bn,be]=_bboxClamp(bs,bw,bn,be);
  // Reliability fix: OSM (Overpass) is flaky — the public mirrors intermittently time out / 429 / 502, and
  // when they do the old SEQUENTIAL cascade returned an empty list AND only started warming the MS tile
  // AFTER OSM's full budget elapsed, so a transient Overpass blip left Select-Your-Roof stuck at the main
  // house. Now we RACE both sources concurrently (mirrors footprintCandidates): MS starts downloading its
  // tile WHILE OSM runs, so on an OSM failure the MS footprints are already in hand (or the tile is warm
  // for the immediate retry). Both are time-boxed independently, so total wait ≈ max(budget), NOT the sum.
  // 3rd source: VIDA Open Buildings (ISO3 from bbox centroid), time-boxed; vidaBuildingsBbox never throws.
  const iso3=iso3FromBbox(bs,bw,bn,be);
  const [osm,msft,vida]=await Promise.all([
    timeboxResolve(overpassBuildingsBbox(bs,bw,bn,be).catch(()=>null),OSM_FOOTPRINT_BUDGET_MS,null),
    timeboxResolve(msftBuildingsBbox(bs,bw,bn,be).catch(()=>null),MS_FOOTPRINT_BUDGET_MS,null),
    timeboxResolve(vidaBuildingsBbox(bs,bw,bn,be,iso3),VIDA_FOOTPRINT_BUDGET_MS,[]),
  ]);
  // UNIVERSAL COVERAGE ("not all roofs are being detected, in any region"): UNION OSM + Microsoft instead of
  // OSM-winner-take-all. Previously, if OSM had ANY building the MS layer was ignored — so buildings OSM was
  // MISSING (but Microsoft HAS) showed no outline (the "some detected, some not" gap, e.g. Scone UK). Now OSM
  // wins a duplicate (cleaner rings) and Microsoft ADDS every building OSM lacks. Dedup by point-in-polygon
  // (an MS centroid inside an OSM ring = the same building) so adjacent/row houses are never wrongly merged.
  const haveO=Array.isArray(osm)&&osm.length, haveM=Array.isArray(msft)&&msft.length, haveV=Array.isArray(vida)&&vida.length;
  if(haveO || haveM || haveV){
    const merged = haveO ? osm.slice() : [];
    if(haveM){
      const osmRings = haveO ? osm.map(o=>o.ring) : [];
      for(const mb of msft){ if(osmRings.some(r=>pointInRingLL(mb.centroid,r))) continue; merged.push(mb); }
    }
    if(haveV){
      // VIDA dedups against everything merged so far (OSM + added MS) — append only coverage-gap buildings.
      const existingRings = merged.map(b=>b.ring);
      for(const vb of vida){ if(existingRings.some(r=>pointInRingLL(vb.centroid,r))) continue; merged.push(vb); }
    }
    const source = [haveO?"osm":null, haveM?"msft":null, haveV?"vida":null].filter(Boolean).join("+");
    let attribution="© OpenStreetMap contributors · © Microsoft Building Footprints (ODbL/CDLA)";
    if(haveV) attribution+=" · © Google–Microsoft–OSM Open Buildings / VIDA (CC-BY-4.0)";
    // COLD-FLASH server fix: if Microsoft was still WARMING its tile (msft===null) when its budget expired,
    // this UNION is PARTIAL — it has OSM (and/or VIDA) but is MISSING every building only Microsoft covers
    // (the bulk of the neighbours in many areas). Previously this partial got CACHED (non-empty + no
    // incomplete flag), so the very first cold visit's OSM-only result shadowed the now-warm MS tile FOREVER
    // and neighbours never appeared on any later visit. Mark it `_incomplete` so the route does NOT cache it;
    // the next load re-runs live with the warm MS tile and returns the full neighbour set. (OSM flaky →
    // osm===null but MS present is already complete, so only msft===null taints the union.)
    const _incomplete = (msft===null);
    return { buildings:merged, source, attribution, _incomplete };
  }
  // Nothing usable. `_incomplete` marks WHY: MS was still downloading its cold tile (msft===null) when the
  // budget expired, so this empty answer is TRANSIENT — the tile warms in the background and the next load
  // will have it. The /buildings route uses this flag to NOT persist the empty result to disk, so the
  // retry re-runs live instead of being shadowed by a cached 0. (osm===null with msft===[] is a genuine
  // empty area — MS truly has nothing here — and is safe to cache.)
  const _incomplete = (msft===null);
  return { buildings:[], source:"none", _incomplete };
}

// On-disk pre-cached footprints (free national buildings data, fetched by a throwaway script).
// File: spikes/roof-quote/cache/footprints.geojson — a FeatureCollection of Polygon buildings.
let _fpCacheData=null, _fpCacheLoaded=false;
function loadFootprintCache(){
  if(_fpCacheLoaded) return _fpCacheData;
  _fpCacheLoaded=true;
  // Prefer the runtime cache dir; fall back to the COMMITTED backstop in the app assets dir
  // (server/roofQuote/assets/footprints.geojson) so a fresh spike checkout still has the
  // pre-cached footprints (the cache dir is gitignored).
  try{ let f=path.join(CACHE_DIR,"footprints.geojson");
    if(!existsSync(f)){ const alt=path.join(import.meta.dirname,"..","..","server","roofQuote","assets","footprints.geojson"); if(existsSync(alt)) f=alt; }
    if(existsSync(f)){ const j=JSON.parse(readFileSync(f,"utf8"));
      _fpCacheData=(j.features||[]).map(ft=>{
        const g=ft.geometry; if(!g) return null;
        const coords=(g.type==="Polygon")?g.coordinates[0]:(g.type==="MultiPolygon"?g.coordinates[0][0]:null);
        if(!coords) return null; return openRingLL(coords.map(c=>[c[0],c[1]]));
      }).filter(r=>r&&r.length>=3);
    }
  }catch(_){ _fpCacheData=null; }
  return _fpCacheData;
}
function cacheFootprint(lat,lng){
  const rings=loadFootprintCache(); if(!rings||!rings.length) return null;
  for(const ring of rings){ if(pointInRingLL([lng,lat],ring)) return ring; }   // containing building
  let best=null,bestD=Infinity; const {mLat,mLng}=_m(lat);
  for(const ring of rings){ const c=ringCentroidLL(ring);
    const d=Math.hypot((c[0]-lng)*mLng,(c[1]-lat)*mLat); if(d<bestD){bestD=d;best=ring;} }
  return (best && bestD<=40)?best:null;
}

// ─── Microsoft GlobalML Building Footprints — ON-DEMAND universal backstop (US + Canada + global) ───
// Microsoft's open Building Footprints set (CDL-licensed, free) covers essentially every building on
// Earth, distributed BY MAP TILE at Bing zoom level 9 (9-digit quadkey). A small index CSV maps
// QuadKey → a per-tile gzipped GeoJSONL download URL. For ANY lat/lng we:
//   1. compute the z9 quadkey of the point,
//   2. look its download URL up in the (disk-cached) dataset-links index,
//   3. stream-fetch + gunzip that tile, scanning line-by-line for the building CONTAINING the point
//      (else the nearest centroid within ~40 m), short-circuiting the instant we find a hit,
//   4. cache the chosen building per rounded lat/lng (the route does this) so repeats are instant.
// Index: https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv (~7 MB,
// columns: Location,QuadKey,Url,Size,UploadDate). Per-tile files are large (a z9 metro tile can be
// 30–45 MB gzipped / ~400k buildings), so the FIRST address in a fresh tile costs ~3–5 s to
// fetch+scan; we optionally cache the raw .gz to disk so a SECOND address in the same tile re-scans
// locally in ~1.5 s with no re-download. All on Node built-ins (https + zlib + readline) — no dep.
const MSFT_LINKS_URL="https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv";
const MSFT_UA="WeFixTrades-RoofQuote/1.0 (building footprint lookup; contact support@wefixtrades.com)";
const MSFT_TILE_MAX_BYTES=220*1024*1024;   // hard ceiling: refuse pathologically huge tiles rather than OOM. Dense metro
                                           // z9 tiles (e.g. Phoenix ~132 MB) are legitimate, so the ceiling is generous;
                                           // the FIRST address in such a metro pays ~8–15 s, then the disk cache makes
                                           // every later address in that tile fast. (A truly absurd tile still bails.)
let _msftIndex=null, _msftIndexLoaded=false, _msftIndexInflight=null;

// Bing tile-system quadkey for a lat/lng at a given zoom (matches the dataset's z9 partitioning).
function lngLatToQuadkey(lat,lng,z){
  const sinLat=Math.sin(Math.max(-85.05,Math.min(85.05,lat))*Math.PI/180);
  const x=(lng+180)/360;
  const y=0.5-Math.log((1+sinLat)/(1-sinLat))/(4*Math.PI);
  const n=Math.pow(2,z);
  let tx=Math.floor(x*n), ty=Math.floor(y*n);
  tx=Math.max(0,Math.min(n-1,tx)); ty=Math.max(0,Math.min(n-1,ty));
  let qk="";
  for(let i=z;i>0;i--){ let d=0; const m=1<<(i-1); if((tx&m)!==0)d+=1; if((ty&m)!==0)d+=2; qk+=d; }
  return qk;
}
// Plain HTTPS GET → Buffer (follows one level of redirect). Used for the small index CSV.
function httpsGetBuffer(url){
  return new Promise((resolve,reject)=>{
    https.get(url,{ headers:{ "User-Agent":MSFT_UA } },r=>{
      if(r.statusCode>=300 && r.statusCode<400 && r.headers.location){ r.resume(); return httpsGetBuffer(r.headers.location).then(resolve,reject); }
      if(r.statusCode!==200){ r.resume(); return reject(new Error("http_"+r.statusCode)); }
      const chunks=[]; r.on("data",c=>chunks.push(c)); r.on("end",()=>resolve(Buffer.concat(chunks))); r.on("error",reject);
    }).on("error",reject);
  });
}
// Load + cache the QuadKey→URL index, filtered to US + Canada rows (~4.5k of ~190k → ~1 MB JSON on
// disk, 30-day TTL). One ~7 MB fetch per server lifetime (then disk). Concurrent callers share one
// in-flight promise so a cold start never double-downloads. Returns a plain object map or {}.
async function loadMsftIndex(){
  if(_msftIndexLoaded) return _msftIndex||{};
  if(_msftIndexInflight) return _msftIndexInflight;
  _msftIndexInflight=(async()=>{
    // disk cache first
    try{ const c=diskGetJSON("msftidx","us-ca-v1"); if(c && c._t && (Date.now()-c._t)<30*864e5 && c.map){ _msftIndex=c.map; _msftIndexLoaded=true; return _msftIndex; } }catch(_){}
    try{
      const buf=await httpsGetBuffer(MSFT_LINKS_URL);
      const txt=buf.toString("utf8");
      const map={};
      let nl=0;
      for(let i=txt.indexOf("\n")+1; i>0 && i<txt.length; ){   // skip header row, then walk line by line
        let j=txt.indexOf("\n",i); if(j<0) j=txt.length;
        const line=txt.slice(i,j); i=j+1;
        // columns: Location,QuadKey,Url,Size,UploadDate — split on first commas (Location has no comma; URL has none)
        const a=line.indexOf(","); if(a<0) continue;
        const region=line.slice(0,a);
        if(region!=="UnitedStates" && region!=="Canada") continue;
        const b=line.indexOf(",",a+1); if(b<0) continue;
        const qk=line.slice(a+1,b);
        const d=line.indexOf(",",b+1); const url=(d<0?line.slice(b+1):line.slice(b+1,d)).trim();
        if(qk && url){ map[qk]=url; nl++; }
      }
      _msftIndex=map; _msftIndexLoaded=true;
      try{ diskSetJSON("msftidx","us-ca-v1",{ map, _t:Date.now(), n:nl }); }catch(_){}
      return map;
    }catch(e){ try{process.stderr.write("[msftidx] ERR "+(e&&e.message||e)+"\n");}catch(_){} _msftIndex={}; _msftIndexLoaded=true; return _msftIndex; }   // index unreachable → MS layer disabled, cascade falls through
  })();
  try{ return await _msftIndexInflight; } finally { _msftIndexInflight=null; }
}
// Stream a per-quadkey tile and return the open [[lng,lat]] ring of the building at the point (else
// nearest centroid ≤40 m). Streams from a local .gz if previously cached, otherwise from HTTPS while
// opportunistically persisting the .gz to disk for the next address in this tile. Short-circuits on
// the first containing building. Aborts on any error / oversized tile rather than hanging.
function scanMsftTile(srcStream,lat,lng){
  return new Promise((resolve)=>{
    const mLat=111320, mLng=111320*Math.cos(lat*Math.PI/180);
    let found=null, best=null, bestD=Infinity, done=false;
    const gun=zlib.createGunzip();
    const rl=readline.createInterface({ input:srcStream.pipe(gun), crlfDelay:Infinity });
    const finish=(val)=>{ if(done) return; done=true; try{ rl.close(); }catch(_){} try{ srcStream.destroy(); }catch(_){} resolve(val); };
    srcStream.on("error",()=>finish(null));
    gun.on("error",()=>finish(null));
    rl.on("error",()=>finish(null));   // guard the readline interface too — it re-emits the gunzip error and would otherwise crash the process
    rl.on("line",line=>{
      if(done||!line) return;
      let f; try{ f=JSON.parse(line); }catch(_){ return; }
      const g=f&&f.geometry; if(!g) return;
      const ring=(g.type==="Polygon")?g.coordinates[0]:(g.type==="MultiPolygon"?g.coordinates[0][0]:null);
      if(!ring||ring.length<4) return;
      const open=openRingLL(ring.map(c=>[c[0],c[1]]));
      if(open.length<3) return;
      if(ringAreaLL(open,lat)<8) return;                 // skip tiny noise blobs
      if(pointInRingLL([lng,lat],open)){ found=open; finish(open); return; }
      // fallback rank: nearest by centroid AND by closest edge vertex — a large building can have its
      // centroid far from a query that still sits at its edge, so track the smaller of the two.
      const c=ringCentroidLL(open);
      let dEdge=Infinity; for(const p of open){ const dv=Math.hypot((p[0]-lng)*mLng,(p[1]-lat)*mLat); if(dv<dEdge) dEdge=dv; }
      const d=Math.min(Math.hypot((c[0]-lng)*mLng,(c[1]-lat)*mLat), dEdge);
      if(d<bestD){ bestD=d; best=open; }
    });
    // Nearest building within ~60 m. Generous because some geocodes land on the street centerline a
    // few tens of metres off the house; the widget's downstream registration step REJECTS any footprint
    // needing a >5 m shift to fit Google's roof, so a genuinely-wrong neighbour still falls back to mask.
    rl.on("close",()=>{ if(done) return; finish(found || (best && bestD<=60 ? best : null)); });
  });
}
// Download a per-quadkey tile fully to disk (streamed → low memory) and atomically rename into place.
// Returns the .gz path on success, else null. Kept separate from scanning so the on-disk cache is
// always a COMPLETE file — a tile is downloaded at most once, then every later address re-scans locally.
function downloadMsftTile(url,tileFile){
  return new Promise(async(resolve)=>{
    let settled=false; const settle=(v)=>{ if(!settled){ settled=true; resolve(v); } };
    const fs=await import("fs");
    const part=tileFile+".part";
    let ws; try{ ws=fs.createWriteStream(part); }catch(_){ return settle(null); }
    const fail=()=>{ try{ ws.destroy(); }catch(_){} try{ if(fs.existsSync(part)) fs.unlinkSync(part); }catch(_){} settle(null); };
    const req=https.get(url,{ headers:{ "User-Agent":MSFT_UA } },r=>{
      if(r.statusCode!==200){ r.resume(); return fail(); }
      const len=+(r.headers["content-length"]||0);
      if(len && len>MSFT_TILE_MAX_BYTES){ r.resume(); try{req.destroy();}catch(_){} return fail(); }   // refuse to OOM on a pathological tile
      r.pipe(ws);
      r.on("error",fail);
      ws.on("error",fail);
      ws.on("finish",()=>{ try{ fs.renameSync(part,tileFile); resolve(tileFile); }catch(_){ fail(); } });
    });
    req.on("error",fail);
    req.setTimeout(45000,()=>{ try{ req.destroy(); }catch(_){} fail(); });   // generous: a cold 40 MB tile can take a few seconds, but never hang forever
  });
}
async function msftFootprint(lat,lng){
  const idx=await loadMsftIndex();
  const qk=lngLatToQuadkey(lat,lng,9);
  const url=idx[qk];
  if(!url) return null;                                  // no tile for this point (ocean / unmapped region)
  const tileFile=path.join(CACHE_DIR,"msfttile-"+qk+".gz");
  const fs=await import("fs");
  // 1) ensure the tile is on disk (download once per quadkey; later addresses skip the network)
  if(!existsSync(tileFile)){
    const ok=await downloadMsftTile(url,tileFile);
    if(!ok) return null;                                 // download failed → MS layer yields, cascade falls through
  }
  // 2) scan the COMPLETE local .gz for the building at the point. If the file is corrupt/partial the
  //    gunzip errors → null; we drop the bad file so a later request re-downloads cleanly.
  try{ const ring=await scanMsftTile(fs.createReadStream(tileFile),lat,lng); if(ring && ring.length>=3) return ring; }
  catch(_){ try{ fs.unlinkSync(tileFile); }catch(__){} }
  return null;
}

async function footprintForPoint(lat,lng){
  // CASCADE: OSM/Overpass (fast, clean where present) → Microsoft on-demand per-quadkey (universal
  // backstop, US+Canada+global) → committed national cache → {source:"none"} (widget mask fallback).
  const osm=await overpassFootprint(lat,lng).catch(()=>null);
  if(osm && osm.length>=3) return { ring:osm, source:"osm", attribution:"© OpenStreetMap contributors" };
  const msft=await msftFootprint(lat,lng).catch(()=>null);
  if(msft && msft.length>=3) return { ring:msft, source:"msft", attribution:"© Microsoft Building Footprints (ODbL/CDLA)" };
  const cached=cacheFootprint(lat,lng);
  if(cached && cached.length>=3) return { ring:cached, source:"cache", attribution:"© Microsoft / national building footprints" };
  return { source:"none" };
}

// (fix6 latency) Time-box the Microsoft fetch so a slow cold tile NEVER blocks the response.
// MS_FOOTPRINT_BUDGET_MS is how long the route is willing to WAIT for MS before responding with
// whatever it has (OSM). The msftFootprint() promise we kicked off is NOT aborted — Node keeps it
// running, so its downloadMsftTile() finishes and writes the .gz to the disk tile cache in the
// BACKGROUND. The NEXT request for that metro then finds the cached tile and returns MS instantly.
// Dense-metro z9 tiles (Phoenix/Denver ~100-130 MB) cost 15-25 s cold; that no longer stalls the
// caller. timeboxResolve's reject arm handles any eventual rejection so it never becomes unhandled.
const MS_FOOTPRINT_BUDGET_MS=6500;
const OSM_FOOTPRINT_BUDGET_MS=8000;   // overall route ceiling: even if Overpass stalls (its own [timeout:25] is too long), bail at 8s → route ≤~8s
// Resolve `live` to its value if it settles within `ms`, else `fallback`. Does NOT abort `live` — it
// keeps running so any in-flight download finishes + caches in the background; we just stop waiting.
function timeboxResolve(live,ms,fallback){
  // `live` keeps running past `ms` (handlers attached, never aborted), so an in-flight tile download
  // finishes + caches in the background. The `.then` reject arm below is a real handler, so a late
  // rejection can never become an unhandled rejection.
  return new Promise((resolve)=>{
    let settled=false;
    const t=setTimeout(()=>{ if(!settled){ settled=true; resolve(fallback); } },ms);
    live.then(v=>{ if(!settled){ settled=true; clearTimeout(t); resolve(v); } },()=>{ if(!settled){ settled=true; clearTimeout(t); resolve(fallback); } });
  });
}
function timeboxMsft(lat,lng){
  // Resolves to the MS ring if it arrives within the budget, else null. The underlying msftFootprint
  // promise keeps running past the budget to finish + cache the tile for the next request.
  return timeboxResolve(msftFootprint(lat,lng),MS_FOOTPRINT_BUDGET_MS,null);
}

// (fix4 #1) Return EVERY available footprint candidate (OSM + Microsoft + cache), fetched in PARALLEL,
// so the CLIENT can register EACH to Google's roof reference and pick the one that lands BEST (smallest
// post-registration shift / best mask-overlap) — instead of the old "first source wins" cascade, which
// on 4521 T St took the 16.9 m-off Microsoft ring over the 0.19 m-perfect OSM ring. The cascade order
// is preserved in `primary` for any consumer that wants a single best-guess, but the multi-candidate
// `candidates[]` is the real payload the registration step consumes. OSM and MS are independent network
// fetches → run concurrently. (fix6) MS is TIME-BOXED so a slow cold tile can't block: if it returns in
// time it's included as a candidate (best-aligned selection still works); if it's slow we respond with
// OSM now and let MS finish + cache in the background for the next request.
async function footprintCandidates(lat,lng){
  const [osm,msft]=await Promise.all([
    timeboxResolve(overpassFootprint(lat,lng).catch(()=>null),OSM_FOOTPRINT_BUDGET_MS,null),
    timeboxMsft(lat,lng),
  ]);
  const candidates=[];
  if(osm && osm.length>=3) candidates.push({ ring:osm, source:"osm", attribution:"© OpenStreetMap contributors" });
  if(msft && msft.length>=3) candidates.push({ ring:msft, source:"msft", attribution:"© Microsoft Building Footprints (ODbL/CDLA)" });
  if(!candidates.length){ const cached=cacheFootprint(lat,lng);
    if(cached && cached.length>=3) candidates.push({ ring:cached, source:"cache", attribution:"© Microsoft / national building footprints" }); }
  // `msPending` = MS was still downloading/caching when the budget expired, so this candidate set is
  // INCOMPLETE (missing MS). The route uses this to AVOID persisting an OSM-only set to disk — otherwise
  // the cache HIT would forever shadow the MS tile that's warming in the background. With msPending the
  // next request re-runs footprintCandidates and finds the now-cached MS tile fast.
  const msPending = !msft;
  if(!candidates.length) return { source:"none", candidates:[], msPending };
  // `primary` = the legacy cascade pick (OSM>MS>cache) so older single-source consumers still work;
  // `ring`/`source`/`attribution` mirror it at top level for the same reason.
  const primary=candidates[0];
  return { ring:primary.ring, source:primary.source, attribution:primary.attribution, candidates, msPending };
}

const html=readFileSync(path.join(import.meta.dirname,"index.html"),"utf8").replaceAll("__TILES__",TILES);
const map3dHtml=readFileSync(path.join(import.meta.dirname,"map3d.html"),"utf8").replaceAll("__TILES__",TILES);
let roof3dHtml=""; try{ roof3dHtml=readFileSync(path.join(import.meta.dirname,"roof3d.html"),"utf8").replaceAll("__TILES__",TILES); }catch(_){}
http.createServer(async (req,res)=>{
  const u=new URL(req.url,"http://x");
  res.setHeader("Cache-Control","no-store, must-revalidate");  // HTML must never cache (geotiff route overrides below)
  if(u.pathname==="/"){   // the real widget lives at /roof3d; the old index.html root is a stale blank-void foot-gun → redirect the dev-server root to the real widget
    res.statusCode=302; res.setHeader("Location","/roof3d"+(u.search||"")); res.end(); return;
  }
  if(u.pathname==="/map3d"){
    res.setHeader("Content-Type","text/html"); res.end(map3dHtml); return;
  }
  if(u.pathname==="/roof3d"){
    res.setHeader("Content-Type","text/html");
    res.end(roof3dHtml||readFileSync(path.join(import.meta.dirname,"roof3d.html"),"utf8").replaceAll("__TILES__",TILES)); return;
  }
  if(u.pathname==="/roofgeo.mjs"){   // client-side roof geometry engine (pure module)
    res.setHeader("Content-Type","application/javascript");
    try{ res.end(readFileSync(path.join(import.meta.dirname,"roofgeo.mjs"),"utf8")); }catch(e){ res.statusCode=503; res.end("// roofgeo.mjs not built yet"); }
    return;
  }
  // Landing-hero aerial background clips — self-hosted, web-compressed H.264 (assets/hero/hero1.mp4 …).
  // The widget references them at /assets/hero/* (dev) or RQ_BASE+/assets/hero/* (prod Express). Supports
  // HTTP Range so the browser can seek/buffer the loop. Bare-filename only (no path traversal).
  if(u.pathname.startsWith("/assets/hero/") && u.pathname.endsWith(".mp4")){
    const name=path.basename(u.pathname);
    const fp=path.join(import.meta.dirname,"assets","hero",name);
    try{
      const buf=readFileSync(fp);
      const range=req.headers.range;
      res.setHeader("Content-Type","video/mp4");
      res.setHeader("Accept-Ranges","bytes");
      res.setHeader("Cache-Control","public,max-age=604800");
      if(range){
        const m=/bytes=(\d+)-(\d*)/.exec(range);
        const start=m?parseInt(m[1],10):0;
        const end=(m&&m[2])?parseInt(m[2],10):buf.length-1;
        res.statusCode=206;
        res.setHeader("Content-Range","bytes "+start+"-"+end+"/"+buf.length);
        res.setHeader("Content-Length",end-start+1);
        res.end(buf.subarray(start,end+1));
      } else {
        res.setHeader("Content-Length",buf.length);
        res.end(buf);
      }
    }catch(e){ res.statusCode=404; res.end("video not found"); }
    return;
  }
  // Self-hosted Satoshi/Geist woff2 — the widget's @font-face points at /fonts/*.woff2 (same paths
  // the embedded wefixtrades app serves from client/public/fonts). Without this route the spike fell
  // through to the HTML handler, so the browser got text/html for a .woff2 and logged
  // "OTS parsing error: invalid sfntVersion" on every load. Serve the real files. (audit-4 P2.)
  if(u.pathname.startsWith("/fonts/") && u.pathname.endsWith(".woff2")){
    const name=path.basename(u.pathname);   // strip any path traversal; only the bare filename is used
    const fp=path.join(import.meta.dirname,"..","..","client","public","fonts",name);
    try{ const buf=readFileSync(fp); res.setHeader("Content-Type","font/woff2"); res.setHeader("Cache-Control","public,max-age=604800"); res.end(buf); }
    catch(e){ res.statusCode=404; res.end("font not found"); }
    return;
  }
  if(u.pathname==="/pricing"){
    res.setHeader("Content-Type","text/html");
    res.end(readFileSync(path.join(import.meta.dirname,"pricing.html"),"utf8")); return;
  }
  if(u.pathname==="/shadows-test"){   // standalone photoreal-3D-tiles + sun-shadow spike (read fresh each request for fast iteration)
    res.setHeader("Content-Type","text/html");
    try{ res.end(readFileSync(path.join(import.meta.dirname,"shadows-test.html"),"utf8").replaceAll("__TILES__",TILES)); }
    catch(e){ res.statusCode=503; res.end("shadows-test.html not found"); }
    return;
  }
  // ---- capture a homeowner lead (POST) → append to leads.jsonl (real deploy: webhook/email to contractor) ----
  if(u.pathname==="/lead" && req.method==="POST"){
    let body=""; req.on("data",c=>body+=c); req.on("end",()=>{
      try{ const rec=JSON.parse(body||"{}"); rec.ts=Date.now();
        appendFileSync(path.join(import.meta.dirname,"leads.jsonl"), JSON.stringify(rec)+"\n"); }catch(e){}
      res.setHeader("Content-Type","application/json"); res.end('{"ok":true}');
    }); return;
  }
  // ---- server-side geocode (no referrer; uses Solar key now authorized for Geocoding API) ----
  // Prefer place_id when the client picked an autocomplete suggestion: geocoding by place_id
  // resolves the EXACT parcel Google already chose, so it can never drift to the street/route
  // centroid the way re-geocoding a free-text string can (the P0 where "7 Painter Ave" resolved
  // to "Painter Ave" → a degenerate roof). Falls back to the address string when no place_id.
  if(u.pathname==="/geocode"){
    const addr=u.searchParams.get("address")||"";
    const placeId=u.searchParams.get("place_id")||"";
    res.setHeader("Content-Type","application/json");
    try{
      const q = placeId ? ("place_id="+encodeURIComponent(placeId)) : ("address="+encodeURIComponent(addr));
      const r=await fetch("https://maps.googleapis.com/maps/api/geocode/json?"+q+"&key="+SOLAR);
      const j=await r.json();
      if(j.status==="OK"&&j.results[0]){ const l=j.results[0].geometry.location;
        res.end(JSON.stringify({lat:l.lat,lng:l.lng,formatted:j.results[0].formatted_address})); }
      else res.end(JSON.stringify({error:j.status,message:j.error_message||""}));
    }catch(e){ res.end(JSON.stringify({error:String(e)})); }
    return;
  }
  if(u.pathname==="/rates"){
    // Real local residential electricity rate ($/kWh). US: live EIA (cached ~14d). Canada: researched provincial table (no public API exists).
    res.setHeader("Content-Type","application/json");
    const country=(u.searchParams.get("country")||"US").toUpperCase();
    const region=(u.searchParams.get("region")||u.searchParams.get("state")||u.searchParams.get("province")||"").toUpperCase();
    // Canadian provincial residential ¢/kWh (approx 2026; refresh ~2x/yr from utility tariffs — no aggregated API exists)
    const CA_RATES={ON:0.130,BC:0.115,AB:0.170,QC:0.078,MB:0.097,SK:0.180,NS:0.183,NB:0.137,NL:0.139,PE:0.166,NT:0.380,YT:0.190,NU:0.375};
    try{
      if(country==="CA"){ const rate=CA_RATES[region]; if(rate) return res.end(JSON.stringify({rate,region,source:"provincial tariff (approx)"}));
        return res.end(JSON.stringify({error:"no_rate",region})); }
      // US via EIA
      if(!region || region.length!==2) return res.end(JSON.stringify({error:"bad_region"}));
      const cached=diskGetJSON("rate",country+region);
      if(cached && cached._t && (Date.now()-cached._t)<14*864e5) return res.end(JSON.stringify(cached));
      if(!EIA) return res.end(JSON.stringify({error:"no_eia_key"}));
      const url="https://api.eia.gov/v2/electricity/retail-sales/data/?api_key="+EIA+"&frequency=monthly&data%5B0%5D=price&facets%5Bstateid%5D%5B0%5D="+region+"&facets%5Bsectorid%5D%5B0%5D=RES&sort%5B0%5D%5Bcolumn%5D=period&sort%5B0%5D%5Bdirection%5D=desc&length=1";
      const r=await fetch(url); const j=await r.json();
      const row=j&&j.response&&j.response.data&&j.response.data[0];
      if(row&&row.price){ const out={rate:+(row.price/100).toFixed(4),region,period:row.period,source:"EIA "+row.period}; out._t=Date.now(); diskSetJSON("rate",country+region,out); return res.end(JSON.stringify(out)); }
      return res.end(JSON.stringify({error:"no_rate",region}));
    }catch(e){ res.end(JSON.stringify({error:String(e)})); }
    return;
  }
  if(u.pathname==="/pvwatts"){
    // Production fallback for addresses Google Solar doesn't cover (NREL PVWatts v8, api.data.gov key). Cached.
    res.setHeader("Content-Type","application/json");
    const lat=u.searchParams.get("lat"), lng=u.searchParams.get("lng"), kw=+(u.searchParams.get("kw")||6)||6;
    if(!lat||!lng) return res.end(JSON.stringify({error:"bad_coords"}));
    const ckeyStr=(+lat).toFixed(2)+","+(+lng).toFixed(2)+","+kw;
    const cached=diskGetJSON("pvwatts",ckeyStr); if(cached) return res.end(JSON.stringify(cached));
    if(!NREL) return res.end(JSON.stringify({error:"no_nrel_key"}));
    try{
      const r=await fetch("https://developer.nrel.gov/api/pvwatts/v8.json?api_key="+NREL+"&lat="+lat+"&lon="+lng+"&system_capacity="+kw+"&azimuth=180&tilt=20&array_type=1&module_type=0&losses=14");
      const j=await r.json();
      const ann=j&&j.outputs&&j.outputs.ac_annual;
      if(ann){ const out={annualKwh:Math.round(ann),kw,source:"NREL PVWatts v8"}; diskSetJSON("pvwatts",ckeyStr,out); return res.end(JSON.stringify(out)); }
      return res.end(JSON.stringify({error:"no_pvwatts",detail:(j&&j.errors)||null}));
    }catch(e){ res.end(JSON.stringify({error:String(e)})); }
    return;
  }
  if(u.pathname==="/sun"){
    // Peak sun-hours (annual avg daily irradiance kWh/m²/day) from NASA POWER — no key, public-domain, global (incl. Canada north). Cached long (climatology).
    res.setHeader("Content-Type","application/json");
    const lat=u.searchParams.get("lat"), lng=u.searchParams.get("lng");
    if(!lat||!lng) return res.end(JSON.stringify({error:"bad_coords"}));
    const ckeyStr=(+lat).toFixed(2)+","+(+lng).toFixed(2);
    const cached=diskGetJSON("sun",ckeyStr); if(cached) return res.end(JSON.stringify(cached));
    try{
      const r=await fetch("https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN&community=RE&longitude="+lng+"&latitude="+lat+"&format=JSON");
      const j=await r.json();
      const ann=j&&j.properties&&j.properties.parameter&&j.properties.parameter.ALLSKY_SFC_SW_DWN&&j.properties.parameter.ALLSKY_SFC_SW_DWN.ANN;
      if(ann){ const out={sunHours:+(+ann).toFixed(1),source:"NASA POWER"}; diskSetJSON("sun",ckeyStr,out); return res.end(JSON.stringify(out)); }
      return res.end(JSON.stringify({error:"no_sun"}));
    }catch(e){ res.end(JSON.stringify({error:String(e)})); }
    return;
  }
  // ---- Clean VECTOR building footprint (eave outline source) ----
  // Returns ONE clean building-footprint ring as GeoJSON [lng,lat][] — the EVEN/straight
  // outer roofline source that replaces the fuzzy Solar-mask Moore-trace. Coverage cascade:
  //   1. OpenStreetMap via Overpass (free, hosted, no dep) — the ring CONTAINING the point,
  //      else the nearest building centroid within ~40 m.
  //   2. Microsoft GlobalML Building Footprints ON-DEMAND (msftFootprint) — universal US+Canada
  //      backstop: z9 quadkey → per-tile gzipped GeoJSONL → building at the point. First hit per
  //      tile ~3–5 s (40 MB fetch+scan), cached .gz makes later same-tile addresses ~1.5 s.
  //   3. On-disk pre-cached footprints (spikes/roof-quote/cache/footprints.geojson) — legacy
  //      neighborhood cache (e.g. 30 Angus Rd, Hamilton); now largely subsumed by (2).
  //   4. {source:"none"} → the widget keeps its mask-trace fallback (flagged low-confidence).
  // Disk-cached by rounded lat/lng like the other endpoints.
  if(u.pathname==="/footprint"){
    res.setHeader("Content-Type","application/json");
    const lat=+(u.searchParams.get("lat")), lng=+(u.searchParams.get("lng"));
    if(!isFinite(lat)||!isFinite(lng)){ res.end(JSON.stringify({error:"bad_coords"})); return; }
    const gk=lat.toFixed(5)+","+lng.toFixed(5);
    // src=msft forces the Microsoft on-demand layer (skips OSM) — diagnostic only, lets ops verify
    // the universal backstop independently of whatever OSM happens to have for a given address.
    const forceSrc=(u.searchParams.get("src")||"").toLowerCase();
    if(forceSrc!=="msft"){ const c=diskGetJSON("footprint",gk); if(c&&c._t&&(Date.now()-c._t)<30*864e5){ res.setHeader("X-Cache","HIT"); res.end(JSON.stringify(c.body)); return; } }
    res.setHeader("X-Cache","MISS");
    try{
      let out;
      if(forceSrc==="msft"){ const m=await msftFootprint(lat,lng).catch(()=>null);
        out = (m&&m.length>=3) ? { ring:m, source:"msft", attribution:"© Microsoft Building Footprints (ODbL/CDLA)", candidates:(m&&m.length>=3)?[{ring:m,source:"msft",attribution:"© Microsoft Building Footprints (ODbL/CDLA)"}]:[] } : { source:"none", candidates:[] };
      } else out=await footprintCandidates(lat,lng);   // (fix4 #1) returns ALL sources so the client registers each + picks the best-aligned
      // Cache the WHOLE candidate set (so a repeat still has OSM+MS to choose from), as long as at least one real source hit.
      // (fix6) BUT do NOT persist when MS is still warming in the background (out.msPending): an OSM-only HIT would
      // permanently shadow the MS tile that's caching right now. Skipping the write lets the NEXT request re-run,
      // find the now-cached MS tile, and persist the complete OSM+MS set then.
      const hasReal = out && Array.isArray(out.candidates) && out.candidates.some(c=>c.ring&&c.ring.length>=4&&(c.source==="osm"||c.source==="msft"));
      if(hasReal && !out.msPending){
        diskSetJSON("footprint",gk,{ body:out, _t:Date.now() });
      }
      // (measure-stable) EXPOSE `incomplete` on the wire. When MS was still warming (msPending) the
      // candidate set is OSM-only and was NOT persisted — a different (incomplete) footprint than the
      // COMPLETE OSM+MS set the NEXT request will get from the now-warm cache. Because the client's facet
      // partition depends on WHICH candidates it registers, measuring on the incomplete set yields a
      // DIFFERENT (wrong) result than every subsequent load — the non-determinism. Telling the client the
      // set is incomplete lets it wait + refetch the complete set before pinning the measurement, so the
      // first cold load measures the SAME thing as all later loads. (Renamed from the internal msPending;
      // old clients simply ignore the extra field.)
      if(out && typeof out==="object"){ const { msPending, ...rest }=out; const wire={ ...rest, incomplete: !!msPending }; res.end(JSON.stringify(wire)); }
      else res.end(JSON.stringify(out));
    }catch(e){ res.end(JSON.stringify({error:String(e&&e.message||e),source:"none"})); }
    return;
  }
  // ---- MULTI-building footprints within the visible map bbox (Select-Your-Roof neighbour layer) ----
  // Query: /buildings?bbox=south,west,north,east  → { buildings:[{id,ring,centroid,area,source}], source, attribution }
  // ring is OPEN [[lng,lat],...]. OSM (Overpass way[building] over the bbox) first; Microsoft tile
  // scan as a cold-area fallback. Empty {buildings:[]} is a valid answer (client degrades to single building).
  // Disk-cached by the rounded bbox, 7-day TTL (neighbourhoods don't change fast).
  if(u.pathname==="/buildings"){
    res.setHeader("Content-Type","application/json");
    const parts=(u.searchParams.get("bbox")||"").split(",").map(Number);
    if(parts.length!==4 || parts.some(n=>!isFinite(n))){ res.end(JSON.stringify({error:"bad_bbox",buildings:[]})); return; }
    const [bs,bw,bn,be]=parts;
    const gk=[bs,bw,bn,be].map(n=>n.toFixed(4)).join(",");
    { const c=diskGetJSON("buildings",gk); if(c&&c.body&&c._t&&(Date.now()-c._t)<7*864e5){ res.setHeader("X-Cache","HIT"); res.end(JSON.stringify(c.body)); return; } }
    res.setHeader("X-Cache","MISS");
    try{
      const out=await buildingsInBbox(bs,bw,bn,be);
      // `_incomplete` = MS tile was still warming when the budget expired → a transient empty; do NOT cache
      // it (a cached 0 would shadow the now-warming tile forever and the user stays stuck at the main house).
      // Strip the internal flag before it goes on the wire so the response shape stays identical for the client.
      const incomplete=!!(out && out._incomplete);
      if(out && typeof out==="object") delete out._incomplete;
      // Only persist NON-empty, COMPLETE results. Empty-but-complete (genuine sparse area) and incomplete
      // (transient failure) both skip the cache → the next load retries live and self-heals.
      if(out && Array.isArray(out.buildings) && out.buildings.length && !incomplete){ diskSetJSON("buildings",gk,{ body:out, _t:Date.now() }); }
      res.end(JSON.stringify(out));
    }catch(e){ res.end(JSON.stringify({error:String(e&&e.message||e),buildings:[],source:"none"})); }
    return;
  }
  if(u.pathname==="/solar"){
    const lat=u.searchParams.get("lat"), lng=u.searchParams.get("lng");
    res.setHeader("Content-Type","application/json");
    // Solar buildingInsights is static per location + billable + daily-quota-capped → disk-cache successful
    // responses keyed by lat/lng rounded to 5dp (~1m; near-identical loads share one entry), 30d TTL. Errors NOT cached.
    const gk=(+lat).toFixed(5)+","+(+lng).toFixed(5);
    { const c=diskGetJSON("solar",gk); if(c&&c.body&&c._t&&(Date.now()-c._t)<30*864e5){ res.setHeader("X-Cache","HIT"); res.end(c.body); return; } }
    res.setHeader("X-Cache","MISS");
    try{
      const r=await fetch("https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude="+lat+"&location.longitude="+lng+"&requiredQuality=LOW&key="+SOLAR);
      const t=await r.text();
      if(r.ok) diskSetJSON("solar",gk,{body:t,_t:Date.now()});
      res.end(r.ok ? t : JSON.stringify({error:"no_solar", code:r.status}));
    }catch(e){ res.end(JSON.stringify({error:String(e)})); }
    return;
  }
  // ---- Solar dataLayers metadata (returns rgbUrl/maskUrl/dsmUrl/annualFluxUrl as geoTiff:get URLs) ----
  if(u.pathname==="/datalayers"){
    const lat=u.searchParams.get("lat"), lng=u.searchParams.get("lng");
    const fresh=u.searchParams.get("fresh")==="1";   // client sets this to bypass cache + re-mint signed geoTiff URLs after a stale-token 400
    res.setHeader("Content-Type","application/json");
    // dataLayers responses EMBED geoTiff:get URLs whose signed tokens expire in ~hours.
    // Cache them only for DATALAYERS_TTL_MS (well under the token lifetime) so a cached
    // address never serves stale-token URLs that 400 → "Invalid byte order" client-side.
    // (buildingInsights /solar stays 30d — it has no tokens.) `fresh=1` skips the read.
    const DATALAYERS_TTL_MS=30*60*1000;   // 30 min — under Google's signed-token lifetime
    const gk=(+lat).toFixed(5)+","+(+lng).toFixed(5);
    if(!fresh){ const c=diskGetJSON("datalayers",gk); if(c&&c.body&&c._t&&(Date.now()-c._t)<DATALAYERS_TTL_MS){ res.setHeader("X-Cache","HIT"); res.end(c.body); return; } }
    res.setHeader("X-Cache","MISS");
    try{
      const url="https://solar.googleapis.com/v1/dataLayers:get?location.latitude="+lat+
        "&location.longitude="+lng+"&radiusMeters=40&view=FULL_LAYERS&requiredQuality=LOW&pixelSizeMeters=0.1&key="+SOLAR;
      const r=await fetch(url);
      const t=await r.text();
      if(r.ok) diskSetJSON("datalayers",gk,{body:t,_t:Date.now()});
      res.end(r.ok ? t : JSON.stringify({error:"no_datalayers", code:r.status}));
    }catch(e){ res.end(JSON.stringify({error:String(e)})); }
    return;
  }
  // ---- GeoTIFF proxy: fetch a Solar geoTiff:get URL server-side (appends key) and stream bytes back.
  //      Host-whitelisted to solar.googleapis.com so the key can never be used to proxy arbitrary URLs.
  if(u.pathname==="/geotiff"){
    const raw=u.searchParams.get("u");
    if(!raw){ res.statusCode=400; res.end("missing u"); return; }
    let target;
    try{ target=new URL(raw); }catch(e){ res.statusCode=400; res.end("bad url"); return; }
    if(target.hostname!=="solar.googleapis.com"){ res.statusCode=403; res.end("host not allowed"); return; }
    try{
      target.searchParams.set("key",SOLAR);
      const r=await fetch(target.toString());
      if(!r.ok){ res.statusCode=r.status; res.end("upstream "+r.status); return; }
      const buf=Buffer.from(await r.arrayBuffer());
      res.setHeader("Content-Type", r.headers.get("content-type")||"image/tiff");
      res.setHeader("Cache-Control","public, max-age=600");
      res.end(buf);
    }catch(e){ res.statusCode=502; res.end(String(e)); }
    return;
  }
  // ---- Street View proxy (key hidden server-side) → the "before" photo for the visualizer ----
  if(u.pathname==="/streetview"){
    const address=u.searchParams.get("address")||"";
    if(!address){ res.statusCode=400; res.end("missing address"); return; }
    try{
      const r=await fetch("https://maps.googleapis.com/maps/api/streetview?size=640x640&location="+encodeURIComponent(address)+"&key="+SOLAR+"&fov=80&pitch=12");
      if(!r.ok){ res.statusCode=r.status; res.end("upstream "+r.status); return; }
      const buf=Buffer.from(await r.arrayBuffer());
      res.setHeader("Content-Type","image/jpeg"); res.setHeader("Cache-Control","public, max-age=3600"); res.end(buf);
    }catch(e){ res.statusCode=502; res.end(String(e)); }
    return;
  }
  // ---- Property Analysis Agent: House Knowledge Package for an address (Solar facets + Gemini vision) ----
  if(u.pathname==="/analyze"){
    res.setHeader("Content-Type","application/json");
    const address=u.searchParams.get("address")||"";
    if(!address){ res.end('{"error":"no_address"}'); return; }
    try{ const pkg=await houseKnowledge(address); res.end(JSON.stringify({knowledge:pkg})); }
    catch(e){ res.end(JSON.stringify({error:String(e&&e.message||e)})); }
    return;
  }
  // ---- Roof Feature detection (Gemini vision): chimneys/vents/skylights/dormers + roof type, cached ----
  if(u.pathname==="/features"){
    res.setHeader("Content-Type","application/json");
    const address=u.searchParams.get("address")||"";
    if(!address){ res.end('{"error":"no_address"}'); return; }
    if(featuresCache.has(address)){ res.end(JSON.stringify(Object.assign({cached:true},featuresCache.get(address)))); return; }
    try{ const buf=await captureOblique(address); const f=await detectRoofFeatures(buf, GEMINI); featuresCache.set(address,f); res.end(JSON.stringify(f)); }
    catch(e){ res.end(JSON.stringify({error:String(e&&e.message||e),ok:false})); }
    return;
  }
  // ---- Image Collector: oblique 3D aerial of the house (headless capture, cached per address) ----
  if(u.pathname==="/capture"){
    const address=u.searchParams.get("address")||"";
    if(!address){ res.statusCode=400; res.end("missing address"); return; }
    // ALWAYS return SOME image fast, never hang. Chain: bounded headless oblique → Street View "before".
    // X-Capture-Source tells the client which path served it (oblique | streetview) so it can label honestly.
    // Fast path: a real oblique is already cached → serve it.
    if(captureCache.has(address) || diskGetBuf("cap",address)){
      try{ const buf=await captureOblique(address);
        res.setHeader("Content-Type","image/png"); res.setHeader("Cache-Control","public, max-age=3600");
        res.setHeader("X-Capture-Source","oblique"); res.end(buf); return;
      }catch(_){ /* fall through to fallback chain below */ }
    }
    // If oblique recently failed for this address (no GPU/tiles), skip the ~20s headless attempt and
    // serve the cached/fresh Street-View fallback directly — keeps repeat /capture calls snappy.
    const obliqueDown=(captureObliqueDown.get(address)||0)>Date.now();
    const serveStreetView=async(extra)=>{
      const cached=diskGetBuf("capfb",address);   // previously-fetched Street-View "before" → instant
      if(cached){ res.setHeader("Content-Type","image/jpeg"); res.setHeader("Cache-Control","public, max-age=3600");
        res.setHeader("X-Capture-Source","streetview"); res.end(cached); return true; }
      const sv=await streetViewBuf(address).catch(e=>({ok:false,status:0,error:String(e&&e.message||e)}));
      if(sv.ok){ diskSetBuf("capfb",address,sv.buf);
        res.setHeader("Content-Type","image/jpeg"); res.setHeader("Cache-Control","public, max-age=3600");
        res.setHeader("X-Capture-Source","streetview"); res.end(sv.buf); return true; }
      // Neither oblique nor Street View available → honest failure (client paints its own aerial fallback).
      res.statusCode=502; res.setHeader("Content-Type","text/plain"); res.setHeader("X-Capture-Source","none");
      res.end("capture_failed: "+(extra||"")+"streetview("+(sv.status?sv.status+" ":"")+sv.error+")");
      return false;
    };
    if(obliqueDown){ await serveStreetView(""); return; }
    // RACE: wait up to CAPTURE_DEADLINE_MS for the oblique render. If it lands first, serve it. If the
    // deadline wins, serve Street View NOW (never make the user wait the full render) while the oblique
    // keeps running in the BACKGROUND to populate the cache — so the NEXT load of this house is the real
    // oblique. This bounds /capture response time regardless of how slow the headless render is.
    const CAPTURE_DEADLINE_MS=Number(process.env.RQ_CAPTURE_DEADLINE_MS||10000);
    let settledByRace=false;
    const obliqueP=captureOblique(address).then(buf=>({buf})).catch(capErr=>{
      // Track failures so subsequent calls skip the slow attempt and go straight to the fast fallback.
      captureObliqueDown.set(address,Date.now()+OBLIQUE_DOWN_TTL);
      console.warn("[capture] oblique failed for "+address+" (bg):",capErr&&capErr.message||capErr);
      return {err:capErr};
    });
    // Keep the background render alive even if the deadline serves SV first (don't drop it unhandled).
    obliqueP.then(r=>{ if(r&&r.buf&&!settledByRace) console.log("[capture] oblique cached late for "+address); });
    const deadline=new Promise(r=>setTimeout(()=>r("__deadline__"),CAPTURE_DEADLINE_MS));
    const winner=await Promise.race([obliqueP,deadline]);
    if(winner!=="__deadline__" && winner && winner.buf){
      settledByRace=true;
      res.setHeader("Content-Type","image/png"); res.setHeader("Cache-Control","public, max-age=3600");
      res.setHeader("X-Capture-Source","oblique"); res.end(winner.buf); return;
    }
    // Deadline won OR oblique errored fast → serve Street View now (oblique, if still running, fills cache).
    settledByRace=true;
    await serveStreetView((winner&&winner.err)?("oblique("+(winner.err.message||winner.err)+") "):"oblique(slow>"+CAPTURE_DEADLINE_MS+"ms) ");
    return;
  }
  // ---- AI photoreal roof material re-render: Street View → Flux Kontext (Replicate) repaint, cached ----
  if(u.pathname==="/airender"){
    res.setHeader("Content-Type","application/json");
    const address=u.searchParams.get("address")||"", material=u.searchParams.get("material")||"new architectural asphalt shingles";
    if(!address){ res.end('{"error":"no_address"}'); return; }
    // tier routing: "browse" = cheap Flux/Gemini for catalogue flipping; "final" = gpt-image-1 hero for the settled/quoted colour
    const tier=(u.searchParams.get("tier")==="browse")?"browse":"final";
    // "|v2" bumps the cache key so any disk entries cached BEFORE the durable-rehost fix
    // (which stored soon-to-expire provider urls → 404 → black panel) are skipped, not served.
    const ck=address+"|"+material+"|"+tier+"|v2";
    if(aiCache.has(ck)){ res.end(JSON.stringify(Object.assign({cached:true},aiCache.get(ck)))); return; }
    { const d=diskGetJSON("air",ck); if(d){ aiCache.set(ck,d); res.end(JSON.stringify(Object.assign({cached:true},d))); return; } }
    try{
      // Base "before" image. Preferred = oblique 3D aerial (needs headless Chromium); prod has none, so
      // fall back to Street View (plain URL fetch, no browser) — the documented prod path. No coverage on
      // either → graceful "capture_failed" (widget keeps its swatch-tint fallback).
      let dataUri, view="oblique";
      try{ const buf=await captureOblique(address); dataUri="data:image/png;base64,"+buf.toString("base64"); }
      catch(capErr){
        const sv=await streetViewBuf(address).catch(e=>({ok:false,status:0,error:String(e&&e.message||e)}));
        if(!sv.ok){ res.end(JSON.stringify({error:"capture_failed",detail:"no base image: capture("+String(capErr&&capErr.message||capErr)+") + streetview("+(sv.status?sv.status+" ":"")+sv.error+")"})); return; }
        dataUri="data:image/jpeg;base64,"+sv.buf.toString("base64"); view="street";
      }
      // Property Analysis Agent → House Knowledge Package (cached); injected so the render preserves roof geometry
      let pkg=""; try{ pkg=await houseKnowledge(address); }catch(_){}
      // failover chain: try each provider until one renders (resilience like our LLM fallback chain)
      const tried=[];
      const chain = tier==="browse" ? RENDER_CHAIN.filter(x=>x[0]!=="openai") : RENDER_CHAIN;   // browse skips the pricey gpt-image-1
      for(const [name,fn] of chain){
        try{
          const rawUrl=await fn(dataUri,material,pkg,view);
          // Re-host the provider's (possibly ephemeral) url to a stable self-hosted url so later/cached
          // visitors never hit an expired 404. On rehost failure, fall back to the raw url (don't fail the render).
          const stable=await rehostRenderedImage(ck,rawUrl);
          const url=stable||rawUrl;
          const r={url,provider:name,knowledge:pkg||undefined,tier}; aiCache.set(ck,r); diskSetJSON("air",ck,r); res.end(JSON.stringify(r)); return;
        }
        catch(e){ tried.push(name+":"+e.message); console.error("[render fail]",name,e.message); }
      }
      res.end(JSON.stringify({error:"all_providers_failed",tried}));
    }catch(e){ res.end(JSON.stringify({error:String(e)})); }
    return;
  }
  // ---- Stable self-hosted stream of a re-hosted AI render (audit-6 P1): durable url that never 404s ----
  if(u.pathname==="/airender-img"){
    const ck=u.searchParams.get("key")||"";
    const buf=ck?diskGetBuf("airimg",ck):null;
    if(!buf){ res.statusCode=404; res.setHeader("Content-Type","text/plain"); res.end("not_found"); return; }
    const meta=diskGetJSON("airimgct",ck)||{}; const ct=meta.ct||"image/jpeg";
    res.setHeader("Content-Type",ct); res.setHeader("Cache-Control","public, max-age=86400"); res.end(buf);
    return;
  }
  // ---- ROOF-ONLY top-down render: satellite + footprint mask → Flux Fill inpaint → composite passthrough ----
  // Returns { url, base, footprintSource, attribution } where `url`=composited PNG (non-roof == original by
  // construction) and `base`=the original satellite (the before image). Falls back gracefully when no footprint.
  if(u.pathname==="/airender-topdown"){
    res.setHeader("Content-Type","application/json");
    const address=u.searchParams.get("address")||"", material=u.searchParams.get("material")||"new architectural asphalt shingles";
    if(!address){ res.end('{"error":"no_address"}'); return; }
    const ck="td|"+address+"|"+material+"|v1";
    const cached=diskGetJSON("tdmeta",ck);
    if(cached && diskGetBuf("tdimg",ck)){ res.end(JSON.stringify(Object.assign({cached:true},cached))); return; }
    try{
      const r=await renderRoofOnlyTopDown(address,material);
      diskSetBuf("tdimg",ck,r.buf);                 // composited (after) image
      diskSetBuf("tdbase",address,r.base);          // original satellite (before) image — per-address
      const meta={ url:"/airender-topdown-img?key="+encodeURIComponent(ck),
        base:"/airender-topdown-base?address="+encodeURIComponent(address),
        footprintSource:r.footprintSource, attribution:r.attribution, whiteFrac:r.whiteFrac, roofOnly:true };
      diskSetJSON("tdmeta",ck,meta);
      res.end(JSON.stringify(meta));
    }catch(e){
      // Honest typed failure so the client can keep its swatch-tint fallback (no roof-only guarantee available here).
      console.error("[airender-topdown fail]",e&&e.message||e);
      res.end(JSON.stringify({error:String(e&&e.message||e)}));
    }
    return;
  }
  if(u.pathname==="/airender-topdown-img"){
    const ck=u.searchParams.get("key")||""; const buf=ck?diskGetBuf("tdimg",ck):null;
    if(!buf){ res.statusCode=404; res.setHeader("Content-Type","text/plain"); res.end("not_found"); return; }
    res.setHeader("Content-Type","image/png"); res.setHeader("Cache-Control","public, max-age=86400"); res.end(buf); return;
  }
  if(u.pathname==="/airender-topdown-base"){
    const address=u.searchParams.get("address")||""; const buf=address?diskGetBuf("tdbase",address):null;
    if(!buf){ res.statusCode=404; res.setHeader("Content-Type","text/plain"); res.end("not_found"); return; }
    res.setHeader("Content-Type","image/png"); res.setHeader("Cache-Control","public, max-age=86400"); res.end(buf); return;
  }
  // ---- Customer-photo upload render (ToS-clean base) ----
  // The user uploads THEIR OWN house photo → we repaint the roof material onto it. An arbitrary oblique
  // upload has no exact roof mask, so this uses the prompt-preservation Kontext chain (NOT the hard
  // top-down mask) — documented limitation; the top-down satellite path is the roof-only-guaranteed one.
  if(u.pathname==="/airender-upload" && req.method==="POST"){
    res.setHeader("Content-Type","application/json");
    let body=""; req.on("data",d=>{ body+=d; if(body.length>12_000_000){ req.destroy(); } });
    req.on("end",async()=>{
      try{
        const j=JSON.parse(body||"{}");
        const dataUri=j.image, material=j.material||"new architectural asphalt shingles";
        if(!dataUri||!dataUri.startsWith("data:image/")){ res.end('{"error":"no_image"}'); return; }
        // prompt-preservation chain (street view = oblique-style prompt); reuse RENDER_CHAIN providers.
        const tried=[];
        for(const [name,fn] of RENDER_CHAIN){
          try{ const url=await fn(dataUri,material,"","street"); res.end(JSON.stringify({url,provider:name,source:"upload"})); return; }
          catch(e){ tried.push(name+":"+e.message); console.error("[upload render fail]",name,e.message); }
        }
        res.end(JSON.stringify({error:"all_providers_failed",tried}));
      }catch(e){ console.error("[airender-upload fail]",e&&e.message||e); res.end(JSON.stringify({error:String(e&&e.message||e)})); }
    });
    return;
  }
  res.setHeader("Content-Type","text/html"); res.end(html);
}).listen(process.env.PORT||5300,()=>{
  console.log("serving "+(process.env.PORT||5300));
  // Pre-warm the headless browser off the critical path so the FIRST /capture (oblique) doesn't pay the
  // one-time SwiftShader Chromium launch (~12-15s). Skipped when no-Chromium mode is forced.
  if(process.env.RQ_FORCE_NO_CHROMIUM!=="1"){
    getBrowser().then(()=>console.log("[capture] browser pre-warmed")).catch(e=>console.warn("[capture] browser pre-warm skipped:",e&&e.message||e));
  }
  // Pre-warm VIDA off the critical path: the duckdb httpfs range-cache + spatial/httpfs extensions are
  // ~9s cold, so the FIRST real ZA/AU request would otherwise blow the budget and return 0 neighbours.
  // Fire-and-forget a tiny-bbox query per common gap country to warm the connection + range cache.
  (async()=>{
    try{
      const warm=[ {iso3:"ZAF", s:-26.1700, w:28.1300, n:-26.1690, e:28.1310},   // Bedfordview, JHB
                   {iso3:"AUS", s:-33.8690, w:151.2090, n:-33.8680, e:151.2100} ]; // Sydney
      for(const b of warm){ await vidaBuildingsBbox(b.s,b.w,b.n,b.e,b.iso3).catch(()=>{}); }
      console.log("[vida] prewarm done");
    }catch(e){ console.warn("[vida] prewarm failed:",e&&e.message||e); }
  })();
});

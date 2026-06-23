import http from "http"; import { readFileSync, appendFileSync, existsSync, writeFileSync, mkdirSync } from "fs"; import path from "path"; import { createHash } from "crypto"; import { pathToFileURL } from "url";
import { PNG } from "pngjs";   // dependency-free PNG read/write for compositing the roof inpaint mask (repo-root dep)
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
const REPLICATE=process.env.REPLICATE_KEY||"";
const GEMINI=process.env.GEMINI_KEY||"";
const FAL=process.env.FAL_KEY||"";
const OPENAI=process.env.OPENAI_KEY||"";
const aiCache=new Map();   // address|material → rendered image url (avoid paying twice for the same render)
const featuresCache=new Map();   // address → roof feature detection (chimneys/vents/skylights/dormers)

function roofPrompt(material, pkg){
  // STRONG preservation anchor — img2img models (Flux Kontext) will otherwise regenerate a whole new house for
  // dramatic materials (e.g. metal). Lead with "edit THIS photo / same house / do NOT generate a new house".
  const geom = pkg ? (" The roof is "+pkg+"; keep that exact roof geometry — ridges, planes, pitch and outline.") : "";
  return "Edit THIS exact photo. Change ONLY the roof covering of the main house in the centre to "+material+", covering the whole roof."+geom+
    " Keep the IDENTICAL same house from the input photo — same walls, siding, windows, doors, chimney, gutters, lawn, driveway, vehicles, trees, neighbouring houses, camera angle and lighting. Do NOT generate a new or different house, building or scene; preserve every other pixel exactly. Photorealistic, sharp, natural realistic roof colour."; }

// ---- image-render providers (failover chain). Each returns an <img>-loadable url (http or data:) or throws ----
async function renderOpenAI(dataUri,material,pkg){
  // GPT-4o image model (gpt-image-1) via the edits endpoint — the model ChatGPT uses; crispest + best house preservation.
  if(!OPENAI) throw new Error("no_openai_key");
  const buf=Buffer.from(dataUri.split(",")[1],"base64");
  const fd=new FormData();
  fd.append("model","gpt-image-1");
  fd.append("image", new Blob([buf],{type:"image/png"}), "house.png");
  fd.append("prompt", roofPrompt(material,pkg));
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
// ── Roof-MASKED INPAINT (the proper fix): flux-fill-pro repaints ONLY the white-masked roof pixels and keeps every
//    other pixel of the house photo bit-for-bit. Same per-house seed. mask = white(inpaint)/black(keep), aligned to image.
async function renderFluxFill(dataUri,material,pkg,maskUri){
  if(!REPLICATE) throw new Error("no_replicate_key");
  if(!maskUri) throw new Error("no_mask");
  const seed=houseSeed(dataUri);
  // Inpaint prompt: only the roof is editable, so describe the new covering. The rest is locked by the mask, not the prompt.
  const prompt="A photorealistic roof covering of "+material+" on this house, covering the entire roof surface."+(pkg?(" The roof is "+pkg+".") :"")+" Natural realistic roofing colour and texture, sharp, matching the photo's lighting and camera angle.";
  let lastErr;
  for(let attempt=0; attempt<2; attempt++){
    try{
      const rr=await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-fill-pro/predictions",{
        method:"POST", headers:{ "Authorization":"Bearer "+REPLICATE, "Content-Type":"application/json", "Prefer":"wait" },
        body:JSON.stringify({ input:{ prompt, image:dataUri, mask:maskUri, output_format:"jpg", safety_tolerance:2, seed } }) });
      let j=await rr.json(); let tries=0;
      while(j.status && !["succeeded","failed","canceled"].includes(j.status) && tries<40){
        await new Promise(s=>setTimeout(s,1500));
        const pr=await fetch(j.urls.get,{headers:{"Authorization":"Bearer "+REPLICATE}}); j=await pr.json(); tries++;
      }
      if(j.status!=="succeeded") throw new Error("fluxfill_"+(j.error||j.status||"failed"));
      const out=Array.isArray(j.output)?j.output[0]:j.output;
      if(!out) throw new Error("fluxfill_no_output");
      return out;
    }catch(e){ lastErr=e; await new Promise(s=>setTimeout(s,1800)); }
  }
  throw lastErr;
}
async function renderReplicate(dataUri,material,pkg){
  if(!REPLICATE) throw new Error("no_replicate_key");
  // Replicate (Flux Kontext) is true img2img → keeps the house identical, only the roof changes, framing matches the
  // capture. Retry transient failures so it stays the CONSISTENT provider rather than intermittently dropping to Gemini.
  const seed=houseSeed(dataUri);   // lock seed per-house so every material renders the SAME house
  let lastErr;
  for(let attempt=0; attempt<3; attempt++){
    try{
      const rr=await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions",{
        method:"POST", headers:{ "Authorization":"Bearer "+REPLICATE, "Content-Type":"application/json", "Prefer":"wait" },
        body:JSON.stringify({ input:{ prompt:roofPrompt(material,pkg), input_image:dataUri, output_format:"jpg", safety_tolerance:2, seed } }) });
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
async function renderGemini(dataUri,material,pkg){
  if(!GEMINI) throw new Error("no_gemini_key");
  const b64=dataUri.split(",")[1];
  const mime=(dataUri.slice(5).split(";")[0])||"image/jpeg";
  const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key="+GEMINI,{
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ contents:[{ parts:[ {inline_data:{mime_type:mime,data:b64}}, {text:roofPrompt(material,pkg)} ] }] }) });
  if(!r.ok) throw new Error("gemini_"+r.status);
  const j=await r.json();
  const parts=(((j.candidates||[])[0]||{}).content||{}).parts||[];
  const img=parts.find(p=>p.inline_data||p.inlineData);
  if(!img) throw new Error("gemini_no_image");
  return "data:image/jpeg;base64,"+(img.inline_data||img.inlineData).data;
}
async function renderFal(dataUri,material,pkg){
  if(!FAL) throw new Error("no_fal_key");
  const fr=await fetch("https://fal.run/fal-ai/flux-pro/kontext",{
    method:"POST", headers:{ "Authorization":"Key "+FAL, "Content-Type":"application/json" },
    body:JSON.stringify({ image_url:dataUri, prompt:roofPrompt(material,pkg), num_images:1, safety_tolerance:"5", output_format:"jpeg" }) });
  if(!fr.ok) throw new Error("fal_"+fr.status);
  const j=await fr.json();
  const url=j.images && j.images[0] && j.images[0].url;
  if(!url) throw new Error("fal_no_image");
  return url;
}
const RENDER_CHAIN=[ ["openai",renderOpenAI], ["replicate",renderReplicate], ["gemini",renderGemini], ["fal",renderFal] ];

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
  // Default fallback: resolve the repo-root playwright (no spike-local node_modules).
  const raw=process.env.PLAYWRIGHT_PATH || path.resolve(import.meta.dirname,"../../node_modules/playwright/index.js");
  let spec="playwright";
  try{ const full=raw.endsWith(".js")?raw:path.join(raw,"index.js"); if(existsSync(full)) spec=pathToFileURL(full).href; }catch(_){}
  const pw=await import(spec);
  const chromium=(pw.default||pw).chromium;
  // HEADED=1 → real GPU window (required to verify the Map3D screenshot; SwiftShader works headless on prod containers).
  const headed=process.env.HEADED==="1"||process.env.HEADED==="true";
  if(headed){ _browser=await chromium.launch({ headless:false, args:["--no-sandbox","--ignore-gpu-blocklist"] }); return _browser; }
  // TRUE headless + software WebGL (SwiftShader): renders Google 3D tiles with no GPU/display → deployable on standard server containers
  _browser=await chromium.launch({ headless:true, args:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--no-sandbox","--ignore-gpu-blocklist"] });
  return _browser;
}
const captureCache=new Map();   // address → oblique aerial PNG buffer (one headless render per house; materials reuse it)
// compass bearing from point A → point B (degrees, 0=N) — used to face the house FROM the street
function bearing(lat1,lng1,lat2,lng2){
  const r=Math.PI/180, y=Math.sin((lng2-lng1)*r)*Math.cos(lat2*r);
  const x=Math.cos(lat1*r)*Math.sin(lat2*r)-Math.sin(lat1*r)*Math.cos(lat2*r)*Math.cos((lng2-lng1)*r);
  return (Math.atan2(y,x)/r+360)%360;
}
// Build a roof-only inpaint mask (white=roof to repaint, black=keep) from two screenshots at the SAME camera:
//   base = the house photo (no overlays); polyPng = same frame + WHITE facet polygons (Map3D renders them as closed
//   white OUTLINES, not solid fill). So we: (1) extract the white outline (pixels that turned white only in polyPng),
//   (2) dilate it a couple px to seal any AA gaps, (3) flood-fill the BACKGROUND inward from the image border over
//   non-outline pixels, (4) anything the flood never reaches = roof INTERIOR → white. Then dilate+feather the edge so
//   flux-fill blends the new roof. This gives a SOLID roof mask without depending on Map3D polygon fill.
function compositeRoofMask(basePng, polyPng){
  const a=PNG.sync.read(basePng), b=PNG.sync.read(polyPng);
  const w=Math.min(a.width,b.width), h=Math.min(a.height,b.height);
  const line=new Uint8Array(w*h); let lineCount=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const ia=(y*a.width+x)*4, ib=(y*b.width+x)*4;
    const polyWhite = b.data[ib]>222&&b.data[ib+1]>222&&b.data[ib+2]>222;
    const baseWhite = a.data[ia]>222&&a.data[ia+1]>222&&a.data[ia+2]>222;
    if(polyWhite && !baseWhite){ line[y*w+x]=1; lineCount++; }
  }
  // seal small gaps in the traced outline so the flood can't leak through them
  const SEAL=2; const wall=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){ if(!line[y*w+x]) continue;
    for(let dy=-SEAL;dy<=SEAL;dy++)for(let dx=-SEAL;dx<=SEAL;dx++){ const ny=y+dy,nx=x+dx; if(ny>=0&&nx>=0&&ny<h&&nx<w) wall[ny*w+nx]=1; } }
  // flood-fill the exterior (background) from all border pixels, blocked by the sealed outline
  const bg=new Uint8Array(w*h); const stack=[];
  for(let x=0;x<w;x++){ stack.push(x); stack.push((h-1)*w+x); }
  for(let y=0;y<h;y++){ stack.push(y*w); stack.push(y*w+(w-1)); }
  while(stack.length){ const i=stack.pop(); if(bg[i]||wall[i]) continue; bg[i]=1;
    const x=i%w, y=(i-x)/w;
    if(x>0)stack.push(i-1); if(x<w-1)stack.push(i+1); if(y>0)stack.push(i-w); if(y<h-1)stack.push(i+w); }
  // roof = everything NOT background (interior of the loops) plus the outline itself
  const bin=new Uint8Array(w*h); let count=0;
  for(let i=0;i<w*h;i++){ if(!bg[i]){ bin[i]=1; count++; } }
  // dilate a few px (covers AA edge), then a light box-blur feather so flux-fill blends the new roof.
  const R=3; const dil=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){ if(!bin[y*w+x]) continue;
    for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){ const ny=y+dy,nx=x+dx; if(ny>=0&&nx>=0&&ny<h&&nx<w) dil[ny*w+nx]=1; } }
  const out=new PNG({width:w,height:h}); const F=3; // feather radius
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let s=0,n=0; for(let dy=-F;dy<=F;dy++)for(let dx=-F;dx<=F;dx++){ const ny=y+dy,nx=x+dx; if(ny>=0&&nx>=0&&ny<h&&nx<w){ s+=dil[ny*w+nx]; n++; } }
    const v=Math.round(255*s/n); const i=(y*w+x)*4; out.data[i]=v; out.data[i+1]=v; out.data[i+2]=v; out.data[i+3]=255;
  }
  return { mask: PNG.sync.write(out), coverage: count, outline: lineCount };
}
// captureOblique(address, {withMask}) → Buffer (photo) by default; {photo,mask} when withMask.
// The mask is rendered at the IDENTICAL camera as the photo (second screenshot in the same page session),
// so it lines up pixel-for-pixel with the captured house — the whole point of mask-aligned inpaint.
async function captureOblique(address, opts){
  const withMask=!!(opts&&opts.withMask);
  if(!withMask && captureCache.has(address)) return captureCache.get(address);
  if(!withMask){ const d=diskGetBuf("cap",address); if(d){ captureCache.set(address,d); return d; } }
  const browser=await getBrowser();
  const ctx=await browser.newContext({ viewport:{width:1080,height:840} });
  const page=await ctx.newPage();
  try{
    const port=process.env.PORT||5300;
    await page.goto("http://localhost:"+port+"/roof3d?noauto=1",{ waitUntil:"domcontentloaded" });   // noauto → no default-address race
    await page.fill("#addr",address); await page.click("#go");
    for(let i=0;i<60;i++){ if(await page.evaluate(()=>window.__roofReady===true)) break; await sleep(1000); }
    await sleep(3500);
    await page.click("#bPanels").catch(()=>{});          // solar panels OFF → clean roof
    await sleep(700);
    // face the house FROM the street (curb-appeal angle): bearing street-pano → house. Falls back to 180.
    const site=await page.evaluate(()=>window.__site());
    let heading=180;
    try{
      const m=await fetch("https://maps.googleapis.com/maps/api/streetview/metadata?location="+encodeURIComponent(address)+"&key="+SOLAR);
      const mj=await m.json();
      if(mj.status==="OK" && mj.location && site) heading=bearing(mj.location.lat,mj.location.lng,site.lat,site.lng);
    }catch(_){}
    // set the camera DIRECTLY (animated flyCameraTo doesn't reliably apply under headless SwiftShader) + fly as backup
    await page.evaluate((h)=>{ try{ const s=window.__site(); const g=window.gmap;
      g.center={lat:s.lat,lng:s.lng,altitude:s.alt}; g.range=64; g.tilt=54; g.heading=h;   // zoomed OUT a bit (was 44) → more context, low-res Google imagery less obvious
      if(g.flyCameraTo) g.flyCameraTo({endCamera:{center:{lat:s.lat,lng:s.lng,altitude:s.alt},range:64,tilt:54,heading:h},durationMillis:300});
    }catch(e){} }, heading);
    await sleep(9000);                                    // SwiftShader streams the closer tiles slowly — give it time
    await page.addStyleTag({ content:"#card,#ctrls,#bar,#status,#matbar,#sunbar,#matHint,#load,#aiBtn,#aiBar,#report{display:none!important}" });
    await sleep(700);
    const buf=await page.screenshot({ type:"png" });     // base house photo (no overlays)
    if(!withMask){ captureCache.set(address,buf); diskSetBuf("cap",address,buf); return buf; }
    // ── mask pass: same camera, render white facet polys, screenshot, threshold vs base ──
    let mask=null;
    try{
      const n=await page.evaluate(()=>window.__roofMask&&window.__roofMask(true));
      if(typeof n==="number" && n>0){
        await sleep(1200);                                // let the polys paint
        const polyBuf=await page.screenshot({ type:"png" });
        const r=compositeRoofMask(buf,polyBuf);
        if(r.coverage>400) mask="data:image/png;base64,"+r.mask.toString("base64"); // need a real roof region
      }
      await page.evaluate(()=>window.__roofMask&&window.__roofMask(false)).catch(()=>{});
    }catch(_){ /* mask is best-effort → caller falls back to img2img */ }
    // cache the base photo (mask is request-scoped, not cached on disk — cheap to regenerate)
    captureCache.set(address,buf); diskSetBuf("cap",address,buf);
    return { photo:buf, mask };
  } finally { await ctx.close(); }
}
const html=readFileSync(path.join(import.meta.dirname,"index.html"),"utf8").replaceAll("__TILES__",TILES);
const map3dHtml=readFileSync(path.join(import.meta.dirname,"map3d.html"),"utf8").replaceAll("__TILES__",TILES);
let roof3dHtml=""; try{ roof3dHtml=readFileSync(path.join(import.meta.dirname,"roof3d.html"),"utf8").replaceAll("__TILES__",TILES); }catch(_){}
http.createServer(async (req,res)=>{
  const u=new URL(req.url,"http://x");
  res.setHeader("Cache-Control","no-store, must-revalidate");  // HTML must never cache (geotiff route overrides below)
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
  if(u.pathname==="/geocode"){
    const addr=u.searchParams.get("address")||"";
    res.setHeader("Content-Type","application/json");
    try{
      const r=await fetch("https://maps.googleapis.com/maps/api/geocode/json?address="+encodeURIComponent(addr)+"&key="+SOLAR);
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
    res.setHeader("Content-Type","application/json");
    // Same quota-protection scheme as /solar: disk-cache successful responses by rounded lat/lng, 30d TTL.
    const gk=(+lat).toFixed(5)+","+(+lng).toFixed(5);
    { const c=diskGetJSON("datalayers",gk); if(c&&c.body&&c._t&&(Date.now()-c._t)<30*864e5){ res.setHeader("X-Cache","HIT"); res.end(c.body); return; } }
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
    try{ const buf=await captureOblique(address); res.setHeader("Content-Type","image/png"); res.setHeader("Cache-Control","public, max-age=3600"); res.end(buf); }
    catch(e){ res.statusCode=502; res.setHeader("Content-Type","text/plain"); res.end("capture_failed: "+(e&&e.message||e)); }
    return;
  }
  // ---- AI photoreal roof material re-render: Street View → Flux Kontext (Replicate) repaint, cached ----
  if(u.pathname==="/airender"){
    res.setHeader("Content-Type","application/json");
    const address=u.searchParams.get("address")||"", material=u.searchParams.get("material")||"new architectural asphalt shingles";
    if(!address){ res.end('{"error":"no_address"}'); return; }
    // tier routing: "browse" = cheap Flux/Gemini for catalogue flipping; "final" = gpt-image-1 hero for the settled/quoted colour
    const tier=(u.searchParams.get("tier")==="browse")?"browse":"final";
    const ck=address+"|"+material+"|"+tier;
    if(aiCache.has(ck)){ res.end(JSON.stringify(Object.assign({cached:true},aiCache.get(ck)))); return; }
    { const d=diskGetJSON("air",ck); if(d){ aiCache.set(ck,d); res.end(JSON.stringify(Object.assign({cached:true},d))); return; } }
    try{
      // Image Collector → oblique aerial of the house + roof MASK (same camera). One headless render; materials reuse the photo.
      let dataUri, maskUri=null;
      try{ const cap=await captureOblique(address,{withMask:true});
        const buf=cap&&cap.photo?cap.photo:cap; dataUri="data:image/png;base64,"+buf.toString("base64"); maskUri=cap&&cap.mask||null; }
      catch(capErr){ res.end(JSON.stringify({error:"capture_failed",detail:String(capErr&&capErr.message||capErr)})); return; }
      // Property Analysis Agent → House Knowledge Package (cached); injected so the render preserves roof geometry
      let pkg=""; try{ pkg=await houseKnowledge(address); }catch(_){}
      const tried=[];
      // PROPER FIX: roof-MASKED INPAINT first — flux-fill-pro repaints ONLY the roof pixels, every other pixel of the
      // house stays bit-for-bit identical across materials. Only attempt when we produced a valid aligned mask.
      if(maskUri){
        try{ const url=await renderFluxFill(dataUri,material,pkg,maskUri);
          const r={url,provider:"flux-fill-inpaint",knowledge:pkg||undefined,tier,masked:true}; aiCache.set(ck,r); diskSetJSON("air",ck,r); res.end(JSON.stringify(r)); return; }
        catch(e){ tried.push("flux-fill-inpaint:"+e.message); console.error("[render fail]","flux-fill-inpaint",e.message); }
      } else { tried.push("flux-fill-inpaint:no_mask"); }
      // FALLBACK: existing seed-locked img2img chain (keeps the working render; instant client-side tint is the always-on backstop)
      const chain = tier==="browse" ? RENDER_CHAIN.filter(x=>x[0]!=="openai") : RENDER_CHAIN;   // browse skips the pricey gpt-image-1
      for(const [name,fn] of chain){
        try{ const url=await fn(dataUri,material,pkg); const r={url,provider:name,knowledge:pkg||undefined,tier,masked:false}; aiCache.set(ck,r); diskSetJSON("air",ck,r); res.end(JSON.stringify(r)); return; }
        catch(e){ tried.push(name+":"+e.message); console.error("[render fail]",name,e.message); }
      }
      res.end(JSON.stringify({error:"all_providers_failed",tried}));
    }catch(e){ res.end(JSON.stringify({error:String(e)})); }
    return;
  }
  res.setHeader("Content-Type","text/html"); res.end(html);
}).listen(process.env.PORT||5300,()=>console.log("serving "+(process.env.PORT||5300)));

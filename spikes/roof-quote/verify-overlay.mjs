// verify-overlay.mjs — FIXED-FRAME registration diagnostic. The production Measure diagram
// auto-frames on the footprint, so a rigid shift is invisible there. This draws the RGB aerial
// at a FIXED UTM window (mask bbox) and overlays, in absolute UTM: the MASK (cyan), the
// UNREGISTERED regularized footprint (red), and the REGISTERED footprint (lime). That makes the
// translation/rotation correction directly visible against the real roof imagery.
import { chromium } from "playwright";

const OUT = "C:/Users/Owner/claude-orchestrator/audits/align";
const PORT = process.env.PORT || 5318;
const ADDRS = [
  ["30 Angus Rd, Hamilton ON", "angus"],
  ["4521 T St, Sacramento CA", "sac"],
  ["12 Maple Ave, Barrington RI", "maple"],
];
const browser = await chromium.launch({ headless: false,
  args: ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-accelerated-2d-canvas"] });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

async function geocodeAndBuild(addr) {
  await page.goto(`http://localhost:${PORT}/roof3d`, { waitUntil: "domcontentloaded", timeout: 60000 });
  for (let i = 0; i < 30; i++) { if (await page.evaluate(() => !!window.__acReady)) break; await page.waitForTimeout(300); }
  const hero = page.locator("#addrHero");
  const input = (await hero.isVisible().catch(()=>false)) ? hero : page.locator("#addr");
  await input.click(); await input.fill(""); await input.pressSequentially(addr, { delay: 55 });
  await page.waitForTimeout(2000);
  const pick = await page.evaluate(() => {
    const box = [...document.querySelectorAll("body > div")].find(d => d.style.zIndex === "60" && d.style.display !== "none" && d.children.length);
    if (box && box.children[0]) { const r = box.children[0].getBoundingClientRect(); return { x: r.left+r.width/2, y: r.top+r.height/2 }; }
    return null;
  });
  if (pick) { await page.mouse.move(pick.x, pick.y); await page.mouse.down(); await page.mouse.up(); }
  for (let i = 0; i < 90; i++) { if (await page.evaluate(() => !!window.__roofReady)) break; await page.waitForTimeout(1000); }
  await page.waitForTimeout(13000);
}

for (const [addr, tag] of ADDRS) {
  console.log(`\n=== ${addr} ===`);
  try {
    await geocodeAndBuild(addr);
    const res = await page.evaluate(() => {
      const R = {};
      try {
        if (!window.LASTMASK || !window.LASTRGB) return { err: "no mask/rgb" };
        const zone = (window.LASTFLUX || window.LASTDSM || window.LASTMASK).zone;
        // unregistered regularized footprint (overhang 0) + registered, from the exposed helpers
        const ringEN = (window.__footprintWGS || []).map(([lng,lat]) => window.__wgs84ToUTM(lat,lng,zone));
        const reg0 = (ringEN.length>=4 && window.__regularizeVectorFootprint) ? window.__regularizeVectorFootprint(ringEN, 0.0) : null;
        const rr = (reg0 && window.__registerFootprintToGoogle) ? window.__registerFootprintToGoogle(reg0, zone) : null;
        R.diag = rr && rr.diag;
        R.footprintSourceUsed = window.__footprintSourceUsed || window.__footprintSource;
        // the ACTUAL footprint the build consumed (registered+overhang, OR mask-trace when vector rejected)
        const finalEN = Array.isArray(window.__footprintEN) ? window.__footprintEN : null;
        const rgb = window.LASTRGB, mk = window.LASTMASK, vals = mk.rasters[0], w = mk.width, h = mk.height, bb = mk.bbox;
        // ── ZOOM the frame to the building: union bbox of (reg0, final, ref) + 12 m pad ──
        let minE=1e15,maxE=-1e15,minN=1e15,maxN=-1e15;
        const grow=(ring)=>{ if(!ring) return; for(const[E,N]of ring){ minE=Math.min(minE,E);maxE=Math.max(maxE,E);minN=Math.min(minN,N);maxN=Math.max(maxN,N); } };
        grow(reg0); grow(rr&&rr.ring); grow(finalEN);
        const ref = window.__geoVerify && window.__geoVerify.googleRoofReference(zone);
        if (ref){ minE=Math.min(minE,ref.c[0]);maxE=Math.max(maxE,ref.c[0]);minN=Math.min(minN,ref.c[1]);maxN=Math.max(maxN,ref.c[1]); }
        if(!(maxE>minE)){ minE=bb[0];maxE=bb[2];minN=bb[1];maxN=bb[3]; }
        const PAD=12; minE-=PAD;maxE+=PAD;minN-=PAD;maxN+=PAD;
        const spanE=maxE-minE, spanN=maxN-minN, span=Math.max(spanE,spanN);
        const cE=(minE+maxE)/2, cN=(minN+maxN)/2; minE=cE-span/2;maxE=cE+span/2;minN=cN-span/2;maxN=cN+span/2;
        const W=700,H=700;
        const cv = document.createElement("canvas"); cv.width=W; cv.height=H;
        cv.style.cssText="position:fixed;inset:0;z-index:9999;background:#000;width:700px;height:700px";
        document.body.appendChild(cv);
        const g=cv.getContext("2d");
        const rb=rgb.bbox, RW=rgb.width, RH=rgb.height, Rr=rgb.rasters[0], Rg=rgb.rasters[1]||Rr, Rb=rgb.rasters[2]||Rr;
        const img=g.createImageData(W,H);
        for(let py=0;py<H;py++)for(let px=0;px<W;px++){
          const E=minE+(px/(W-1))*span, N=maxN-(py/(H-1))*span;
          const fx=(E-rb[0])/(rb[2]-rb[0])*(RW-1), fy=(rb[3]-N)/(rb[3]-rb[1])*(RH-1);
          let r=18,gg=22,b=30;
          if(fx>=0&&fy>=0&&fx<=RW-1&&fy<=RH-1){ const ix=(Math.round(fy)*RW+Math.round(fx)); r=Rr[ix];gg=Rg[ix];b=Rb[ix]; }
          const o=(py*W+px)*4; img.data[o]=r;img.data[o+1]=gg;img.data[o+2]=b;img.data[o+3]=255;
        }
        g.putImageData(img,0,0);
        const toPx=(E,N)=>[ (E-minE)/span*(W-1), (maxN-N)/span*(H-1) ];
        // mask pixels (faint cyan) for context
        const dE=(bb[2]-bb[0])/(w-1||1), dN=(bb[3]-bb[1])/(h-1||1);
        g.fillStyle="rgba(0,229,255,0.14)";
        for(let r=0;r<h;r++)for(let c=0;c<w;c++) if(vals[r*w+c]>0.5){ const E=bb[0]+c*dE,N=bb[3]-r*dN; if(E<minE||E>maxE||N<minN||N>maxN) continue; const [x,y]=toPx(E,N); g.fillRect(x-1.5,y-1.5,3,3); }
        const drawRing=(ring,color,lw,dash)=>{ if(!ring||ring.length<3) return; g.setLineDash(dash||[]); g.strokeStyle=color; g.lineWidth=lw; g.beginPath();
          ring.forEach(([E,N],i)=>{ const [x,y]=toPx(E,N); i?g.lineTo(x,y):g.moveTo(x,y); }); g.closePath(); g.stroke(); g.setLineDash([]); };
        drawRing(reg0, "#ff3b30", 2, [6,4]);          // unregistered (red dashed)
        drawRing(rr&&rr.ring, "#39ff14", 3);          // registered (lime solid)
        drawRing(finalEN, "#ffd400", 2, [2,3]);       // FINAL consumed footprint (yellow dotted)
        if(ref){ const [x,y]=toPx(ref.c[0],ref.c[1]); g.fillStyle="#ff00ff"; g.beginPath(); g.arc(x,y,5,0,7); g.fill(); }   // ref centroid (magenta)
        g.font="13px sans-serif"; g.fillStyle="rgba(0,0,0,.78)"; g.fillRect(8,8,272,90);
        g.fillStyle="#00e5ff"; g.fillText("■ Google roof mask", 14, 24);
        g.fillStyle="#ff3b30"; g.fillText("-- vector footprint (unregistered)", 14, 40);
        g.fillStyle="#39ff14"; g.fillText("— registered footprint", 14, 56);
        g.fillStyle="#ffd400"; g.fillText("·· FINAL consumed outline", 14, 72);
        g.fillStyle="#ff00ff"; g.fillText("• Google ref centroid", 14, 88);
        R.ok=true;
      } catch (e) { R.err = String(e&&e.message||e); }
      return R;
    });
    console.log("  diag:", JSON.stringify(res.diag), res.err ? ("ERR:"+res.err) : "");
    if (res.ok) { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/overlay-${tag}.png`, clip: { x:0,y:0,width:700,height:700 } }); console.log("  saved overlay-"+tag+".png"); }
  } catch (e) { console.log("  ERROR:", e.message); }
}
await browser.close();
console.log("\nDONE");

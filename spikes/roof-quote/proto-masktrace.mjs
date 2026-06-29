// PROTOTYPE: trace the Google Solar roof MASK into a polygon at Select-Roof time and overlay it on the
// satellite, next to the current coarse footprint. Measures end-to-end latency and screenshots how the
// traced outline actually looks (the honest feasibility test for TASK 2). No permanent code change.
import { chromium } from "playwright";
import { mkdirSync } from "fs";
const PORT = process.env.PORT || 5434;
const OUT  = "C:/Users/Owner/claude-orchestrator/audits/google-render";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ADDRS = [["hamilton","30 Angus Rd, Hamilton, ON"],["denver","1842 Glencoe St, Denver, CO"]];
const gpuArgs = ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-accelerated-2d-canvas"];

const browser = await chromium.launch({ headless:false, args:gpuArgs });
const page = await browser.newPage({ viewport:{ width:1280, height:900 } });
const summary = {};

for (const [key,addr] of ADDRS){
  console.log(`\n=== ${key} ===`);
  await page.goto(`http://localhost:${PORT}/roof3d`, { waitUntil:"domcontentloaded" });
  await sleep(800);
  const input = page.locator("#addrHero"); await input.click(); await input.fill("");
  await input.pressSequentially(addr,{delay:55}); await sleep(2100);
  const items = page.locator(".pac-item");
  if (await items.count()>0) await items.first().click(); else await input.press("Enter");
  await sleep(1400);
  // We are now on the Select-Roof step (the srMap is shown BEFORE Continue). Wait for the map + footprint.
  await page.waitForFunction(()=>window.__srMap && window.__srBuildings && window.__srBuildings.length>0, { timeout:30000 }).catch(()=>console.log("srMap/buildings not ready"));
  await sleep(1500);
  await page.screenshot({ path:`${OUT}/outline-${key}-coarsebox.png` });

  // === Inject the mask trace overlay + time it ===
  const geo = await page.evaluate(()=> window.__srGeo ? {lat:window.__srGeo.lat, lng:window.__srGeo.lng} : null);
  if (!geo) { console.log("no __srGeo; skipping"); summary[key]={error:"no geo"}; continue; }
  const result = await page.evaluate(async ({lat,lng}) => {
    // inline UTM<->WGS84 (the page's are module-scoped, not on window)
    function wgs84ToUTM(lat,lon,zone){ const a=6378137,f=1/298.257223563,k0=0.9996,e2=f*(2-f),ep2=e2/(1-e2);
      const lon0=(zone-1)*6-180+3; const latR=lat*Math.PI/180,lonR=lon*Math.PI/180,lon0R=lon0*Math.PI/180;
      const N=a/Math.sqrt(1-e2*Math.sin(latR)**2),T=Math.tan(latR)**2,C=ep2*Math.cos(latR)**2,A=Math.cos(latR)*(lonR-lon0R);
      const M=a*((1-e2/4-3*e2*e2/64-5*e2**3/256)*latR-(3*e2/8+3*e2*e2/32+45*e2**3/1024)*Math.sin(2*latR)+(15*e2*e2/256+45*e2**3/1024)*Math.sin(4*latR)-(35*e2**3/3072)*Math.sin(6*latR));
      const E=k0*N*(A+(1-T+C)*A**3/6+(5-18*T+T*T+72*C-58*ep2)*A**5/120)+500000;
      let Nn=k0*(M+N*Math.tan(latR)*(A*A/2+(5-T+9*C+4*C*C)*A**4/24+(61-58*T+T*T+600*C-330*ep2)*A**6/720)); if(lat<0)Nn+=10000000; return [E,Nn]; }
    function utmToLL(E,N,zone){ const a=6378137,f=1/298.257223563,k0=0.9996,e2=f*(2-f),ep2=e2/(1-e2);
      const e1=(1-Math.sqrt(1-e2))/(1+Math.sqrt(1-e2)); const x=E-500000,y=N,M=y/k0,mu=M/(a*(1-e2/4-3*e2*e2/64-5*e2**3/256));
      const phi1=mu+(3*e1/2-27*e1**3/32)*Math.sin(2*mu)+(21*e1*e1/16-55*e1**4/32)*Math.sin(4*mu)+(151*e1**3/96)*Math.sin(6*mu)+(1097*e1**4/512)*Math.sin(8*mu);
      const C1=ep2*Math.cos(phi1)**2,T1=Math.tan(phi1)**2,N1=a/Math.sqrt(1-e2*Math.sin(phi1)**2),R1=a*(1-e2)/Math.pow(1-e2*Math.sin(phi1)**2,1.5),D=x/(N1*k0);
      const lat=phi1-(N1*Math.tan(phi1)/R1)*(D*D/2-(5+3*T1+10*C1-4*C1*C1-9*ep2)*D**4/24+(61+90*T1+298*C1+45*T1*T1-252*ep2-3*C1*C1)*D**6/720);
      const lon0=(zone-1)*6-180+3; const lon=lon0*Math.PI/180+(D-(1+2*T1+C1)*D**3/6+(5-2*C1+28*T1-3*C1*C1+8*ep2+24*T1*T1)*D**5/120)/Math.cos(phi1);
      return [lon*180/Math.PI, lat*180/Math.PI]; }
    const t0 = performance.now();
    // 1) fetch datalayers + mask geotiff via the SAME endpoints the widget already uses
    const dlR = await fetch(`/datalayers?lat=${lat}&lng=${lng}`); const dl = await dlR.json();
    const tDL = performance.now();
    if (!dl.maskUrl) return { error:"no maskUrl", keys:Object.keys(dl) };
    const ab = await (await fetch(`/geotiff?u=${encodeURIComponent(dl.maskUrl)}`)).arrayBuffer();
    const tFetch = performance.now();
    const tiff = await GeoTIFF.fromArrayBuffer(ab);
    const img = await tiff.getImage();
    const rasters = await img.readRasters();
    const W = img.getWidth(), H = img.getHeight();
    const bbox = img.getBoundingBox();   // [minX,minY,maxX,maxY] UTM
    let zone=17, north=true;
    try{ const gk=img.getGeoKeys(); const p=gk.ProjectedCSTypeGeoKey; if(p){ north=p<32700; zone=p-(north?32600:32700);} }catch(_){}
    const m = rasters[0];
    const tDecode = performance.now();

    // 2) pick the connected mask component nearest the geocode centre (the queried house)
    const [E0,N0,E1,N1]=bbox;
    let cx=Math.floor(W/2), cy=Math.floor(H/2);
    try{ const [cE,cN]=wgs84ToUTM(lat,lng,zone); cx=Math.round((cE-E0)/(E1-E0)*(W-1)); cy=Math.round((N1-cN)/(N1-N0)*(H-1)); }catch(_){}
    const bin=new Uint8Array(W*H); for(let i=0;i<m.length;i++) bin[i]=(m[i]>0.5)?1:0;
    // flood fill from nearest set pixel to centre
    const idx=(x,y)=>y*W+x; const comp=new Uint8Array(W*H);
    // find seed: spiral out from (cx,cy)
    let seed=-1; for(let r=0;r<Math.max(W,H)&&seed<0;r++){ for(let dy=-r;dy<=r&&seed<0;dy++)for(let dx=-r;dx<=r&&seed<0;dx++){ const x=cx+dx,y=cy+dy; if(x<0||y<0||x>=W||y>=H)continue; if(bin[idx(x,y)]) seed=idx(x,y); } }
    if(seed<0) return { error:"empty mask" };
    const stack=[seed]; comp[seed]=1; let area=0;
    while(stack.length){ const p=stack.pop(); area++; const x=p%W,y=(p-x)/W;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx,ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H)continue; const q=idx(nx,ny); if(bin[q]&&!comp[q]){ comp[q]=1; stack.push(q); } } }

    // 3) marching-squares boundary trace of `comp` (largest single closed contour)
    // Use a simple boundary-following (Moore neighbourhood) on the component.
    function traceBoundary(C,W,H){
      // find topmost-leftmost set pixel
      let sx=-1,sy=-1; for(let y=0;y<H&&sy<0;y++)for(let x=0;x<W;x++){ if(C[y*W+x]){ sx=x;sy=y;break; } }
      if(sx<0) return [];
      const dirs=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
      const pts=[]; let cx=sx,cy=sy,b=4; let guard=0;
      do{
        pts.push([cx,cy]);
        let found=false;
        for(let k=0;k<8;k++){ const d=(b+1+k)%8; const nx=cx+dirs[d][0], ny=cy+dirs[d][1];
          if(nx>=0&&ny>=0&&nx<W&&ny<H&&C[ny*W+nx]){ b=(d+4)%8; cx=nx; cy=ny; found=true; break; } }
        if(!found) break;
        guard++;
      } while((cx!==sx||cy!==sy) && guard<W*H*2);
      return pts;
    }
    let ring = traceBoundary(comp,W,H);
    // 4) Douglas-Peucker simplify (in pixel space, epsilon ~ 1.5 px = 0.15m)
    function rdp(points,eps){ if(points.length<3) return points;
      const dmaxFn=(a,b,p)=>{ const [x1,y1]=a,[x2,y2]=b,[x0,y0]=p; const dx=x2-x1,dy=y2-y1; const L=Math.hypot(dx,dy)||1; return Math.abs(dy*x0-dx*y0+x2*y1-y2*x1)/L; };
      let idxMax=0,dmax=0; for(let i=1;i<points.length-1;i++){ const d=dmaxFn(points[0],points[points.length-1],points[i]); if(d>dmax){dmax=d;idxMax=i;} }
      if(dmax>eps){ const l=rdp(points.slice(0,idxMax+1),eps), r=rdp(points.slice(idxMax),eps); return l.slice(0,-1).concat(r); }
      return [points[0],points[points.length-1]]; }
    const ringSimp = rdp(ring, 2.0);
    const tTrace = performance.now();

    // 5) pixel ring → UTM → lat/lng using utmToLL
    const px2utm=(x,y)=>[ E0 + (x/(W-1))*(E1-E0), N1 - (y/(H-1))*(N1-N0) ];
    const ll = ringSimp.map(([x,y])=>{ const [E,N]=px2utm(x,y); const [lo,la]=utmToLL(E,N,zone); return {lat:la,lng:lo}; });

    // 6) draw it on the srMap as a bright green outline ON TOP of the coarse box
    if(window.__srMap && ll.length>2){
      window.__protoPoly = new google.maps.Polygon({ paths:ll, map:window.__srMap,
        strokeColor:"#00FF66", strokeWeight:3, strokeOpacity:1, fillColor:"#00FF66", fillOpacity:0.12, clickable:false, zIndex:9999 });
    }
    return { ms:{ datalayers:Math.round(tDL-t0), maskFetch:Math.round(tFetch-tDL), decode:Math.round(tDecode-tFetch), trace:Math.round(tTrace-tDecode), total:Math.round(tTrace-t0) },
             maskDims:[W,H], compAreaPx:area, rawRingPts:ring.length, simpRingPts:ringSimp.length, llPts:ll.length };
  }, geo);

  console.log(JSON.stringify(result));
  summary[key] = result;
  await sleep(800);
  await page.screenshot({ path:`${OUT}/outline-${key}-masktrace.png` });
}

await browser.close();
console.log("\n=== SUMMARY ===\n"+JSON.stringify(summary,null,2));

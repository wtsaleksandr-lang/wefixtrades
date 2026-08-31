// Probe actual annualFlux raster value distribution for both addresses to confirm units vs Google's 1800 max.
import { chromium } from "playwright";
const PORT = process.env.PORT || 5434;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ADDRS = [["sacramento","4521 T St, Sacramento, CA"],["denver","1842 Glencoe St, Denver, CO"]];
const gpuArgs = ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11"];
const browser = await chromium.launch({ headless:false, args:gpuArgs });
const page = await browser.newPage({ viewport:{ width:1280, height:900 } });
for (const [key,addr] of ADDRS){
  await page.goto(`http://localhost:${PORT}/roof3d`, { waitUntil:"domcontentloaded" });
  await sleep(800);
  const input = page.locator("#addrHero"); await input.click(); await input.fill("");
  await input.pressSequentially(addr,{delay:55}); await sleep(2100);
  const items = page.locator(".pac-item");
  if (await items.count()>0) await items.first().click(); else await input.press("Enter");
  await sleep(1300);
  try { await page.locator("#srContinue").click({ timeout:7000 }); } catch(_){}
  const t0=Date.now(); let ready=false;
  while(Date.now()-t0<85000){ ready=await page.evaluate(()=>!!window.__roofReady).catch(()=>false); if(ready)break; await sleep(700); }
  await sleep(12000);
  const stats = await page.evaluate(()=>{
    const f=window.LASTFLUX; if(!f||!f.rasters) return null;
    const a=f.rasters[0]; const v=[]; for(let i=0;i<a.length;i++){ const x=a[i]; if(x>0&&isFinite(x)) v.push(x); }
    v.sort((p,q)=>p-q);
    const q=(t)=>v[Math.floor(v.length*t)]||0;
    return { n:v.length, min:v[0], p05:q(.05), p50:q(.5), p95:q(.95), max:v[v.length-1] };
  });
  console.log(key, JSON.stringify(stats));
}
await browser.close();

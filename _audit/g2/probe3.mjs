import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto('http://localhost:5099/templates/gutter_cleaning', { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForSelector('[class*="qq-widget"]', { timeout: 20000 });
await page.waitForTimeout(2500);
// Find the big interactive panel: search for text "Get Your" / "Quote in 60"
const info = await page.evaluate(() => {
  // largest advcalc root by area
  const roots = [...document.querySelectorAll('[class^="advcalc-"]')].filter(el=>{
    const c=(el.className||'').toString();
    return /^advcalc-[a-z0-9]+$/.test(c.trim()); // root only, single class no suffix
  });
  const sized = roots.map(el=>{ const r=el.getBoundingClientRect(); return {cls:(el.className||'').toString(), w:Math.round(r.width), h:Math.round(r.height), y:Math.round(r.y+scrollY), area:Math.round(r.width*r.height)};});
  sized.sort((a,b)=>b.area-a.area);
  // also find element containing the headline
  let headline=null;
  for(const el of document.querySelectorAll('*')){
    if(el.children.length===0 && /Quote in 60 Seconds/i.test(el.textContent||'')){
      let p=el; for(let i=0;i<8;i++){ const c=(p.className||'').toString(); if(/advcalc-[a-z0-9]+$/.test(c.trim())||/qq-widget/.test(c)){ headline={foundRoot:c, depth:i}; break;} p=p.parentElement; if(!p)break;}
      break;
    }
  }
  return { topRoots: sized.slice(0,6), headline };
});
console.log(JSON.stringify(info,null,1));
await browser.close();

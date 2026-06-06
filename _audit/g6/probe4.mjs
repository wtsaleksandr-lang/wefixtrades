import { chromium } from 'playwright';
const BASE='http://localhost:5099';
const TEMPLATES=['tree_service','pressure_washing_quote','mobile_car_detail','locksmith_service','water_damage_restoration'];
const browser=await chromium.launch();
for(const tpl of TEMPLATES){
  const ctx=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await ctx.newPage();
  await page.goto(`${BASE}/templates/${tpl}`,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(2500);
  const info=await page.evaluate(()=>{
    const res=[];
    document.querySelectorAll('[class*="qq-widget"],[class*="advcalc"],[class*="tpl-thumb"]').forEach(el=>{
      const r=el.getBoundingClientRect();
      const cs=getComputedStyle(el);
      res.push({cls:(el.className||'').toString().slice(0,50), w:Math.round(r.width), h:Math.round(r.height), y:Math.round(r.y+window.scrollY), transform:cs.transform.slice(0,40)});
    });
    return res;
  });
  console.log('=== '+tpl+' ===');
  console.log(JSON.stringify(info,null,1));
  await ctx.close();
}
await browser.close();

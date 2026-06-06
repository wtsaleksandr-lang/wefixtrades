import { chromium } from 'playwright';
import fs from 'fs';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/g6';
const BASE='http://localhost:5099';
const TEMPLATES=['tree_service','pressure_washing_quote','mobile_car_detail','locksmith_service','water_damage_restoration'];

// locate the OUTERMOST widget wrapper (the embed/preview frame holding the calculator)
async function widgetBox(page){
  return await page.evaluate(()=>{
    const calc=document.querySelector('[class*="alculator"]');
    if(!calc) return null;
    // climb to a wrapper that is significantly bigger (the embed frame), stop before hero/section
    let n=calc, chosen=calc;
    for(let i=0;i<8 && n.parentElement;i++){
      const p=n.parentElement;
      const pr=p.getBoundingClientRect(), cr=chosen.getBoundingClientRect();
      // accept parent if it grows area but stays a "card" (width < viewport*0.98)
      if(pr.width<=window.innerWidth*0.99 && pr.height<window.innerHeight*4){ chosen=p; }
      n=p;
    }
    const r=chosen.getBoundingClientRect();
    return {x:r.x+window.scrollX, y:r.y+window.scrollY, w:r.width, h:r.height};
  });
}

const browser=await chromium.launch();
for(const tpl of TEMPLATES){
  for(const vp of [{n:'desktop',w:1440,h:900,m:false},{n:'mobile',w:375,h:812,m:true}]){
    const ctx=await browser.newContext({viewport:{width:vp.w,height:vp.h},isMobile:vp.m,hasTouch:vp.m,deviceScaleFactor:vp.m?2:1.5});
    const page=await ctx.newPage();
    try{
      await page.goto(`${BASE}/templates/${tpl}`,{waitUntil:'domcontentloaded',timeout:30000});
      await page.waitForTimeout(2500);
      const box=await widgetBox(page);
      if(box && box.w>0 && box.h>0){
        // scroll the widget to the top of the viewport so a viewport-clip captures it
        await page.evaluate(y=>window.scrollTo(0, y), Math.max(0, box.y-10));
        await page.waitForTimeout(400);
        const box2=await widgetBox(page); // recompute after scroll (now relative to current scroll)
        const top=Math.max(0, box2.y - (await page.evaluate(()=>window.scrollY)));
        const clip={x:Math.max(0,box2.x),y:Math.max(0, box2.y),width:Math.min(box2.w,vp.w),height:Math.min(box2.h,2800)};
        // use fullPage so absolute y works
        await page.screenshot({path:`${OUT}/zz_${tpl}_${vp.n}_widget.png`, clip, fullPage:true});
      } else {
        await page.screenshot({path:`${OUT}/zz_${tpl}_${vp.n}_FALLBACK.png`});
      }
    }catch(e){ fs.appendFileSync(`${OUT}/crop_err.log`, `${tpl} ${vp.n}: ${e.message}\n`); }
    await ctx.close();
  }
}
await browser.close();
console.log('crop done');

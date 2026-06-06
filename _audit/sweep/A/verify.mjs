import { chromium } from 'playwright';
const B='http://localhost:5099';
const br=await chromium.launch();
async function check(route,vp){
  const ctx=await br.newContext({viewport:{width:vp.w,height:vp.h},isMobile:vp.m,hasTouch:vp.m});
  const p=await ctx.newPage();
  await p.goto(B+route,{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(2000);
  const info=await p.evaluate(()=>{
    const iw=window.innerWidth;
    const r={docScroll:document.documentElement.scrollWidth, iw, bodyScroll:document.body.scrollWidth};
    // swiper carousel parents overflow style
    const sw=document.querySelector('.swiper');
    if(sw){const cs=getComputedStyle(sw);r.swiperOverflowX=cs.overflowX;r.swiperOverflow=cs.overflow;}
    const wrap=document.querySelector('.swiper-wrapper');
    if(wrap){r.wrapperParentOX=getComputedStyle(wrap.parentElement).overflowX;}
    return r;
  });
  console.log(route, JSON.stringify(info));
  await ctx.close();
}
await check('/blog',{w:1440,h:900,m:false});
await check('/blog',{w:375,h:812,m:true});
await check('/case-studies',{w:375,h:812,m:true});
await check('/',{w:375,h:812,m:true});
await check('/design-showcase',{w:375,h:812,m:true});
await check('/demos/rankflow',{w:375,h:812,m:true});
await check('/demos/socialsync',{w:1440,h:900,m:false});
await br.close();

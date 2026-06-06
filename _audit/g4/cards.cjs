const { chromium } = require('playwright');
const BASE='http://localhost:5099';
const T=['kitchen_renovation','bathroom_renovation','basement_finishing','interior_painting_pro','hvac_installation'];
const VPS={desktop:{width:1440,height:900,isMobile:false,hasTouch:false},mobile:{width:375,height:812,isMobile:true,hasTouch:true}};
(async()=>{
  const b=await chromium.launch();
  for(const tpl of T){
    for(const [vn,vp] of Object.entries(VPS)){
      const ctx=await b.newContext({viewport:{width:vp.width,height:vp.height},isMobile:vp.isMobile,hasTouch:vp.hasTouch});
      const p=await ctx.newPage();
      try{
        await p.goto(`${BASE}/templates/${tpl}`,{waitUntil:'domcontentloaded',timeout:30000});
        await p.waitForSelector('.qq-widget-0',{timeout:20000}).catch(()=>{});
        await p.waitForTimeout(1500);
        const r=await p.evaluate(()=>{
          let w=null,bw=0;for(const e of document.querySelectorAll('.qq-widget-0')){const x=e.getBoundingClientRect().width;if(x>bw){bw=x;w=e;}}
          if(!w)return{none:true};
          const sets=[];
          for(const grp of w.querySelectorAll('div,fieldset,ul')){
            const cs=getComputedStyle(grp);
            if(cs.display!=='grid'&&cs.display!=='flex')continue;
            const kids=[...grp.children].filter(c=>{const r=c.getBoundingClientRect();return r.width>40&&r.height>20;});
            if(kids.length<2||kids.length>6)continue;
            const hs=kids.map(k=>Math.round(k.getBoundingClientRect().height));
            const ws=kids.map(k=>Math.round(k.getBoundingClientRect().width));
            const mn=Math.min(...hs),mx=Math.max(...hs);
            // is it an option-card row? kids contain text like SEER/coat/tier or are buttons
            const txt=kids.map(k=>(k.innerText||'').trim().slice(0,18)).join(' | ');
            if(mx-mn>=20){sets.push({txt:txt.slice(0,70),heights:hs,widths:ws,delta:mx-mn,disp:cs.display,gtc:cs.gridTemplateColumns.slice(0,40)});}
          }
          return{sets};
        });
        if(r.none){console.log(`### ${tpl}[${vn}] no widget`);continue;}
        const real=r.sets.filter(s=>!/QuoteQuick|Powered|Estimate|Quote\b/i.test(s.txt) && s.heights.length<=6 && Math.max(...s.heights)<400);
        console.log(`### ${tpl}[${vn}]`);
        if(!real.length)console.log('  cards: all uniform');
        else for(const s of real)console.log(`  UNEVEN(Δ${s.delta}px) [${s.disp}] h=[${s.heights}] cols="${s.gtc}" :: ${s.txt}`);
      }catch(e){console.log(`### ${tpl}[${vn}] ERR ${e.message}`);}
      await ctx.close();
    }
  }
  await b.close();
})();

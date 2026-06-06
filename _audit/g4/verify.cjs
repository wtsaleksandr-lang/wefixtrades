const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch();
  // HVAC mobile - capture the tier card defect
  const ctx=await b.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
  const p=await ctx.newPage();
  await p.goto('http://localhost:5099/templates/hvac_installation',{waitUntil:'domcontentloaded',timeout:30000});
  await p.waitForSelector('.qq-widget-0',{timeout:20000}).catch(()=>{});
  await p.waitForTimeout(1500);
  const tier=await p.evaluate(()=>{
    let w=null,bw=0;for(const e of document.querySelectorAll('.qq-widget-0')){const x=e.getBoundingClientRect().width;if(x>bw){bw=x;w=e;}}
    const el=[...w.querySelectorAll('*')].find(e=>/Top tier/i.test(e.innerText||'')&&e.querySelectorAll('*').length<6);
    if(el){const r=el.getBoundingClientRect();window.scrollTo(0,r.top+window.scrollY-260);}
    // page horizontal scroll?
    return {docScrollW:document.documentElement.scrollWidth, vw:window.innerWidth};
  });
  await p.waitForTimeout(500);
  await p.screenshot({path:'_audit/g4/HVAC_mobile_tiercards_defect.png'});
  console.log('hvac mobile horiz: docScrollW='+tier.docScrollW+' vw='+tier.vw+(tier.docScrollW>tier.vw+2?' => PAGE HORIZONTAL SCROLL':' => no page hscroll'));
  await ctx.close();

  // bathroom desktop - low-contrast blue panel closeup
  const c2=await b.newContext({viewport:{width:1440,height:900}});
  const p2=await c2.newPage();
  await p2.goto('http://localhost:5099/templates/bathroom_renovation',{waitUntil:'domcontentloaded',timeout:30000});
  await p2.waitForSelector('.qq-widget-0',{timeout:20000}).catch(()=>{});
  await p2.waitForTimeout(1500);
  await p2.evaluate(()=>{let w=null,bw=0;for(const e of document.querySelectorAll('.qq-widget-0')){const x=e.getBoundingClientRect().width;if(x>bw){bw=x;w=e;}}const r=w.getBoundingClientRect();window.scrollTo(0,r.top+window.scrollY-30);});
  await p2.waitForTimeout(400);
  await p2.screenshot({path:'_audit/g4/BATH_desktop_bluepanel_contrast.png'});
  await c2.close();
  await b.close();
  console.log('done');
})();

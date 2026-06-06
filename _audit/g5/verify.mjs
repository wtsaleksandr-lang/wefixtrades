import { chromium } from 'playwright';
const base='http://localhost:5099';
const browser=await chromium.launch();

async function check(id, label){
  const ctx=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await ctx.newPage();
  await page.goto(`${base}/templates/${id}`,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(2800);
  await page.evaluate(()=>{const ws=[...document.querySelectorAll('.qq-widget-0')];let b=null,bw=-1;for(const w of ws){const r=w.getBoundingClientRect();if(r.width>bw){bw=r.width;b=w;}}b.setAttribute('data-audit-primary','1');});
  const res=await page.evaluate((label)=>{
    const root=document.querySelector('[data-audit-primary]');
    // find element whose text includes label
    const all=[...root.querySelectorAll('*')];
    const found=[];
    for(const el of all){
      const own=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join('');
      if(own && own.includes(label)){
        const cs=getComputedStyle(el);
        // real rendered bg: sample by walking but report each ancestor bg
        let chain=[]; let n=el;
        while(n && n!==document.body){ chain.push({tag:n.tagName,cls:(n.className||'').toString().slice(0,40),bg:getComputedStyle(n).backgroundColor}); n=n.parentElement; }
        found.push({label:own.slice(0,40), color:cs.color, ownBg:cs.backgroundColor, chain:chain.slice(0,5)});
      }
    }
    return found.slice(0,3);
  }, label);
  console.log(id, '::', label);
  console.log(JSON.stringify(res,null,1));
  await ctx.close();
}
await check('electrical_work','Easy (open wall');
await check('lawn_care_subscription','season (8 months');
await check('lawn_care_subscription','Full season');
await browser.close();

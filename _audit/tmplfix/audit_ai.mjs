import { chromium } from 'playwright';
const URL='http://localhost:5099/wizard?template=driveway_paving';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/tmplfix';
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const page=await ctx.newPage();
await page.goto(URL,{waitUntil:'networkidle'});
await page.waitForTimeout(2500);
const O={};
function intersect(a,b){ return !(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y); }
// scroll so the CTA 'Get My Quote' is in view (it's near the bottom of the widget)
await page.evaluate(()=>{ const el=[...document.querySelectorAll('button,a')].find(e=>/get my quote/i.test((e.innerText||'').trim())&&(e.innerText||'').trim().length<30); el?.scrollIntoView({block:'center'}); });
await page.waitForTimeout(500);
O.sameFrame=await page.evaluate(()=>{
  function rect(el){ if(!el) return null; const r=el.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),right:Math.round(r.right),bottom:Math.round(r.bottom)}; }
  let cta=null; document.querySelectorAll('button,a,[role=button]').forEach(el=>{ if(/get my quote/i.test((el.innerText||'').trim())&&(el.innerText||'').trim().length<30) cta=el; });
  // AI bubble
  let lbl=document.querySelector('.qq-ai-bubble-label'); let bubble=lbl; for(let i=0;i<5&&bubble;i++){ const r=bubble.getBoundingClientRect(); if(r.width>=28&&r.height>=28) break; bubble=bubble.parentElement; }
  if(!bubble){ document.querySelectorAll('.qq-ai-bubble').forEach(e=>bubble=e); }
  return { cta:rect(cta), ai:rect(bubble), vw:window.innerWidth, vh:window.innerHeight };
});
const {cta,ai}=O.sameFrame;
if(cta&&ai){ O.intersectsCTA = intersect(cta,ai); O.aiSize={w:ai.w,h:ai.h}; O.aiCorner = (ai.right > O.sameFrame.vw-90) ; }
await page.screenshot({path:`${OUT}/m-10-ai-cta.png`});
// also check AI bubble against tier cards in its frame
O.vsCards=await page.evaluate(()=>{
  function rect(el){ const r=el.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),right:Math.round(r.right),bottom:Math.round(r.bottom)}; }
  function intersect(a,b){ return !(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y); }
  let lbl=document.querySelector('.qq-ai-bubble-label'); let bubble=lbl; for(let i=0;i<5&&bubble;i++){ const r=bubble.getBoundingClientRect(); if(r.width>=28&&r.height>=28) break; bubble=bubble.parentElement; }
  const air=rect(bubble);
  function findCard(name){ let label=null; document.querySelectorAll('*').forEach(el=>{const t=(el.innerText||'').trim(); if(t===name&&(!label||el.innerText.length<label.innerText.length)) label=el;}); let el=label; for(let i=0;i<8&&el;i++){const txt=el.innerText||''; if(/\$[\d,]/.test(txt)&&/Core scope|Recommended|Top materials/i.test(txt)) return el; el=el.parentElement;} return label?.parentElement; }
  const res={};
  ['ESSENTIAL','STANDARD','PREMIUM'].forEach(n=>{ const c=findCard(n); if(c){ res[n]=intersect(air, rect(c)); } });
  return {aiRect:air, cardOverlap:res};
});
await browser.close();
console.log(JSON.stringify(O,null,2));
console.log('VS CARDS:', JSON.stringify(O.vsCards,null,2));

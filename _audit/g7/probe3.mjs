import { chromium } from 'playwright';
const BASE='http://localhost:5099';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
await p.goto(`${BASE}/templates/emergency_hvac`,{waitUntil:'domcontentloaded'});
await p.waitForTimeout(3000);
const info=await p.evaluate(()=>{
  const scopes=[...document.querySelectorAll('[data-qq-width-scope]')];
  const lp=document.querySelector('#live-preview');
  return {
    numScopes:scopes.length,
    scopes:scopes.map((s,i)=>{const r=s.getBoundingClientRect();return {i,cls:s.className.toString(),w:Math.round(r.width),h:Math.round(r.height),inLivePreview: lp?lp.contains(s):false, nButtons:s.querySelectorAll('button').length, nInputs:s.querySelectorAll('input').length, title:(s.querySelector('[data-component-type=title]')||{}).textContent };}),
    livePreviewRect: lp?(()=>{const r=lp.getBoundingClientRect();return{w:Math.round(r.width),h:Math.round(r.height),y:Math.round(r.y)};})():null
  };
});
console.log(JSON.stringify(info,null,2));
await b.close();

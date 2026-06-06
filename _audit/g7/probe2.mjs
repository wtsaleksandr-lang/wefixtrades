import { chromium } from 'playwright';
const BASE='http://localhost:5099';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
await p.goto(`${BASE}/templates/emergency_hvac`,{waitUntil:'domcontentloaded'});
await p.waitForTimeout(3000);
const info=await p.evaluate(()=>{
  const out={};
  const scope=document.querySelector('[data-qq-width-scope]');
  out.scopeExists=!!scope;
  if(scope){const r=scope.getBoundingClientRect();out.scopeRect={x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};out.scopeCls=scope.className.toString().slice(0,120);out.scopeParentCls=scope.parentElement.className.toString().slice(0,80);}
  // structure within live-preview
  const lp=document.querySelector('#live-preview');
  out.livePreviewHasScope = lp? !!lp.querySelector('[data-qq-width-scope]') : false;
  // count step fields
  out.shellFields=document.querySelectorAll('[data-shell-field-id]').length;
  out.stepIndexEls=[...document.querySelectorAll('[data-step-index]')].map(e=>e.getAttribute('data-step-index'));
  out.componentNames=[...new Set([...document.querySelectorAll('[data-component-name]')].map(e=>e.getAttribute('data-component-name')))].slice(0,20);
  out.componentTypes=[...new Set([...document.querySelectorAll('[data-component-type]')].map(e=>e.getAttribute('data-component-type')))].slice(0,20);
  out.resultEmphasis=[...document.querySelectorAll('[data-result-emphasis]')].map(e=>e.textContent.trim().slice(0,40));
  // option buttons inside scope
  if(scope){
    out.scopeButtons=[...scope.querySelectorAll('button')].map(b=>b.innerText.trim().slice(0,30)).filter(Boolean).slice(0,30);
    out.scopeInputs=[...scope.querySelectorAll('input')].map(i=>i.type);
  }
  return out;
});
console.log(JSON.stringify(info,null,2));
await b.close();

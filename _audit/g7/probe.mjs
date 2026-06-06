import { chromium } from 'playwright';
const BASE='http://localhost:5099';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
await p.goto(`${BASE}/templates/emergency_hvac`,{waitUntil:'domcontentloaded'});
await p.waitForTimeout(3000);
await p.evaluate(async()=>{await new Promise(r=>{let y=0;const t=setInterval(()=>{window.scrollBy(0,500);y+=500;if(y>document.body.scrollHeight+1500){clearInterval(t);r();}},60);});});
await p.waitForTimeout(1000);
const info=await p.evaluate(()=>{
  const out={inputs:document.querySelectorAll('input').length, selects:document.querySelectorAll('select').length, buttons:document.querySelectorAll('button').length, radios:document.querySelectorAll('[role="radio"]').length, sliders:document.querySelectorAll('[role="slider"],input[type="range"]').length, iframes:document.querySelectorAll('iframe').length};
  // collect class names of large divs that look like widget
  const divs=[...document.querySelectorAll('div')].filter(d=>{const r=d.getBoundingClientRect();return r.height>200&&r.width>200&&(d.querySelector('input,select,button,[role=radio],input[type=range]'));});
  out.candidateContainers=divs.slice(0,8).map(d=>({cls:(d.className&&d.className.toString)?d.className.toString().slice(0,120):'', id:d.id, h:Math.round(d.getBoundingClientRect().height)}));
  // sample button texts
  out.buttonTexts=[...document.querySelectorAll('button')].slice(0,20).map(b=>b.innerText.trim().slice(0,30)).filter(Boolean);
  // sample input attrs
  out.inputSamples=[...document.querySelectorAll('input')].slice(0,10).map(i=>({type:i.type,ph:i.placeholder,name:i.name}));
  out.iframeSrcs=[...document.querySelectorAll('iframe')].map(f=>f.src);
  // any data attributes hinting widget
  out.dataAttrs=[...new Set([...document.querySelectorAll('*')].flatMap(e=>[...e.attributes].map(a=>a.name).filter(n=>n.startsWith('data-'))))].slice(0,30);
  return out;
});
console.log(JSON.stringify(info,null,2));
await b.close();

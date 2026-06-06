import { chromium } from 'playwright';
const BASE='http://localhost:5099/templates';
const id=process.argv[2]||'appliance_repair';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
await p.goto(`${BASE}/${id}`,{waitUntil:'domcontentloaded',timeout:30000});
await p.waitForTimeout(2500);
await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=400){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,60));}window.scrollTo(0,0);});
await p.waitForTimeout(1000);
// dump candidate containers: any element whose text contains a $ price and has decent size
const info=await p.evaluate(()=>{
  const out=[];
  document.querySelectorAll('*').forEach(el=>{
    const cls=(el.className&&el.className.toString())||'';
    if(/alculator|widget|quote-form|estimator/i.test(cls)){
      const r=el.getBoundingClientRect();
      out.push({cls:cls.slice(0,80),tag:el.tagName,w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.x),y:Math.round(r.y)});
    }
  });
  // also find element containing the price text
  const priceEls=[];
  document.querySelectorAll('*').forEach(el=>{
    const own=Array.from(el.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent).join('');
    if(/\$\d/.test(own)){const r=el.getBoundingClientRect();priceEls.push({tag:el.tagName,cls:(el.className||'').toString().slice(0,60),text:own.trim().slice(0,30),w:Math.round(r.width),y:Math.round(r.y)});}
  });
  return {containers:out.slice(0,30), prices:priceEls.slice(0,10)};
});
console.log(JSON.stringify(info,null,2));
await b.close();

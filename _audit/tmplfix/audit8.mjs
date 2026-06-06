import { chromium } from 'playwright';
const URL='http://localhost:5099/wizard?template=driveway_paving';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/tmplfix';
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const page=await ctx.newPage();
await page.goto(URL,{waitUntil:'networkidle'});
await page.waitForTimeout(2500);
const O={};
const trustPresent=()=>page.evaluate(()=>{ let f=false; document.querySelectorAll('*').forEach(el=>{const t=el.innerText||''; if(t.includes('Licensed & Insured')&&t.includes('BBB')) f=true;}); return f; });
O.trustBefore=await trustPresent();
// open Style
await page.mouse.click(195,814); await page.waitForTimeout(1000);
// scroll to bottom to reach "Advanced settings"
for(let i=0;i<14;i++){ await page.mouse.move(195,500); await page.mouse.wheel(0,500); await page.waitForTimeout(250); }
await page.waitForTimeout(400);
// click "Advanced settings"
const advClicked=await page.evaluate(()=>{
  let el=null; document.querySelectorAll('button,[role=button],*').forEach(e=>{ const t=(e.innerText||'').trim(); if(/^Advanced settings$/i.test(t)) el=el||e; });
  if(!el) return false; el.scrollIntoView({block:'center'}); el.click(); return true;
});
O.advClicked=advClicked;
await page.waitForTimeout(900);
// scroll more and look for trust toggle / any toggles now
for(let i=0;i<8;i++){
  const f=await page.evaluate(()=>{
    let lbl=null; document.querySelectorAll('*').forEach(e=>{ const t=(e.innerText||'').trim(); if(/trust badge/i.test(t)&&t.length<60&&e.children.length<5) lbl=e; });
    if(!lbl) return null; const r=lbl.getBoundingClientRect(); return {text:lbl.innerText.trim().slice(0,50), y:Math.round(r.y), inView:r.y>40&&r.y<800};
  });
  O.scrollFind=f;
  if(f&&f.inView) break;
  await page.mouse.move(195,500); await page.mouse.wheel(0,400); await page.waitForTimeout(350);
}
await page.screenshot({path:`${OUT}/m-06b-advanced.png`});
// dump all toggle-like controls now visible + trust hits
O.advDump=await page.evaluate(()=>{
  const trustHits=[]; document.querySelectorAll('*').forEach(e=>{ const t=(e.innerText||'').trim(); if(/trust/i.test(t)&&t.length<60&&e.children.length<5) trustHits.push(t); });
  const ctrls=[];
  document.querySelectorAll('[role=switch],input[type=checkbox],button[aria-pressed],[class*=toggle],[class*=Toggle],[class*=switch],[class*=Switch]').forEach(el=>{
    const r=el.getBoundingClientRect(); if(r.width===0) return;
    let p=el,l=''; for(let i=0;i<5&&p;i++){p=p.parentElement; if(p){const t=(p.innerText||'').trim(); if(t&&t.length<50){l=t;break;}}}
    ctrls.push({tag:el.tagName,role:el.getAttribute('role'),pressed:el.getAttribute('aria-pressed'),checked:el.getAttribute('aria-checked'),cls:el.className?.toString?.().slice(0,40),lbl:l,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});
  });
  return {trustHits:[...new Set(trustHits)], ctrls};
});
// try operate trust toggle if found
const tc=O.advDump.ctrls.find(c=>/trust/i.test(c.lbl));
O.trustCtrl=tc||null;
if(tc){
  await page.mouse.click(tc.x,tc.y); await page.waitForTimeout(1000);
  O.afterOff=await trustPresent();
  await page.screenshot({path:`${OUT}/m-06c-trust-off.png`});
  await page.mouse.click(tc.x,tc.y); await page.waitForTimeout(1000);
  O.afterOn=await trustPresent();
  await page.screenshot({path:`${OUT}/m-06d-trust-on.png`});
}
await browser.close();
console.log(JSON.stringify(O,null,2));

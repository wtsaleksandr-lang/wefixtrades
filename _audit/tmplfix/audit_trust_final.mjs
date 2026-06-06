import { chromium } from 'playwright';
const URL='http://localhost:5099/wizard?template=driveway_paving';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/tmplfix';
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const page=await ctx.newPage();
await page.goto(URL,{waitUntil:'networkidle'});
await page.waitForTimeout(2500);
const O={};
// preview badge row present? (scoped: small element, in preview y-range when sheet closed)
const previewBadges=()=>page.evaluate(()=>{
  let row=null; document.querySelectorAll('*').forEach(el=>{ const t=el.innerText||''; if(t.includes('Licensed & Insured')&&t.includes('BBB Accredited')&&t.length<160){ const r=el.getBoundingClientRect(); if(r.y>100&&r.y<420){ if(!row||t.length<row.innerText.length) row=el; } }});
  return !!row;
});
async function openAndToggle(){
  await page.mouse.click(195,814); await page.waitForTimeout(900);
  for(let i=0;i<16;i++){ await page.mouse.move(195,500); await page.mouse.wheel(0,500); await page.waitForTimeout(150);}
  await page.evaluate(()=>{ document.querySelectorAll('*').forEach(e=>{ if(/^Advanced settings$/i.test((e.innerText||'').trim())) e.click(); }); });
  await page.waitForTimeout(700);
  for(let i=0;i<12;i++){ const ok=await page.evaluate(()=>{ const l=[...document.querySelectorAll('*')].find(e=>/^Show trust badges$/i.test((e.innerText||'').trim())); if(!l) return false; const r=l.getBoundingClientRect(); return r.y>80&&r.y<760; }); if(ok) break; await page.mouse.move(195,500); await page.mouse.wheel(0,260); await page.waitForTimeout(220); }
  const clicked=await page.evaluate(()=>{
    const l=[...document.querySelectorAll('*')].find(e=>/^Show trust badges$/i.test((e.innerText||'').trim()));
    if(!l) return false; const host=l.closest('label')||l.parentElement; (host||l).click(); return true;
  });
  await page.waitForTimeout(700);
  await page.mouse.click(355,226); // collapse
  await page.waitForTimeout(700);
  return clicked;
}
O.start=await previewBadges();
O.c1=await openAndToggle();
O.afterToggleA=await previewBadges();
O.c2=await openAndToggle();
O.afterToggleB=await previewBadges();
await page.screenshot({path:`${OUT}/m-06d-trust-on.png`});
await browser.close();
console.log(JSON.stringify(O,null,2));

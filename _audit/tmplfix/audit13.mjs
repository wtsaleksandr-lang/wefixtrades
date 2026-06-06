import { chromium } from 'playwright';
const URL='http://localhost:5099/wizard?template=driveway_paving';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/tmplfix';
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const page=await ctx.newPage();
await page.goto(URL,{waitUntil:'networkidle'});
await page.waitForTimeout(2500);
const O={};
const badgeRow=()=>page.evaluate(()=>{
  let row=null; document.querySelectorAll('*').forEach(el=>{ const t=el.innerText||''; if(t.includes('Licensed & Insured')&&t.includes('BBB Accredited')&&t.length<160){ if(!row||t.length<row.innerText.length) row=el; }});
  if(!row) return {present:false};
  const r=row.getBoundingClientRect(); return {present:true, y:Math.round(r.y), inPreview:r.y>100&&r.y<400};
});
async function openToTrustAndClick(){
  await page.mouse.click(195,814); await page.waitForTimeout(900);
  for(let i=0;i<16;i++){ await page.mouse.move(195,500); await page.mouse.wheel(0,500); await page.waitForTimeout(160);}
  await page.evaluate(()=>{ document.querySelectorAll('*').forEach(e=>{ if(/^Advanced settings$/i.test((e.innerText||'').trim())) e.click(); }); });
  await page.waitForTimeout(700);
  // scroll a bit more to surface trust checkbox
  for(let i=0;i<10;i++){
    const found=await page.evaluate(()=>{ const lbls=[...document.querySelectorAll('span,label,div')].filter(e=>/^Show trust badges$/i.test((e.innerText||'').trim())); if(!lbls.length) return false; const r=lbls[0].getBoundingClientRect(); return r.y>80&&r.y<760; });
    if(found) break; await page.mouse.move(195,500); await page.mouse.wheel(0,260); await page.waitForTimeout(220);
  }
  // click the label (which wraps the checkbox)
  const clicked=await page.evaluate(()=>{
    let lbl=[...document.querySelectorAll('label,span,div')].find(e=>/^Show trust badges$/i.test((e.innerText||'').trim()));
    if(!lbl) lbl=[...document.querySelectorAll('*')].find(e=>/Show trust badges/i.test((e.innerText||'').trim())&&(e.innerText||'').trim().length<40);
    if(!lbl) return false;
    const cb=(lbl.closest('label')||lbl.parentElement).querySelector('input[type=checkbox]') || lbl.parentElement.parentElement.querySelector('input[type=checkbox]');
    const target = cb ? (cb.closest('label')||cb.parentElement) : lbl;
    target.click(); return true;
  });
  await page.waitForTimeout(700);
  await page.mouse.click(355,226); // collapse sheet via chevron
  await page.waitForTimeout(700);
  return clicked;
}
O.start=await badgeRow();
O.click1=await openToTrustAndClick();
O.afterOff=await badgeRow();
await page.screenshot({path:`${OUT}/m-06c-trust-off.png`});
O.click2=await openToTrustAndClick();
O.afterOn=await badgeRow();
await page.screenshot({path:`${OUT}/m-06d-trust-on.png`});
await browser.close();
console.log(JSON.stringify(O,null,2));

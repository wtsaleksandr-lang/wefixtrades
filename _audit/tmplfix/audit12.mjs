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
  const r=row.getBoundingClientRect(); return {present:true, w:Math.round(r.width), h:Math.round(r.height), y:Math.round(r.y), vis:r.width>5&&r.height>5};
});
// Find the SPECIFIC checkbox: the input that is the previous-sibling region of the exact label text node "Show trust badges"
const findTrustCb=()=>page.evaluate(()=>{
  // find the smallest element whose text contains exactly the trust-badges label phrase
  let lblEl=null;
  document.querySelectorAll('span,label,div,p').forEach(e=>{ const t=(e.innerText||'').trim(); if(/^Show trust badges$/i.test(t)){ if(!lblEl||t.length<(lblEl.innerText||'').trim().length) lblEl=e; } });
  if(!lblEl){ // fallback: any element containing phrase, pick smallest text
    document.querySelectorAll('*').forEach(e=>{ const t=(e.innerText||'').trim(); if(/Show trust badges/i.test(t)&&t.length<40){ if(!lblEl||t.length<(lblEl.innerText||'').trim().length) lblEl=e; } });
  }
  if(!lblEl) return null;
  let row=lblEl; let cb=null;
  for(let i=0;i<7&&row;i++){ if(row.querySelector&&(cb=row.querySelector('input[type=checkbox]'))) break; row=row.parentElement; }
  if(!cb) return null;
  const r=cb.getBoundingClientRect();
  const lr=lblEl.getBoundingClientRect();
  return {checked:cb.checked, x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2), vis:r.width>0, lblY:Math.round(lr.y)};
});

async function openToTrust(){
  await page.mouse.click(195,814); await page.waitForTimeout(900);
  for(let i=0;i<14;i++){ await page.mouse.move(195,500); await page.mouse.wheel(0,500); await page.waitForTimeout(170);}
  await page.evaluate(()=>{ document.querySelectorAll('*').forEach(e=>{ if(/^Advanced settings$/i.test((e.innerText||'').trim())) e.click(); }); });
  await page.waitForTimeout(700);
  for(let i=0;i<16;i++){ const cb=await findTrustCb(); if(cb&&cb.y>70&&cb.y<760) return cb; await page.mouse.move(195,500); await page.mouse.wheel(0,280); await page.waitForTimeout(240); }
  return await findTrustCb();
}
async function collapseSheet(){
  // click chevron-down in sheet header (top-right around x355,y226)
  await page.mouse.click(355,226); await page.waitForTimeout(700);
}

O.start=await badgeRow();

// OPEN sheet, read checkbox, click it once
let cb=await openToTrust();
O.cbInitial=cb;
if(!cb){ await page.screenshot({path:`${OUT}/m-06-debug-notfound.png`}); O.err='trust checkbox not found'; await browser.close(); console.log(JSON.stringify(O,null,2)); process.exit(0); }
await page.mouse.click(cb.x, cb.y); await page.waitForTimeout(700);
O.cbAfterClick1=await findTrustCb();
await collapseSheet();
O.afterClick1_preview=await badgeRow();
await page.screenshot({path:`${OUT}/m-06c-trust-off.png`});

// OPEN again, click to restore
cb=await openToTrust();
await page.mouse.click(cb.x, cb.y); await page.waitForTimeout(700);
O.cbAfterClick2=await findTrustCb();
await collapseSheet();
O.afterClick2_preview=await badgeRow();
await page.screenshot({path:`${OUT}/m-06d-trust-on.png`});

await browser.close();
console.log(JSON.stringify(O,null,2));

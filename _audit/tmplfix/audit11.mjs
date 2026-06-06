import { chromium } from 'playwright';
const URL='http://localhost:5099/wizard?template=driveway_paving';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/tmplfix';
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const page=await ctx.newPage();
await page.goto(URL,{waitUntil:'networkidle'});
await page.waitForTimeout(2500);
const O={};

// Is the Style sheet currently open? (detect THEME/Advanced panel visible)
const sheetOpen=()=>page.evaluate(()=>{
  let open=false; document.querySelectorAll('*').forEach(e=>{ const t=(e.innerText||'').trim(); if(t==='THEME'||/Advanced settings/i.test(t)){ const r=e.getBoundingClientRect(); if(r.width>0&&r.y<844) open=true; } });
  return open;
});
// badge row in PREVIEW only (small container, visible, not inside an open sheet region)
const badgeRow=()=>page.evaluate(()=>{
  let row=null; document.querySelectorAll('*').forEach(el=>{ const t=el.innerText||''; if(t.includes('Licensed & Insured')&&t.includes('BBB Accredited')&&t.length<160){ if(!row||t.length<row.innerText.length) row=el; }});
  if(!row) return {present:false};
  const r=row.getBoundingClientRect(); return {present:true, w:Math.round(r.width), h:Math.round(r.height), y:Math.round(r.y)};
});

O.preStart=await badgeRow();

async function openStyleToTrust(){
  await page.mouse.click(195,814); await page.waitForTimeout(900);
  for(let i=0;i<14;i++){ await page.mouse.move(195,500); await page.mouse.wheel(0,500); await page.waitForTimeout(180);}
  await page.evaluate(()=>{ document.querySelectorAll('*').forEach(e=>{ if(/^Advanced settings$/i.test((e.innerText||'').trim())) e.click(); }); });
  await page.waitForTimeout(700);
  for(let i=0;i<14;i++){ const ok=await page.evaluate(()=>{ let inp=null; document.querySelectorAll('input[type=checkbox]').forEach(el=>{ let p=el; for(let j=0;j<4&&p;j++){p=p.parentElement; if(p&&/show trust badges/i.test((p.innerText||''))){inp=el;break;}}}); if(!inp) return false; const r=inp.getBoundingClientRect(); return r.y>60&&r.y<760; }); if(ok) return true; await page.mouse.move(195,500); await page.mouse.wheel(0,300); await page.waitForTimeout(250); }
  return false;
}
// Set checkbox to target value using a native setter + React event
async function setTrust(target){
  return page.evaluate((target)=>{
    let inp=null; document.querySelectorAll('input[type=checkbox]').forEach(el=>{ let p=el; for(let j=0;j<4&&p;j++){p=p.parentElement; if(p&&/show trust badges/i.test((p.innerText||''))){inp=el;break;}}});
    if(!inp) return {ok:false, reason:'no input'};
    const was=inp.checked;
    if(inp.checked!==target){
      // click the label (parent) to trigger React onChange
      const lbl=inp.closest('label')||inp.parentElement;
      lbl.click();
    }
    return {ok:true, was, now:inp.checked};
  }, target);
}
// close sheet fully: tap Build tab then re-read preview (Build keeps preview, sheet for build differs) -- better: tap the sheet grabber/backdrop.
async function closeSheet(){
  // Press Escape a couple times and tap above the sheet (on the dimmed preview area y~150)
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  // tap the chevron in sheet header (top-right of sheet ~ x360,y at sheet title). Try clicking collapse near "Style" title.
  await page.evaluate(()=>{ // click a chevron-down button in the sheet header
    const btns=[...document.querySelectorAll('button')];
    const head=btns.find(b=>{ const r=b.getBoundingClientRect(); return r.y>380&&r.y<520&&r.x>320; });
    head?.click();
  });
  await page.waitForTimeout(600);
}

// === TURN OFF ===
await openStyleToTrust();
O.setOff=await setTrust(false);
await page.waitForTimeout(900);
await closeSheet();
O.sheetOpenAfterOff=await sheetOpen();
O.previewAfterOff=await badgeRow();
await page.screenshot({path:`${OUT}/m-06c-trust-off.png`});

// === TURN ON ===
await openStyleToTrust();
O.setOn=await setTrust(true);
await page.waitForTimeout(900);
await closeSheet();
O.sheetOpenAfterOn=await sheetOpen();
O.previewAfterOn=await badgeRow();
await page.screenshot({path:`${OUT}/m-06d-trust-on.png`});
await browser.close();
console.log(JSON.stringify(O,null,2));

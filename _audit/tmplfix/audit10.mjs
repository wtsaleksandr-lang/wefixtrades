import { chromium } from 'playwright';
const URL='http://localhost:5099/wizard?template=driveway_paving';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/tmplfix';
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const page=await ctx.newPage();
await page.goto(URL,{waitUntil:'networkidle'});
await page.waitForTimeout(2500);
const O={};

// trust row detection scoped strictly to the preview widget's badge container.
// The badge row container earlier: contains 'Licensed & Insured' AND 'BBB Accredited', is small (<400 chars), NOT the whole widget.
const badgeRowPresent=()=>page.evaluate(()=>{
  let row=null;
  document.querySelectorAll('*').forEach(el=>{
    const t=el.innerText||'';
    if(t.includes('Licensed & Insured')&&t.includes('BBB Accredited')&&t.length<200){ if(!row||t.length<row.innerText.length) row=el; }
  });
  if(!row) return {present:false};
  const r=row.getBoundingClientRect();
  return {present:true, w:Math.round(r.width), h:Math.round(r.height), visible: r.width>0&&r.height>0};
});

O.before=await badgeRowPresent();

// open Style -> Advanced -> trust checkbox
await page.mouse.click(195,814); await page.waitForTimeout(900);
for(let i=0;i<14;i++){ await page.mouse.move(195,500); await page.mouse.wheel(0,500); await page.waitForTimeout(200);}
await page.evaluate(()=>{ document.querySelectorAll('*').forEach(e=>{ if(/^Advanced settings$/i.test((e.innerText||'').trim())) e.click(); }); });
await page.waitForTimeout(800);
for(let i=0;i<12;i++){ const ok=await page.evaluate(()=>{ let inp=null; document.querySelectorAll('input[type=checkbox]').forEach(el=>{ let p=el; for(let j=0;j<4&&p;j++){p=p.parentElement; if(p&&/show trust badges/i.test((p.innerText||''))){inp=el;break;}}}); if(!inp) return false; const r=inp.getBoundingClientRect(); return r.y>50&&r.y<780; }); if(ok) break; await page.mouse.move(195,500); await page.mouse.wheel(0,350); await page.waitForTimeout(280); }

// inspect checkbox wiring
O.wiring=await page.evaluate(()=>{
  let inp=null; document.querySelectorAll('input[type=checkbox]').forEach(el=>{ let p=el; for(let j=0;j<4&&p;j++){p=p.parentElement; if(p&&/show trust badges/i.test((p.innerText||''))){inp=el;break;}}});
  if(!inp) return null; const r=inp.getBoundingClientRect();
  return {checked:inp.checked, id:inp.id, hasLabelFor: !!(inp.id&&document.querySelector(`label[for="${inp.id}"]`)), parentTag:inp.parentElement?.tagName, x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)};
});

// Click using Playwright's check semantics on the input via its bounding box (force)
const cb=page.locator('input[type=checkbox]').filter({hasNot:page.locator('xyz')});
// Simpler: locate by associated text
const trustCheckbox = page.getByText('Show trust badges', {exact:false}).locator('xpath=ancestor::*[.//input][1]').locator('input[type=checkbox]').first();
async function toggleVia(){
  try{ await trustCheckbox.click({force:true,timeout:3000}); return 'pw-input'; }
  catch(e){
    // fallback dispatch
    await page.evaluate(()=>{ let inp=null; document.querySelectorAll('input[type=checkbox]').forEach(el=>{ let p=el; for(let j=0;j<4&&p;j++){p=p.parentElement; if(p&&/show trust badges/i.test((p.innerText||''))){inp=el;break;}}}); if(inp){ inp.click(); } });
    return 'dispatch';
  }
}
O.cbBeforeChecked=O.wiring?.checked;
O.method1=await toggleVia();
await page.waitForTimeout(800);
O.cbChecked1=await page.evaluate(()=>{ let inp=null; document.querySelectorAll('input[type=checkbox]').forEach(el=>{ let p=el; for(let j=0;j<4&&p;j++){p=p.parentElement; if(p&&/show trust badges/i.test((p.innerText||''))){inp=el;break;}}}); return inp?inp.checked:null; });

// CLOSE the sheet to view preview cleanly: click the collapse chevron at sheet header or press Escape
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
// also try clicking the Style header chevron / tapping Build then back is heavy; try clicking sheet title to collapse
await page.evaluate(()=>{ const h=[...document.querySelectorAll('*')].find(e=>(e.innerText||'').trim()==='Style'&&e.getBoundingClientRect().y<520); h?.click?.(); });
await page.waitForTimeout(700);
O.afterToggle1=await badgeRowPresent();
await page.screenshot({path:`${OUT}/m-06c-trust-off.png`});

// toggle back ON
await page.mouse.click(195,814); await page.waitForTimeout(700);
for(let i=0;i<14;i++){ await page.mouse.move(195,500); await page.mouse.wheel(0,500); await page.waitForTimeout(180);}
await page.evaluate(()=>{ document.querySelectorAll('*').forEach(e=>{ if(/^Advanced settings$/i.test((e.innerText||'').trim())) e.click(); }); });
await page.waitForTimeout(700);
for(let i=0;i<12;i++){ const ok=await page.evaluate(()=>{ let inp=null; document.querySelectorAll('input[type=checkbox]').forEach(el=>{ let p=el; for(let j=0;j<4&&p;j++){p=p.parentElement; if(p&&/show trust badges/i.test((p.innerText||''))){inp=el;break;}}}); if(!inp) return false; const r=inp.getBoundingClientRect(); return r.y>50&&r.y<780; }); if(ok) break; await page.mouse.move(195,500); await page.mouse.wheel(0,350); await page.waitForTimeout(250); }
O.method2=await toggleVia();
await page.waitForTimeout(800);
O.cbChecked2=await page.evaluate(()=>{ let inp=null; document.querySelectorAll('input[type=checkbox]').forEach(el=>{ let p=el; for(let j=0;j<4&&p;j++){p=p.parentElement; if(p&&/show trust badges/i.test((p.innerText||''))){inp=el;break;}}}); return inp?inp.checked:null; });
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
await page.evaluate(()=>{ const h=[...document.querySelectorAll('*')].find(e=>(e.innerText||'').trim()==='Style'&&e.getBoundingClientRect().y<520); h?.click?.(); });
await page.waitForTimeout(700);
O.afterToggle2=await badgeRowPresent();
await page.screenshot({path:`${OUT}/m-06d-trust-on.png`});
await browser.close();
console.log(JSON.stringify(O,null,2));

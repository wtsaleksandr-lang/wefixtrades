import { chromium } from 'playwright';
import fs from 'fs';
import { PNG } from 'pngjs';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/tmplfix';
const URL='http://localhost:5099/wizard?template=driveway_paving';
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const page=await ctx.newPage();
await page.goto(URL,{waitUntil:'networkidle'});
await page.waitForTimeout(2500);
const O={};
try{
// ---- WHITE BAND: scroll preview to bottom, screenshot, sample pixels below 'Powered by' ----
await page.evaluate(()=>{ const el=[...document.querySelectorAll('*')].find(e=>/powered by/i.test((e.innerText||'').trim())&&(e.innerText||'').trim().length<40); el?.scrollIntoView({block:'end'}); });
await page.waitForTimeout(600);
const pwrRect=await page.evaluate(()=>{ let p=null; document.querySelectorAll('*').forEach(el=>{ if(/powered by/i.test((el.innerText||'').trim())&&(el.innerText||'').trim().length<40) p=el; }); if(!p) return null; const r=p.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),bottom:Math.round(r.bottom),w:Math.round(r.width)}; });
O.pwrRect=pwrRect;
const shot=`${OUT}/m-08-band-sample.png`;
await page.screenshot({path:shot});
const png=PNG.sync.read(fs.readFileSync(shot));
const dpr=2;
const cx=Math.round(195*dpr);
const samples=[];
// sample from just below 'Powered by' text down to bottom of viewport (844)
const startY=pwrRect?pwrRect.bottom+4:760;
for(let y=startY; y<=842; y+=8){
  const py=y*dpr, idx=(png.width*py+cx)*4;
  if(py>=png.height) break;
  samples.push({y, rgb:`rgb(${png.data[idx]}, ${png.data[idx+1]}, ${png.data[idx+2]})`});
}
O.bottomSamples=samples;
// also sample a few across the width at y just below powered-by
const acrossY=(startY+10);
const across=[];
for(let x=30;x<=360;x+=60){ const idx=(png.width*(acrossY*dpr)+x*dpr)*4; across.push({x, rgb:`rgb(${png.data[idx]}, ${png.data[idx+1]}, ${png.data[idx+2]})`}); }
O.acrossSamples={y:acrossY, pts:across};

// ---- TRUST TOGGLE: open Style tab, dump toggle-row labels ----
// Click Style tab in the editor bottom nav
await page.goto(URL,{waitUntil:'networkidle'}); await page.waitForTimeout(1500);
async function clickByText(txt){ try{ await page.locator(`text="${txt}"`).first().click({timeout:4000}); await page.waitForTimeout(700); return true;}catch(e){return false;} }
const styleClicked=await clickByText('Style');
O.styleClicked=styleClicked;
await page.waitForTimeout(800);
// dump all switch/toggle rows with their labels
O.styleControls=await page.evaluate(()=>{
  const out=[];
  document.querySelectorAll('[role="switch"], input[type=checkbox]').forEach(sw=>{
    // find nearest text label
    let row=sw, label='';
    for(let i=0;i<5&&row;i++){ row=row.parentElement; if(row){ const t=(row.innerText||'').trim(); if(t&&t.length<60){ label=t; break; } } }
    const r=sw.getBoundingClientRect();
    out.push({tag:sw.tagName, role:sw.getAttribute('role'), checked:sw.getAttribute('aria-checked')??sw.checked, label, x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2), vis:r.width>0});
  });
  // also any text mentioning trust
  const trustTexts=[]; document.querySelectorAll('*').forEach(el=>{ const t=(el.innerText||'').trim(); if(/trust badge/i.test(t)&&t.length<50&&el.children.length<3) trustTexts.push(t); });
  return {switches:out, trustTexts:[...new Set(trustTexts)]};
});
await page.screenshot({path:`${OUT}/m-06b-style-tab.png`});

// Try to find & operate the trust toggle
const tt=O.styleControls.switches.find(s=>/trust/i.test(s.label));
O.foundTrustSwitch=tt||null;
if(tt && tt.vis){
  const before=await page.evaluate(()=>{ let f=false; document.querySelectorAll('*').forEach(el=>{const t=el.innerText||''; if(t.includes('Licensed & Insured')&&t.includes('BBB')) f=true;}); return f; });
  await page.mouse.click(tt.x,tt.y); await page.waitForTimeout(900);
  const afterOff=await page.evaluate(()=>{ let f=false; document.querySelectorAll('*').forEach(el=>{const t=el.innerText||''; if(t.includes('Licensed & Insured')&&t.includes('BBB')) f=true;}); return f; });
  await page.screenshot({path:`${OUT}/m-06c-trust-off.png`});
  await page.mouse.click(tt.x,tt.y); await page.waitForTimeout(900);
  const afterOn=await page.evaluate(()=>{ let f=false; document.querySelectorAll('*').forEach(el=>{const t=el.innerText||''; if(t.includes('Licensed & Insured')&&t.includes('BBB')) f=true;}); return f; });
  await page.screenshot({path:`${OUT}/m-06d-trust-on.png`});
  O.trustToggleResult={before, afterOff, afterOn};
}
}catch(e){ O.err=String(e); }
await browser.close();
console.log(JSON.stringify(O,null,2));

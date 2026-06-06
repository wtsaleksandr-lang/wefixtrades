import { chromium } from 'playwright';
const URL='http://localhost:5099/wizard?template=driveway_paving';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/tmplfix';
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:1440,height:900}, deviceScaleFactor:1});
const page=await ctx.newPage();
await page.goto(URL,{waitUntil:'networkidle'});
await page.waitForTimeout(2500);
const O={};
// scroll preview to tiers
await page.evaluate(()=>{ const el=[...document.querySelectorAll('*')].find(e=>(e.innerText||'').trim()==='STANDARD'); el?.scrollIntoView({block:'center'}); });
await page.waitForTimeout(500);
O.tiers=await page.evaluate(()=>{
  function rect(el){ if(!el) return null; const r=el.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),right:Math.round(r.right),bottom:Math.round(r.bottom)}; }
  function findCard(name){ let label=null; document.querySelectorAll('*').forEach(el=>{const t=(el.innerText||'').trim(); if(t===name&&(!label||el.innerText.length<label.innerText.length)) label=el;}); let el=label; for(let i=0;i<8&&el;i++){const txt=el.innerText||''; if(/\$[\d,]/.test(txt)&&/Core scope|Recommended|Top materials/i.test(txt)) return el; el=el.parentElement;} return label?.parentElement; }
  const out=[];
  ['ESSENTIAL','STANDARD','PREMIUM'].forEach(n=>{ const c=findCard(n); out.push({name:n, rect:rect(c), bg:c?getComputedStyle(c).backgroundColor:null}); });
  return out;
});
// determine 3-across: same row (y within tolerance), x increasing, not overlapping
const t=O.tiers;
if(t[0].rect&&t[1].rect&&t[2].rect){
  const sameRow = Math.abs(t[0].rect.y - t[1].rect.y)<30 && Math.abs(t[1].rect.y - t[2].rect.y)<30;
  const ordered = t[0].rect.x < t[1].rect.x && t[1].rect.x < t[2].rect.x;
  const noOverlap = t[0].rect.right <= t[1].rect.x+5 && t[1].rect.right <= t[2].rect.x+5;
  O.desktopGrid={sameRow, ordered, noOverlap, threeAcross: sameRow&&ordered&&noOverlap};
}
await page.screenshot({path:`${OUT}/d-01-tiers-desktop.png`});
// crop to tier area
await browser.close();
console.log(JSON.stringify(O,null,2));

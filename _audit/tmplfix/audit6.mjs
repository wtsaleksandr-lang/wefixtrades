import { chromium } from 'playwright';
const URL='http://localhost:5099/wizard?template=driveway_paving';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/tmplfix';
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const page=await ctx.newPage();
await page.goto(URL,{waitUntil:'networkidle'});
await page.waitForTimeout(2500);
const O={steps:[]};
// open Style
await page.mouse.click(195,814); await page.waitForTimeout(1000);
// find scroll container of the sheet
const findTrust=async()=>page.evaluate(()=>{
  let el=null; document.querySelectorAll('*').forEach(e=>{ const t=(e.innerText||'').trim(); if(/trust badge/i.test(t)&&t.length<60&&e.children.length<4) el=e; });
  if(!el) return null; const r=el.getBoundingClientRect(); return {text:el.innerText.trim().slice(0,50), y:Math.round(r.y), inView:r.y>0&&r.y<844};
});
// scroll the sheet incrementally using mouse wheel over the panel center
for(let i=0;i<14;i++){
  const found=await findTrust();
  O.steps.push({i, found});
  if(found && found.inView) break;
  await page.mouse.move(195,500);
  await page.mouse.wheel(0,400);
  await page.waitForTimeout(450);
}
await page.screenshot({path:`${OUT}/m-06b-style-scrolled.png`});
// Now locate the trust toggle control precisely
O.trustControl=await page.evaluate(()=>{
  let lbl=null; document.querySelectorAll('*').forEach(e=>{ const t=(e.innerText||'').trim(); if(/trust badge/i.test(t)&&t.length<60&&e.children.length<4) lbl=e; });
  if(!lbl) return {found:false};
  // climb to row, find a switch/button toggle
  let row=lbl; let sw=null;
  for(let i=0;i<5&&row;i++){ row=row.parentElement; if(!row) break; sw=row.querySelector('[role=switch],input[type=checkbox],button[aria-pressed],button[role=switch]'); if(sw) break; }
  if(!sw){ // any button in row
    let r2=lbl; for(let i=0;i<5&&r2;i++){r2=r2.parentElement; if(r2){const b=r2.querySelector('button'); if(b){sw=b;break;}}}
  }
  const out={found:true, labelText:lbl.innerText.trim().slice(0,50)};
  if(sw){ const r=sw.getBoundingClientRect(); out.sw={tag:sw.tagName,role:sw.getAttribute('role'),checked:sw.getAttribute('aria-checked'),pressed:sw.getAttribute('aria-pressed'),x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),vis:r.width>0}; }
  return out;
});
// operate it
const trustPresent=()=>page.evaluate(()=>{ let f=false; document.querySelectorAll('*').forEach(el=>{const t=el.innerText||''; if(t.includes('Licensed & Insured')&&t.includes('BBB')) f=true;}); return f; });
if(O.trustControl.found && O.trustControl.sw && O.trustControl.sw.vis){
  O.before=await trustPresent();
  await page.mouse.click(O.trustControl.sw.x,O.trustControl.sw.y); await page.waitForTimeout(1000);
  O.afterOff=await trustPresent();
  // screenshot preview - need preview visible; the sheet may cover it. Capture current + also collapse sheet
  await page.screenshot({path:`${OUT}/m-06c-after-toggle-off.png`});
  await page.mouse.click(O.trustControl.sw.x,O.trustControl.sw.y); await page.waitForTimeout(1000);
  O.afterOn=await trustPresent();
  await page.screenshot({path:`${OUT}/m-06d-after-toggle-on.png`});
}
await browser.close();
console.log(JSON.stringify(O,null,2));

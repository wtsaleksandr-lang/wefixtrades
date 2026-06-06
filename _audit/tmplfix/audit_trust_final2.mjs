import { chromium } from 'playwright';
const URL='http://localhost:5099/wizard?template=driveway_paving';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/tmplfix';
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const page=await ctx.newPage();
await page.goto(URL,{waitUntil:'networkidle'});
await page.waitForTimeout(2500);
const O={};
// Count preview-badge DOM nodes: the preview widget badge row chips. Use a data attribute or the specific chip text.
// Each badge chip text e.g. 'Licensed & Insured' appears in preview. Count occurrences in elements with small bbox in preview top area is fragile.
// Instead: get the trust-row container (mask-image gradient identifies it uniquely) and report if it exists & has children.
const trustRowState=()=>page.evaluate(()=>{
  // the trust row had a maskImage linear-gradient and overflow-x auto; find it
  let row=null;
  document.querySelectorAll('*').forEach(el=>{ const cs=getComputedStyle(el); if(/linear-gradient/.test(cs.webkitMaskImage||cs.maskImage) && cs.overflowX==='auto'){ const t=el.innerText||''; if(/Licensed & Insured/.test(t)) row=el; } });
  if(!row) return {exists:false};
  const r=row.getBoundingClientRect();
  return {exists:true, childChips:row.children.length, y:Math.round(r.y), display:getComputedStyle(row).display};
});
async function toggleInSheet(){
  // open style, advanced, click trust label - leave sheet open
  await page.mouse.click(195,814); await page.waitForTimeout(800);
  for(let i=0;i<16;i++){ await page.mouse.move(195,500); await page.mouse.wheel(0,500); await page.waitForTimeout(140);}
  await page.evaluate(()=>{ document.querySelectorAll('*').forEach(e=>{ if(/^Advanced settings$/i.test((e.innerText||'').trim())) e.click(); }); });
  await page.waitForTimeout(600);
  for(let i=0;i<12;i++){ const ok=await page.evaluate(()=>{ const l=[...document.querySelectorAll('*')].find(e=>/^Show trust badges$/i.test((e.innerText||'').trim())); if(!l) return false; const r=l.getBoundingClientRect(); return r.y>80&&r.y<760; }); if(ok) break; await page.mouse.move(195,500); await page.mouse.wheel(0,240); await page.waitForTimeout(200); }
  const clicked=await page.evaluate(()=>{ const l=[...document.querySelectorAll('*')].find(e=>/^Show trust badges$/i.test((e.innerText||'').trim())); if(!l) return false; (l.closest('label')||l.parentElement).click(); return true; });
  await page.waitForTimeout(700);
  return clicked;
}
async function closeEditorOverlay(){ // tap the dimmed preview area above sheet to dismiss, fallback chevron
  await page.mouse.click(355,226); await page.waitForTimeout(600);
}
O.start=await trustRowState();
// OFF
O.click1=await toggleInSheet();
await closeEditorOverlay();
O.afterOff=await trustRowState();
// ON (reopen)
O.click2=await toggleInSheet();
await closeEditorOverlay();
O.afterOn=await trustRowState();
await page.screenshot({path:`${OUT}/m-06d-trust-on.png`});
await browser.close();
console.log(JSON.stringify(O,null,2));

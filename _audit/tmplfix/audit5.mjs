import { chromium } from 'playwright';
const URL='http://localhost:5099/wizard?template=driveway_paving';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/tmplfix';
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const page=await ctx.newPage();
await page.goto(URL,{waitUntil:'networkidle'});
await page.waitForTimeout(2500);
const O={};
// Identify the editor tab buttons (Build/Action/Style/Settings/Help) - they are buttons in the editor chrome
O.tabButtons=await page.evaluate(()=>{
  const out=[];
  document.querySelectorAll('button,[role=tab]').forEach(el=>{
    const t=(el.innerText||'').trim();
    if(/^(Build|Action|Style|Settings|Help)$/.test(t)){ const r=el.getBoundingClientRect(); out.push({t, role:el.getAttribute('role'), cls:el.className?.toString?.().slice(0,60), x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),testid:el.getAttribute('data-testid')}); }
  });
  return out;
});
// Click the real Style tab button by coordinates
const styleBtn=O.tabButtons.find(b=>b.t==='Style');
if(styleBtn){
  await page.mouse.click(styleBtn.x, styleBtn.y);
  await page.waitForTimeout(1000);
}
await page.screenshot({path:`${OUT}/m-06b-style-panel.png`});
// Now dump panel: all toggles + labels + any 'trust' text in the now-open Style panel
O.afterStyle=await page.evaluate(()=>{
  const trustHits=[]; document.querySelectorAll('*').forEach(el=>{ const t=(el.innerText||'').trim(); if(/trust/i.test(t)&&t.length<70&&el.children.length<5) trustHits.push(t); });
  const toggles=[];
  document.querySelectorAll('[role=switch],input[type=checkbox],button').forEach(el=>{
    const r=el.getBoundingClientRect(); if(r.width===0) return;
    let lbl=''; let p=el; for(let i=0;i<4&&p;i++){p=p.parentElement; if(p){const t=(p.innerText||'').trim(); if(t&&t.length<60){lbl=t;break;}}}
    const al=el.getAttribute('aria-label')||'';
    if(/trust|badge/i.test(lbl+al)){ toggles.push({tag:el.tagName,role:el.getAttribute('role'),checked:el.getAttribute('aria-checked'),pressed:el.getAttribute('aria-pressed'),lbl,al,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}); }
  });
  // also list section headings visible in panel
  const headings=[]; document.querySelectorAll('h2,h3,h4,[class*=section],[class*=label]').forEach(el=>{ const t=(el.innerText||'').trim(); if(t&&t.length<40&&el.children.length<3) headings.push(t); });
  return {trustHits:[...new Set(trustHits)], toggles, panelText: (document.querySelector('[class*=mform],[class*=editor-pane],[class*=msheet],[class*=mpanel]')?.innerText||'').slice(0,1500)};
});
await browser.close();
console.log(JSON.stringify(O,null,2));

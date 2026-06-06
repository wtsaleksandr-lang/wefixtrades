import { chromium } from 'playwright';
const URL='http://localhost:5099/wizard?template=driveway_paving';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/tmplfix';
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const page=await ctx.newPage();
await page.goto(URL,{waitUntil:'networkidle'});
await page.waitForTimeout(2500);
const O={};

// Detect trust badges ONLY inside the live preview widget (the qq widget root), not editor form labels.
// The preview trust row earlier had class context; we identified its container at x~3,y~207 w384.
// Use a robust scope: the element whose innerText has 'Powered by WeFixTrades' is inside the preview widget root.
const detect=()=>page.evaluate(()=>{
  // find preview root = ancestor of 'Powered by WeFixTrades' that also contains 'Get My Quote'
  let pwr=null; document.querySelectorAll('*').forEach(el=>{ if(/powered by wefixtrades/i.test((el.innerText||''))&&(el.innerText||'').length<60) pwr=el; });
  let root=pwr; for(let i=0;i<14&&root;i++){ if(/get my quote/i.test(root.innerText||'')&&/Driveway/i.test(root.innerText||'')) break; root=root.parentElement; }
  if(!root) return {err:'no root'};
  const txt=root.innerText||'';
  const hasBadges = /Licensed & Insured/.test(txt) && /BBB Accredited/.test(txt);
  return { hasBadges, rootLen:txt.length };
});

O.preBefore=await detect();
// open Style, expand Advanced, scroll to trust toggle
await page.mouse.click(195,814); await page.waitForTimeout(900);
for(let i=0;i<14;i++){ await page.mouse.move(195,500); await page.mouse.wheel(0,500); await page.waitForTimeout(220);}
await page.evaluate(()=>{ let el=null; document.querySelectorAll('*').forEach(e=>{ if(/^Advanced settings$/i.test((e.innerText||'').trim())) el=el||e; }); el?.click(); });
await page.waitForTimeout(800);
// scroll until 'Show trust badges' input visible
let toggleBox=null;
for(let i=0;i<12;i++){
  toggleBox=await page.evaluate(()=>{
    let inp=null; document.querySelectorAll('input').forEach(el=>{ let p=el,l=''; for(let j=0;j<4&&p;j++){p=p.parentElement; if(p){const t=(p.innerText||'').trim(); if(/show trust badges/i.test(t)){l=t;break;}}} if(/show trust badges/i.test(l)) inp=el; });
    if(!inp) return null; const r=inp.getBoundingClientRect();
    return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),inView:r.y>50&&r.y<800,checked:inp.checked,type:inp.type};
  });
  if(toggleBox&&toggleBox.inView) break;
  await page.mouse.move(195,500); await page.mouse.wheel(0,350); await page.waitForTimeout(300);
}
O.toggleBox=toggleBox;
// Toggle OFF via clicking the label text (more reliable than the input for custom checkboxes)
async function clickTrustToggle(){
  // click the label "Show trust badges"
  const lbl=page.locator('text="Show trust badges"').first();
  try{ await lbl.click({timeout:3000}); return 'label'; }catch(e){}
  if(toggleBox){ await page.mouse.click(toggleBox.x,toggleBox.y); return 'coord'; }
  return 'none';
}
O.click1=await clickTrustToggle();
await page.waitForTimeout(1000);
O.checkedAfter1=await page.evaluate(()=>{ let inp=null; document.querySelectorAll('input').forEach(el=>{ let p=el; for(let j=0;j<4&&p;j++){p=p.parentElement; if(p&&/show trust badges/i.test((p.innerText||''))){inp=el;break;}}}); return inp?inp.checked:null; });
O.preAfterOff=await detect();
await page.screenshot({path:`${OUT}/m-06c-trust-off.png`});
// Toggle back ON
O.click2=await clickTrustToggle();
await page.waitForTimeout(1000);
O.checkedAfter2=await page.evaluate(()=>{ let inp=null; document.querySelectorAll('input').forEach(el=>{ let p=el; for(let j=0;j<4&&p;j++){p=p.parentElement; if(p&&/show trust badges/i.test((p.innerText||''))){inp=el;break;}}}); return inp?inp.checked:null; });
O.preAfterOn=await detect();
await page.screenshot({path:`${OUT}/m-06d-trust-on.png`});
await browser.close();
console.log(JSON.stringify(O,null,2));

import { chromium } from 'playwright';
const URL='http://localhost:5099/wizard?template=driveway_paving';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/tmplfix';
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const page=await ctx.newPage();
await page.goto(URL,{waitUntil:'networkidle'});
await page.waitForTimeout(2500);
const O={};
async function clickByText(txt){ try{ await page.locator(`text="${txt}"`).first().click({timeout:4000}); await page.waitForTimeout(800); return true;}catch(e){return false;} }

// Search every tab for a 'trust' control
const tabs=['Build','Action','Style','Settings'];
O.tabs={};
for(const tab of tabs){
  await clickByText(tab);
  await page.waitForTimeout(700);
  const r=await page.evaluate(()=>{
    // gather text mentioning trust + all interactive controls with 'trust' nearby
    const trustHits=[];
    document.querySelectorAll('*').forEach(el=>{ const t=(el.innerText||'').trim(); if(/trust/i.test(t)&&t.length<60&&el.children.length<4) trustHits.push(t); });
    // all switch-like controls
    const ctrls=[];
    document.querySelectorAll('[role=switch],input[type=checkbox],button[aria-pressed],.qq-toggle,[class*=toggle],[class*=switch]').forEach(el=>{
      const r=el.getBoundingClientRect();
      let lbl=''; let p=el; for(let i=0;i<5&&p;i++){p=p.parentElement; if(p){const t=(p.innerText||'').trim(); if(t&&t.length<60){lbl=t;break;}}}
      if(/trust/i.test(lbl)) ctrls.push({tag:el.tagName, cls:el.className?.toString?.().slice(0,50), role:el.getAttribute('role'), pressed:el.getAttribute('aria-pressed'), checked:el.getAttribute('aria-checked'), lbl, x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),vis:r.width>0});
    });
    return {trustHits:[...new Set(trustHits)], trustCtrls:ctrls};
  });
  O.tabs[tab]=r;
}
// Full dump of Style tab text for manual inspection
await clickByText('Style'); await page.waitForTimeout(800);
O.styleText=await page.evaluate(()=>{
  // the editor panel is likely a side/bottom sheet. Grab the panel containing tabs.
  // Just dump visible text of the lower editor sheet.
  const sheet=document.querySelector('[class*=sheet],[class*=panel],[class*=drawer]');
  return (sheet?sheet.innerText:document.body.innerText).slice(0,2000);
});
await page.screenshot({path:`${OUT}/m-06b-style-fulltab.png`,fullPage:false});
await browser.close();
console.log(JSON.stringify(O,null,2));

import { chromium } from 'playwright';
const URL='http://localhost:5099/wizard?template=driveway_paving';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/tmplfix';
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const page=await ctx.newPage();
await page.goto(URL,{waitUntil:'networkidle'});
await page.waitForTimeout(2500);
const O={};
async function dumpTab(tabX, name){
  await page.mouse.click(tabX,814); await page.waitForTimeout(900);
  // find the sheet scroll container
  const texts=new Set();
  const toggleLabels=new Set();
  for(let i=0;i<16;i++){
    const part=await page.evaluate(()=>{
      // identify the open sheet (largest element with role dialog or class containing sheet/panel near bottom)
      let sheet=null;
      document.querySelectorAll('[class*=sheet],[class*=Sheet],[role=dialog],[class*=panel],[class*=drawer]').forEach(el=>{ const r=el.getBoundingClientRect(); if(r.height>300 && r.bottom>700){ if(!sheet||r.height>sheet.getBoundingClientRect().height) sheet=el; } });
      const scope=sheet||document.body;
      // section headings (uppercase short) and any switch labels
      const heads=[]; scope.querySelectorAll('*').forEach(el=>{ const t=(el.innerText||'').trim(); if(t && t.length<36 && el.children.length<=1 && /^[A-Z][A-Za-z &/]+$/.test(t)) heads.push(t); });
      const tlabels=[];
      scope.querySelectorAll('[role=switch],input[type=checkbox]').forEach(sw=>{ let p=sw,l=''; for(let i=0;i<5&&p;i++){p=p.parentElement; if(p){const t=(p.innerText||'').trim(); if(t&&t.length<50){l=t;break;}}} tlabels.push(l+' ['+(sw.getAttribute('aria-checked')??sw.checked)+']'); });
      return {heads, tlabels};
    });
    part.heads.forEach(h=>texts.add(h));
    part.tlabels.forEach(t=>toggleLabels.add(t));
    await page.mouse.move(195,500); await page.mouse.wheel(0,450); await page.waitForTimeout(350);
  }
  return {sections:[...texts], toggles:[...toggleLabels]};
}
O.Style=await dumpTab(195,'Style');
// reopen fresh for Settings (close current by reload)
await page.goto(URL,{waitUntil:'networkidle'}); await page.waitForTimeout(2000);
O.Settings=await dumpTab(273,'Settings');
await page.goto(URL,{waitUntil:'networkidle'}); await page.waitForTimeout(2000);
O.Build=await dumpTab(39,'Build');
await browser.close();
console.log(JSON.stringify(O,null,2));

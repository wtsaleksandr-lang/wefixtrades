import { chromium } from 'playwright';
import fs from 'fs'; import path from 'path';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/wizdone/A';
const log=[]; function rec(s,st,n){const l=`[${st}] ${s}${n?' :: '+n:''}`;log.push(l);console.log(l);}
async function run(){
  const browser=await chromium.launch({executablePath:'C:/Users/Owner/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',headless:true});
  const ctx=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await ctx.newPage();
  await page.goto('http://localhost:5099/wizard',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(3500);
  // ensure on style tab so a build click forces a tab switch
  await page.locator('[data-testid="editor-tab-style"]').click().catch(()=>{});
  await page.waitForTimeout(500);
  const tabBefore = await page.locator('[data-testid="editor-tab-build"]').getAttribute('aria-selected').catch(()=>null);
  // click a field control in the preview
  const pf=page.locator('[data-testid="editor-preview-pane"]').locator('input:visible, [role="slider"]:visible, label:visible, button:visible').first();
  const vis = await pf.isVisible().catch(()=>false);
  rec('preview has clickable field', vis?'OK':'WARN');
  if(vis){
    await pf.click({force:true}).catch(()=>{});
    // poll for highlight class within 1.5s window
    let highlighted=false;
    for(let i=0;i<10;i++){
      highlighted = await page.locator('.qq-edit-highlight').count().then(c=>c>0).catch(()=>false);
      if(highlighted) break;
      await page.waitForTimeout(120);
    }
    const tabAfter = await page.locator('[data-testid="editor-tab-build"]').getAttribute('aria-selected').catch(()=>null);
    rec('CLICK-TO-EDIT highlight pulse appears', highlighted?'OK':'WARN');
    rec('CLICK-TO-EDIT switches tab to build', tabAfter==='true'?'OK':'WARN', `before=${tabBefore} after=${tabAfter}`);
    await page.screenshot({path:path.join(OUT,'d-click2edit-verified.png')});
  }
  await ctx.close(); await browser.close();
  fs.writeFileSync(path.join(OUT,'driveD-result.json'),JSON.stringify({steps:log},null,2));
}
run().catch(e=>{console.error(e);process.exit(1);});

import { chromium } from 'playwright';
import fs from 'fs'; import path from 'path';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/wizdone/A';
const URL='http://localhost:5099/wizard';
const log=[]; function rec(s,st,n){const l=`[${st}] ${s}${n?' :: '+n:''}`;log.push(l);console.log(l);}
async function exists(p,s){try{return await p.locator(s).first().isVisible({timeout:1500});}catch{return false;}}
function isNoise(t){return /Failed to load resource|net::ERR|fetch|ECONNREFUSED|status of [45]|<!DOCTYPE|api\//i.test(t);}
async function run(){
  const browser=await chromium.launch({executablePath:'C:/Users/Owner/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',headless:true});

  // ===== BLANK CALCULATOR STATE =====
  const ctx=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>{if(!isNoise(e.message))errs.push(e.message.slice(0,200));});
  await page.goto(URL,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(3500);
  await page.locator('[data-testid="editor-tab-build"]').click().catch(()=>{});
  await page.waitForTimeout(400);
  // expand start section, click "Start blank"
  const start=page.getByText('Start from a template / AI').first();
  if(await start.isVisible().catch(()=>false)){await start.click().catch(()=>{});await page.waitForTimeout(400);}
  if(await exists(page,'[data-testid="template-card-blank"]')){
    await page.locator('[data-testid="template-card-blank"]').click().catch(()=>{});
    await page.waitForTimeout(900);
    rec('apply Start-blank','OK');
    // empty preview state?
    rec('blank: preview empty-state shown', await exists(page,'[data-testid="preview-empty-state"]')?'OK':'INFO');
    let ptxt=''; try{ptxt=await page.locator('[data-testid="editor-preview-pane"]').innerText({timeout:2000});}catch{}
    const bad=(ptxt.match(/NaN|undefined|\[object Object\]/g)||[]);
    rec('blank: no NaN/undefined in preview', bad.length===0?'OK':'FAIL', bad.length?[...new Set(bad)].join(','):'clean');
    const fr=await page.locator('[data-testid^="field-row-"]').count();
    rec('blank: field rows cleared', `INFO`, `rows=${fr}`);
    await page.screenshot({path:path.join(OUT,'d-blank-state.png')});
  } else rec('Start-blank card','WARN','not found');
  rec('blank: no pageerrors', errs.length===0?'OK':'FAIL', errs.join(' | ')||'none');
  await ctx.close();

  // ===== MOBILE 390: every tab + publish =====
  const mctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const m=await mctx.newPage();
  const merrs=[]; m.on('pageerror',e=>{if(!isNoise(e.message))merrs.push(e.message.slice(0,200));});
  await m.goto(URL,{waitUntil:'domcontentloaded',timeout:30000});
  await m.waitForTimeout(3500);
  for(const t of ['build','action','style','settings']){
    if(await exists(m,`[data-testid="editor-tab-${t}"]`)){
      await m.locator(`[data-testid="editor-tab-${t}"]`).click().catch(()=>{});
      await m.waitForTimeout(700);
      const sheetOpen=await exists(m,'[data-testid="wizard-bottom-sheet"]');
      const content=await exists(m,'[data-testid="wizard-sheet-content"]');
      rec(`[mobile] tab ${t}: sheet+content`, (sheetOpen&&content)?'OK':'WARN', `sheet=${sheetOpen} content=${content}`);
      await m.screenshot({path:path.join(OUT,`m-tab-${t}.png`)});
      // close
      if(await exists(m,'[data-testid="wizard-sheet-close"]')) await m.locator('[data-testid="wizard-sheet-close"]').click().catch(()=>{});
      else if(await exists(m,'[data-testid="wizard-sheet-backdrop"]')) await m.locator('[data-testid="wizard-sheet-backdrop"]').click({force:true}).catch(()=>{});
      await m.waitForTimeout(400);
    } else rec(`[mobile] tab ${t}`,'WARN','tab not visible');
  }
  // mobile publish
  if(await exists(m,'[data-testid="quotequick-publish"]')){
    await m.locator('[data-testid="quotequick-publish"]').click().catch(()=>{});
    await m.waitForTimeout(800);
    rec('[mobile] publish overlay', await exists(m,'[data-testid="editor-publish-overlay"]')?'OK':'WARN');
    rec('[mobile] publish embed snippet', await exists(m,'[data-testid="install-embed-snippet"]')?'OK':'WARN');
    await m.screenshot({path:path.join(OUT,'m-publish.png')});
  } else rec('[mobile] publish button','WARN','not visible');
  rec('[mobile] no pageerrors', merrs.length===0?'OK':'FAIL', merrs.join(' | ')||'none');
  await mctx.close();
  await browser.close();
  fs.writeFileSync(path.join(OUT,'driveE-result.json'),JSON.stringify({steps:log,errs,merrs},null,2));
}
run().catch(e=>{console.error('CRASH',e);process.exit(1);});

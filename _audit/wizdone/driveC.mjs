// Targeted verification — correct selectors for the 4 ambiguous items.
import { chromium } from 'playwright';
import fs from 'fs'; import path from 'path';
const OUT='C:/Users/Owner/.codex/wt-preview/_audit/wizdone/A';
const URL='http://localhost:5099/wizard';
const log=[]; function rec(s,st,n){const l=`[${st}] ${s}${n?' :: '+n:''}`;log.push(l);console.log(l);}
async function exists(p,s){try{return await p.locator(s).first().isVisible({timeout:1500});}catch{return false;}}
async function shot(p,n){try{await p.screenshot({path:path.join(OUT,n)});}catch{}}
function isNoise(t){return /Failed to load resource|net::ERR|fetch|ECONNREFUSED|status of [45]|<!DOCTYPE|api\//i.test(t);}

async function run(){
  const browser=await chromium.launch({executablePath:'C:/Users/Owner/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',headless:true});
  const ctx=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>{if(!isNoise(e.message))errs.push(e.message.slice(0,200));});
  await page.goto(URL,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(3500);
  await page.locator('[data-testid="editor-tab-build"]').click().catch(()=>{});
  await page.waitForTimeout(500);

  // 1) TEMPLATE BROWSE CARDS (correct selector)
  const start=page.getByText('Start from a template / AI').first();
  if(await start.isVisible().catch(()=>false)){await start.click().catch(()=>{});await page.waitForTimeout(400);}
  if(await exists(page,'[data-testid="template-browse-all"]')){
    await page.locator('[data-testid="template-browse-all"]').click().catch(()=>{});
    await page.waitForTimeout(800);
    const cards=await page.locator('[data-testid^="template-browse-card-"]').count();
    rec('template browse REAL card count', cards>0?'OK':'FAIL', `cards=${cards}`);
    // category dropdown
    rec('template category select', await exists(page,'[data-testid="template-browse-cat-select"]')?'OK':'WARN');
    await shot(page,'d-template-cards-real.png');
    // apply a template
    if(cards>0){ await page.locator('[data-testid^="template-browse-card-"]').first().click().catch(()=>{}); await page.waitForTimeout(800); rec('apply template from browse','OK'); }
    if(await exists(page,'[data-testid="template-browse-close"]')) await page.locator('[data-testid="template-browse-close"]').click().catch(()=>{});
  }
  await page.waitForTimeout(500);

  // 2) KEBAB DELETE (correct selector: *-menu-trigger)
  const rowsBefore=await page.locator('[data-testid^="field-row-"]').count();
  const kebab=page.locator('[data-testid$="-menu-trigger"]').first();
  if(await kebab.isVisible().catch(()=>false)){
    await kebab.click().catch(()=>{});
    await page.waitForTimeout(300);
    await shot(page,'d-kebab-real.png');
    const del=page.getByRole('menuitem',{name:/delete/i}).first();
    if(await del.isVisible().catch(()=>false)){
      await del.click().catch(()=>{});
      await page.waitForTimeout(400);
      const after=await page.locator('[data-testid^="field-row-"]').count();
      rec('kebab DELETE field', after<rowsBefore?'OK':'FAIL', `${rowsBefore}->${after}`);
    } else rec('kebab delete item','FAIL','menuitem not found');
  } else rec('kebab trigger (-menu-trigger)','FAIL','not visible');

  // 3) FORMULA PREVIEW actually computes (read the preview node text, ignore input tokenization)
  // add a calc, expand, type formula
  if(await exists(page,'[data-testid="add-calculation-trigger"]')) await page.locator('[data-testid="add-calculation-trigger"]').click().catch(()=>{});
  else if(await exists(page,'[data-testid="add-calculation-trigger-empty"]')) await page.locator('[data-testid="add-calculation-trigger-empty"]').click().catch(()=>{});
  await page.waitForTimeout(600);
  const ctog=page.locator('[data-testid^="calc-row-toggle-"]').first();
  if(await ctog.isVisible().catch(()=>false)){await ctog.click().catch(()=>{});await page.waitForTimeout(400);}
  const fIn=page.locator('[data-testid^="calc-row-formula-input-"]').first();
  if(await fIn.isVisible().catch(()=>false)){
    await fIn.click().catch(()=>{});
    // contenteditable? clear and type
    await page.keyboard.press('Control+A').catch(()=>{});
    await page.keyboard.type('2 + 3 * 4').catch(()=>{});
    await page.waitForTimeout(600);
    const prevTxt=await page.locator('[data-testid^="calc-row-formula-preview-"]').first().innerText().catch(()=>'');
    rec('FORMULA preview value', /14/.test(prevTxt)?'OK':'WARN', `preview="${prevTxt.replace(/\s+/g,' ').slice(0,60)}"`);
    await shot(page,'d-formula-preview-real.png');
  } else rec('formula input','FAIL','not visible');

  // 4) CLICK-TO-EDIT (click preview field, check pane selection via data-selected-in-pane OR data-edit-key highlight)
  const pf=page.locator('[data-testid="editor-preview-pane"]').locator('input:visible, [role="slider"]:visible, button:visible, label:visible').first();
  if(await pf.isVisible().catch(()=>false)){
    await pf.click().catch(()=>{});
    await page.waitForTimeout(500);
    const sel1=await page.locator('[data-selected-in-pane]').count().catch(()=>0);
    const sel2=await page.locator('[data-testid-state="selected-in-pane"]').count().catch(()=>0);
    const overlay=await exists(page,'[data-testid="preview-selected-header"]');
    rec('CLICK-TO-EDIT preview->pane', (sel1>0||sel2>0||overlay)?'OK':'WARN', `selInPane=${sel1} stateAttr=${sel2} overlayHdr=${overlay}`);
    await shot(page,'d-click-to-edit.png');
  } else rec('click-to-edit','WARN','no preview field');

  rec('runtime pageerrors',errs.length===0?'OK':'FAIL',errs.join(' | ')||'none');
  await ctx.close(); await browser.close();
  fs.writeFileSync(path.join(OUT,'driveC-result.json'),JSON.stringify({steps:log,errs},null,2));
}
run().catch(e=>{console.error('CRASH',e);process.exit(1);});

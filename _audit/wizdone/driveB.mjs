// Deep second-pass driver — exercises the controls behind Advanced sections,
// FormulaEditor insert+preview, reorder/delete, click-to-edit, Publish embed.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = 'C:/Users/Owner/.codex/wt-preview/_audit/wizdone/A';
const URL = 'http://localhost:5099/wizard';
const log = [];
const consoleErrors = [], pageErrors = [];
function rec(s, st, n) { const l = `[${st}] ${s}${n ? ' :: ' + n : ''}`; log.push(l); console.log(l); }
function isNoise(t){return /Failed to load resource|net::ERR|fetch|Failed to fetch|ECONNREFUSED|500 \(|404 \(|the server responded|Unexpected token '<'|<!DOCTYPE|status of 5|status of 4|NetworkError|AbortError|api\//i.test(t);}
async function exists(p, s){ try { return await p.locator(s).first().isVisible({ timeout: 1500 }); } catch { return false; } }
async function shot(p,n){ try{ await p.screenshot({path:path.join(OUT,n)});}catch{} }
async function tryClick(p,s,step,o={}){ try{ const loc=typeof s==='string'?p.locator(s):s; await loc.first().click({timeout:o.timeout||4000}); rec(step,'OK'); return true;}catch(e){rec(step,'FAIL',e.message.split('\n')[0]);return false;} }

async function run(){
  const browser = await chromium.launch({ executablePath:'C:/Users/Owner/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe', headless:true });
  const ctx = await browser.newContext({ viewport:{width:1440,height:900} });
  const page = await ctx.newPage();
  page.on('console',m=>{if(m.type()==='error'&&!isNoise(m.text()))consoleErrors.push(m.text().slice(0,300));});
  page.on('pageerror',e=>{if(!isNoise(e.message))pageErrors.push(e.message.slice(0,300));});
  await page.goto(URL,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(3500);

  // BUILD: expand "Start from a template / AI" advanced section
  await tryClick(page,'[data-testid="editor-tab-build"]','open Build');
  await page.waitForTimeout(400);
  // The advanced section is collapsed because template pre-seeded fields. Find toggle by label text.
  const startToggle = page.getByText('Start from a template / AI').first();
  if (await startToggle.isVisible().catch(()=>false)) {
    await startToggle.click().catch(()=>{});
    await page.waitForTimeout(500);
    rec('expand Start-from-template/AI section','OK');
  } else rec('Start-from-template/AI toggle','WARN','label not found');
  rec('AI generate card now visible', await exists(page,'[data-testid="build-ai-card"]')?'OK':'FAIL');
  // fill AI prompt + check Generate enables
  if (await exists(page,'[data-testid="build-ai-prompt"]')) {
    await page.locator('[data-testid="build-ai-prompt"]').fill('Lawn care quote with size and frequency').catch(()=>{});
    const genDisabled = await page.locator('[data-testid="build-ai-generate"]').isDisabled().catch(()=>true);
    rec('AI Generate enables after prompt', genDisabled?'FAIL':'OK', genDisabled?'still disabled':'');
    // click a chip
    if (await exists(page,'[data-testid="build-ai-chip-0"]')) await tryClick(page,'[data-testid="build-ai-chip-0"]','click AI example chip');
  }
  await shot(page,'d-ai-card-open.png');

  // Template browse-all
  if (await exists(page,'[data-testid="template-browse-all"]')) {
    await tryClick(page,'[data-testid="template-browse-all"]','open Browse all templates');
    await page.waitForTimeout(700);
    rec('template browse grid', await exists(page,'[data-testid="template-browse-grid"]')?'OK':'FAIL');
    // count cards
    const cards = await page.locator('[data-testid="template-browse-grid"] >> [data-testid^="template-card"]').count().catch(()=>0);
    rec('template browse card count','INFO',`cards=${cards}`);
    // search filter
    if (await exists(page,'[data-testid="template-browse-search"]')) {
      await page.locator('[data-testid="template-browse-search"]').fill('zzzznomatch').catch(()=>{});
      await page.waitForTimeout(400);
      rec('template browse empty state on no-match', await exists(page,'[data-testid="template-browse-empty"]')?'OK':'WARN');
    }
    await shot(page,'d-template-browse-open.png');
    await tryClick(page,'[data-testid="template-browse-close"]','close template browse');
  } else rec('template-browse-all','WARN','still not visible after expand');

  // collapse the start section again to get to fields
  await page.waitForTimeout(300);

  // ---- DELETE a field via kebab ----
  const firstRow = page.locator('[data-testid^="field-row-"]').first();
  const rowsBefore = await page.locator('[data-testid^="field-row-"]').count();
  // open row body first (click toggle), then find kebab
  // kebab testid: look inside first row
  const kebabInRow = page.locator('[data-testid^="field-row-"]').first().locator('[data-testid*="kebab"], button[aria-label*="More"], button[aria-label*="options"]');
  if (await kebabInRow.first().isVisible().catch(()=>false)) {
    await kebabInRow.first().click().catch(()=>{});
    await page.waitForTimeout(300);
    await shot(page,'d-kebab-open.png');
    // click Delete/Remove
    const del = page.getByRole('menuitem',{name:/delete|remove/i}).or(page.getByText(/^delete$|^remove$/i));
    if (await del.first().isVisible().catch(()=>false)) {
      await del.first().click().catch(()=>{});
      await page.waitForTimeout(400);
      const rowsAfter = await page.locator('[data-testid^="field-row-"]').count();
      rec('delete field via kebab', rowsAfter<rowsBefore?'OK':'FAIL',`${rowsBefore}->${rowsAfter}`);
    } else rec('kebab Delete item','WARN','menu item not found');
  } else rec('field row kebab','WARN','kebab not visible in row');

  // ---- REORDER via arrow buttons (drag is hard headless; arrows are the fallback) ----
  // expand first row, look for move-up/down
  const moveBtn = page.locator('[data-testid^="field-row-"]').first().locator('button[aria-label*="Move"], button[aria-label*="up"], button[aria-label*="down"]');
  rec('reorder controls (arrows/handle)', (await page.locator('[data-testid^="field-row-handle-"]').first().isVisible().catch(()=>false))?'OK (drag handle present)':'WARN');

  // ---- CALCULATIONS: add + open FormulaEditor + insert ----
  // scroll to calc panel
  if (await exists(page,'[data-testid="add-calculation-trigger"]') || await exists(page,'[data-testid="add-calculation-trigger-empty"]')) {
    const t=(await exists(page,'[data-testid="add-calculation-trigger-empty"]'))?'[data-testid="add-calculation-trigger-empty"]':'[data-testid="add-calculation-trigger"]';
    await tryClick(page,t,'add calculation');
    await page.waitForTimeout(600);
  }
  // find a calc row, expand it
  const calcRow = page.locator('[data-testid^="calc-row-"]').filter({ hasNot: page.locator('[data-testid*="handle"]') }).first();
  const anyCalcToggle = page.locator('[data-testid^="calc-row-toggle-"]').first();
  if (await anyCalcToggle.isVisible().catch(()=>false)) {
    await anyCalcToggle.click().catch(()=>{});
    await page.waitForTimeout(500);
    rec('expand calculation row','OK');
    await shot(page,'d-calc-expanded.png');
    // formula input present?
    const fInput = page.locator('[data-testid^="calc-row-formula-input-"]').first();
    rec('FormulaEditor input present', await fInput.isVisible().catch(()=>false)?'OK':'FAIL');
    // insert trigger
    const insTrig = page.locator('[data-testid^="calc-row-insert-trigger-"]').first();
    if (await insTrig.isVisible().catch(()=>false)) {
      await insTrig.click().catch(()=>{});
      await page.waitForTimeout(400);
      rec('FormulaEditor insert menu opens', await page.locator('[data-testid^="calc-row-insert-menu-"]').first().isVisible().catch(()=>false)?'OK':'FAIL');
      await shot(page,'d-formula-insert-menu.png');
      // insert a function (SUM)
      const fnItem = page.locator('[data-testid*="calc-row-insert-fn-"]').first();
      if (await fnItem.isVisible().catch(()=>false)) { await fnItem.click().catch(()=>{}); rec('insert function into formula','OK'); }
      else rec('insert function item','WARN','no fn item');
    } else rec('FormulaEditor insert trigger','WARN','not visible');
    // type a real formula and check live preview
    if (await fInput.isVisible().catch(()=>false)) {
      await fInput.click().catch(()=>{});
      await fInput.fill('2 + 3 * 4').catch(()=>{});
      await page.waitForTimeout(500);
      const prev = page.locator('[data-testid^="calc-row-formula-preview-"]').first();
      const ptxt = await prev.innerText().catch(()=>'');
      rec('FormulaEditor live preview computes', /14/.test(ptxt)?'OK':'WARN', `preview="${ptxt.slice(0,40)}"`);
      // now an invalid formula -> error
      await fInput.fill('2 + + )').catch(()=>{});
      await page.waitForTimeout(500);
      const err = page.locator('[data-testid^="calc-row-formula-error-"]').first();
      rec('FormulaEditor error on invalid', await err.isVisible().catch(()=>false)?'OK':'WARN');
      await shot(page,'d-formula-error.png');
    }
    // result mode (primary/secondary)
    rec('calc result-mode control', await page.locator('[data-testid^="calc-row-resultmode-"]').first().isVisible().catch(()=>false)?'OK':'WARN');
  } else rec('expand calculation row','WARN','no calc toggle visible');

  // ---- CLICK-TO-EDIT preview mapping ----
  // click a field inside the preview pane, see if left pane selects/scrolls
  const previewField = page.locator('[data-testid="editor-preview-pane"]').locator('input, button, [role="slider"], label').first();
  if (await previewField.isVisible().catch(()=>false)) {
    await previewField.click().catch(()=>{});
    await page.waitForTimeout(400);
    const sel = await page.locator('[data-selected-in-pane]').count().catch(()=>0);
    rec('click-to-edit preview->pane selection', sel>0?'OK':'WARN',`selected=${sel}`);
  } else rec('click-to-edit preview','WARN','no preview field found');

  // ---- ACTION advanced groups: expand Advanced ----
  await tryClick(page,'[data-testid="editor-tab-action"]','open Action');
  await page.waitForTimeout(500);
  // expand any AdvancedSection in action (payment/email/booking/submit/spam)
  const advAction = page.getByText(/payment, email notifications/i).first();
  if (await advAction.isVisible().catch(()=>false)) { await advAction.click().catch(()=>{}); await page.waitForTimeout(500); }
  for (const g of ['submit','spam','payment','email','booking','soon']) rec(`action group after expand: ${g}`, await exists(page,`[data-testid="action-group-${g}"]`)?'present':'absent');
  await shot(page,'d-action-advanced.png');
  // mode switch to redirect
  if (await exists(page,'[data-testid="action-segmented-mode"]')) {
    const redirectBtn = page.locator('[data-testid="action-segmented-mode"]').getByText(/redirect/i).first();
    if (await redirectBtn.isVisible().catch(()=>false)) { await redirectBtn.click().catch(()=>{}); await page.waitForTimeout(400); rec('switch action mode -> redirect', await exists(page,'[data-testid="action-group-redirect"]')?'OK':'WARN'); }
  }

  // ---- STYLE advanced groups ----
  await tryClick(page,'[data-testid="editor-tab-style"]','open Style');
  await page.waitForTimeout(500);
  // expand all advanced toggles in style
  const advToggles = await page.locator('[data-testid^="advanced-toggle-"]').count();
  rec('style advanced toggles count','INFO',`count=${advToggles}`);
  for (let i=0;i<advToggles;i++){ try{ await page.locator('[data-testid^="advanced-toggle-"]').nth(i).click({timeout:1500}); await page.waitForTimeout(120);}catch{} }
  await page.waitForTimeout(400);
  for (const g of ['layout','shape','branding','brand-kit','brand-studio','trust-badges','floating-launcher']) rec(`style group after expand: ${g}`, await exists(page,`[data-testid="style-group-${g}"]`)?'present':'absent');
  // More colours
  if (await exists(page,'[data-testid="style-swatches-more-row"]')) rec('More colours row','OK'); else rec('More colours row','WARN');
  await shot(page,'d-style-advanced.png');

  // ---- SETTINGS advanced groups ----
  await tryClick(page,'[data-testid="editor-tab-settings"]','open Settings');
  await page.waitForTimeout(500);
  const sAdv = await page.locator('[data-testid^="advanced-toggle-"]').count();
  for (let i=0;i<sAdv;i++){ try{ await page.locator('[data-testid^="advanced-toggle-"]').nth(i).click({timeout:1500}); await page.waitForTimeout(120);}catch{} }
  await page.waitForTimeout(400);
  for (const g of ['pricing','deposit','scheduling','trade','business-profile','brand-badge']) rec(`settings group after expand: ${g}`, await exists(page,`[data-testid="settings-group-${g}"]`)?'present':'absent');
  await shot(page,'d-settings-advanced.png');

  // ---- PUBLISH modal: embed snippet + hosted + install guide ----
  await tryClick(page,'[data-testid="quotequick-publish"]','open Publish modal');
  await page.waitForTimeout(800);
  rec('publish: hosted section', await exists(page,'[data-testid="install-section-hosted"]')?'OK':'WARN');
  rec('publish: embed snippet', await exists(page,'[data-testid="install-embed-snippet"]')?'OK':'WARN');
  rec('publish: copy snippet btn', await exists(page,'[data-testid="install-copy-snippet"]')?'OK':'WARN');
  rec('publish: install guides', await exists(page,'[data-testid="install-section-guides"]')?'OK':'WARN');
  rec('publish: done-for-you', await exists(page,'[data-testid="install-section-doneforyou"]')?'OK':'WARN');
  // embed mode toggle inline/floating
  if (await exists(page,'[data-testid="install-embed-mode-floating"]')) await tryClick(page,'[data-testid="install-embed-mode-floating"]','toggle embed mode floating');
  // grab snippet text to check it's not placeholder
  let snip=''; try{ snip = await page.locator('[data-testid="install-embed-snippet"]').innerText({timeout:2000}); }catch{}
  rec('publish: embed snippet content','INFO', snip.slice(0,80).replace(/\n/g,' '));
  await shot(page,'d-publish-embed.png');
  await tryClick(page,'[data-testid="editor-publish-close"]','close Publish');

  await ctx.close();
  await browser.close();

  fs.writeFileSync(path.join(OUT,'driveB-result.json'), JSON.stringify({timestamp:new Date().toISOString(),steps:log,consoleErrors:[...new Set(consoleErrors)],pageErrors:[...new Set(pageErrors)]},null,2));
  console.log('\n===== CONSOLE ERRORS =====\n'+([...new Set(consoleErrors)].join('\n')||'(none)'));
  console.log('\n===== PAGE ERRORS =====\n'+([...new Set(pageErrors)].join('\n')||'(none)'));
}
run().catch(e=>{console.error('CRASH:',e);process.exit(1);});

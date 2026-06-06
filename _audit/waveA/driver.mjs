import { chromium } from 'playwright';
import fs from 'fs';

const OUT = 'C:/Users/Owner/.codex/wt-preview/_audit/waveA';
const BASE = 'http://localhost:5099';
const consoleErrors = [];
const results = {};

function log(...a){ console.log(...a); }

async function setup(page){
  consoleErrors.length = 0;
  page.on('console', m => { if (m.type()==='error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('PAGEERROR: '+e.message));
}

async function shot(page, name){
  const p = `${OUT}/${name}.png`;
  await page.screenshot({ path: p, fullPage: true });
  log('  shot:', p);
  return p;
}

async function run(){
  const browser = await chromium.launch();

  // ---------- DESKTOP ----------
  const ctxD = await browser.newContext({ viewport: { width:1440, height:900 } });
  const page = await ctxD.newPage();
  await setup(page);

  log('== Loading populated calc ==');
  await page.goto(`${BASE}/wizard?template=driveway_paving`, { waitUntil:'networkidle' });
  await page.waitForSelector('[data-testid="editor-tabpanel-build"]', { timeout:15000 }).catch(()=>{});
  await page.waitForTimeout(1200);

  // Item 1: Build tab default state
  const buildPanel = await page.$('[data-testid="editor-tabpanel-build"]');
  results.buildPanelPresent = !!buildPanel;

  // Titles & result text advanced section collapsed by default
  const titlesSec = await page.$('[data-testid="advanced-section-build-titles"]');
  results.titlesSectionPresent = !!titlesSec;
  results.titlesOpenDefault = titlesSec ? await titlesSec.getAttribute('data-open') : null;
  // Start from template/AI collapsed (fields populated)
  const startSec = await page.$('[data-testid="advanced-section-build-start"]');
  results.startSectionPresent = !!startSec;
  results.startOpenDefault = startSec ? await startSec.getAttribute('data-open') : null;
  // AI card hidden while collapsed
  results.aiCardVisibleDefault = await page.isVisible('[data-testid="build-ai-card"]').catch(()=>false);

  // Pricing heading text (not CALCULATIONS)
  const calcPanel = await page.$('[data-testid="editor-calculations-panel"]');
  results.pricingHeadingText = calcPanel ? (await calcPanel.innerText()).split('\n')[0] : null;
  const bodyText = await page.innerText('body');
  results.hasCALCULATIONSword = /CALCULATIONS/.test(bodyText);

  // core build view present
  results.businessNamePresent = await page.isVisible('[data-testid="input-business-name"]');
  results.fieldsPanelPresent = !!(await page.$('[data-testid="editor-calculations-panel"]'));
  results.fieldsCount = await page.$$eval('[data-testid^="calc-row-"]', els=>els.length).catch(()=>0);

  await shot(page, '1-build-default-desktop');

  // Expand Titles section
  await page.click('[data-testid="advanced-toggle-build-titles"]');
  await page.waitForTimeout(400);
  results.titlesBodyAfterClick = !!(await page.$('[data-testid="advanced-body-build-titles"]'));
  results.titlesOpenAfterClick = await (await page.$('[data-testid="advanced-section-build-titles"]')).getAttribute('data-open');

  // Expand Start section -> reveal AI card
  await page.click('[data-testid="advanced-toggle-build-start"]');
  await page.waitForTimeout(400);
  results.aiCardVisibleAfterExpand = await page.isVisible('[data-testid="build-ai-card"]');
  results.templateStripAfterExpand = await page.isVisible('[data-testid="build-ai-card"]') ;
  results.startOpenAfterClick = await (await page.$('[data-testid="advanced-section-build-start"]')).getAttribute('data-open');
  await shot(page, '1-build-expanded-desktop');

  // ---------- Item 2: Style -> Colours ----------
  log('== Style tab ==');
  await page.click('[data-testid="editor-tab-style"]');
  await page.waitForSelector('[data-testid="editor-tabpanel-style"]', { timeout:8000 });
  await page.waitForTimeout(600);

  // default swatches row
  const defaultRow = await page.$('[data-testid="style-swatches-row"]');
  results.defaultSwatchLabels = defaultRow ? (await defaultRow.innerText()).replace(/\n/g,' | ') : null;
  // default visible swatch testids
  results.defaultSwatchTestids = await page.$$eval('[data-testid="style-swatches-row"] [data-testid^="style-input-"]', els=>els.map(e=>e.getAttribute('data-testid')));
  // More colours section collapsed
  const moreSec = await page.$('[data-testid="advanced-section-style-colours-more"]');
  results.moreSectionPresent = !!moreSec;
  results.moreOpenDefault = moreSec ? await moreSec.getAttribute('data-open') : null;
  results.moreRowVisibleDefault = await page.isVisible('[data-testid="style-swatches-more-row"]').catch(()=>false);
  await shot(page, '2-style-colours-default-desktop');

  // expand More colours
  await page.click('[data-testid="advanced-toggle-style-colours-more"]');
  await page.waitForTimeout(400);
  results.moreRowVisibleAfter = await page.isVisible('[data-testid="style-swatches-more-row"]');
  results.moreSwatchTestids = await page.$$eval('[data-testid="style-swatches-more-row"] [data-testid^="style-input-"]', els=>els.map(e=>e.getAttribute('data-testid')));
  results.moreSwatchLabels = await (await page.$('[data-testid="style-swatches-more-row"]')).innerText().then(t=>t.replace(/\n/g,' | '));
  // editable check: click first swatch in more row
  const firstMore = await page.$('[data-testid="style-input-surface"]');
  results.surfaceSwatchClickable = !!firstMore;
  await shot(page, '2-style-colours-expanded-desktop');

  // ---------- Item 3: Formula functions ----------
  log('== Pricing formula ==');
  await page.click('[data-testid="editor-tab-build"]');
  await page.waitForTimeout(500);
  // ensure start section state doesn't block; scroll to calc panel
  await page.$('[data-testid="editor-calculations-panel"]').then(el=>el && el.scrollIntoViewIfNeeded());
  // expand first calc row
  const firstCalcToggle = await page.$('[data-testid^="calc-row-toggle-"]');
  let calcId = null;
  if (firstCalcToggle){
    const tid = await firstCalcToggle.getAttribute('data-testid');
    calcId = tid.replace('calc-row-toggle-','');
    await firstCalcToggle.click();
    await page.waitForTimeout(500);
  }
  results.calcId = calcId;
  // open insert menu
  let insertTrigger = await page.$(`[data-testid="calc-row-insert-trigger-${calcId}"]`);
  results.insertTriggerPresent = !!insertTrigger;
  if (insertTrigger){
    await insertTrigger.scrollIntoViewIfNeeded();
    await insertTrigger.click();
    await page.waitForTimeout(500);
  }
  const fnIds = await page.$$eval('[data-testid^="calc-row-insert-fn-"]', els=>els.map(e=>e.getAttribute('data-testid')));
  results.fnTestids = fnIds;
  results.hasMROUND = fnIds.some(x=>/-mround$/.test(x));
  results.hasCEILING = fnIds.some(x=>/-ceiling$/.test(x));
  results.hasFLOOR = fnIds.some(x=>/-floor$/.test(x));
  const menu = await page.$(`[data-testid="calc-row-insert-menu-${calcId}"]`);
  results.menuText = menu ? (await menu.innerText()).replace(/\n+/g,' ').slice(0,400) : null;
  await shot(page, '3-formula-fn-menu-desktop');

  results.consoleErrorsDesktop = [...consoleErrors];
  await ctxD.close();

  // ---------- MOBILE ----------
  log('== Mobile 390x844 ==');
  const ctxM = await browser.newContext({ viewport:{ width:390, height:844 }, isMobile:true });
  const mp = await ctxM.newPage();
  await setup(mp);
  await mp.goto(`${BASE}/wizard?template=driveway_paving`, { waitUntil:'networkidle' });
  await mp.waitForTimeout(1500);
  // Build panel may be in a bottom sheet on mobile; screenshot whatever renders
  await shot(mp, '1-build-default-mobile');
  results.consoleErrorsMobile = [...consoleErrors];
  await ctxM.close();

  // ---------- BLANK calc (start section open by default) ----------
  log('== Blank calc ==');
  const ctxB = await browser.newContext({ viewport:{ width:1440, height:900 } });
  const bp = await ctxB.newPage();
  await setup(bp);
  await bp.goto(`${BASE}/wizard`, { waitUntil:'networkidle' });
  await bp.waitForTimeout(1500);
  const blankStart = await bp.$('[data-testid="advanced-section-build-start"]');
  results.blankStartPresent = !!blankStart;
  results.blankStartOpenDefault = blankStart ? await blankStart.getAttribute('data-open') : 'NO_SECTION(maybe always-open/blank-landing)';
  results.blankAiCardVisible = await bp.isVisible('[data-testid="build-ai-card"]').catch(()=>false);
  await shot(bp, '1b-build-blank-desktop');
  results.consoleErrorsBlank = [...consoleErrors];
  await ctxB.close();

  await browser.close();
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  log('\n==== RESULTS ====');
  log(JSON.stringify(results, null, 2));
}
run().catch(e=>{ console.error('DRIVER FAIL', e); process.exit(1); });

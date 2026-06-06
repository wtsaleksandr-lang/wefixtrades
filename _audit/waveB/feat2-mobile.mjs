import { chromium, devices } from 'playwright';
const URL = 'http://localhost:5099/wizard?template=driveway_paving';
const OUT = '_audit/waveB';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  userAgent: devices['iPhone 13'].userAgent,
});
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
const log = (...a) => console.log(...a);

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2800);
async function dismiss(){ const b=page.locator('[data-testid="lead-modal-backdrop"]'); if(await b.count()&&await b.isVisible().catch(()=>false)){await page.keyboard.press('Escape');await page.waitForTimeout(250);} }

log('=== FEATURE 2 MOBILE (390x844) ===');
// Confirm bottom tab bar present and sheet folded
const barCount = await page.locator('.qq-bottom-tabbar').count();
const sheetOpen = await page.evaluate(()=>{
  const s=document.querySelector('[data-testid="quotequick-editor-shell"]');
  return s ? s.getAttribute('data-sheet-open') : null;
});
log('bottom-tabbar present:', barCount>0, '| sheet state attr:', sheetOpen);
await page.screenshot({ path: `${OUT}/m-00-initial.png` });

// state of bottom tabs BEFORE
function tabClasses(){ return page.evaluate(()=>[...document.querySelectorAll('.qq-bottom-tab')].map(b=>({t:b.getAttribute('data-testid'),c:b.className}))); }
log('tabs before:', JSON.stringify(await tabClasses()));

// CHECK 8 — tap a FIELD in the preview (material combobox) with sheet folded.
// Expect: the corresponding bottom-bar tab (build) PULSES (is-pulsing), sheet stays folded.
await dismiss();
const combo = page.locator('[data-testid="advanced-calculator"] [role="combobox"]').first();
await combo.scrollIntoViewIfNeeded();
// arm a poll to catch the transient is-pulsing class
await page.evaluate(()=>{window.__pulse=[];new MutationObserver(ms=>{for(const m of ms){const t=m.target;if(t.classList&&t.classList.contains('is-pulsing'))window.__pulse.push(t.getAttribute('data-testid'));}}).observe(document.body,{attributes:true,subtree:true,attributeFilter:['class']});});
await combo.tap();
await page.waitForTimeout(120);
// close the listbox if it opened, WITHOUT opening the sheet
await page.keyboard.press('Escape').catch(()=>{});
// capture pulse state quickly
await page.screenshot({ path: `${OUT}/m-08-tab-pulse.png` });
const pulseEvents = await page.evaluate(()=>window.__pulse||[]);
const sheetAfter = await page.evaluate(()=>{const s=document.querySelector('[data-testid="quotequick-editor-shell"]');return s?s.getAttribute('data-sheet-open'):null;});
log('[8] pulse events captured:', JSON.stringify(pulseEvents));
log('[8] tabs after field tap:', JSON.stringify(await tabClasses()));
log('[8] sheet state after tap:', sheetAfter, '(expect folded/null/false — NOT auto-opened)');

// Now open the build tab sheet → target field should be highlighted/scrolled
await page.locator('.qq-bottom-tab[data-testid="editor-tab-build"]').tap();
await page.waitForTimeout(700);
const hlAfterOpen = await page.evaluate(()=>{const e=document.querySelector('.qq-edit-highlight');return e?(e.getAttribute('data-testid')||e.className):null;});
log('[8] highlight after opening build sheet:', hlAfterOpen, '(expect field-row-material)');
const sheetOpenNow = await page.evaluate(()=>{const s=document.querySelector('[data-testid="quotequick-editor-shell"]');return s?s.getAttribute('data-sheet-open'):null;});
log('[8] sheet state after tapping build tab:', sheetOpenNow);
await page.screenshot({ path: `${OUT}/m-08b-sheet-open-highlight.png` });

// CHECK 9 — existing interactions still work.
// 9a: pencil title-edit
await dismiss();
log('--- [9] regression checks ---');
let pencilOk = false;
try {
  // close sheet first if open by tapping active tab again (toggle) — try fold
  const hint = page.locator('[data-testid="advanced-title-edit-hint"]');
  if (await hint.count()) { await hint.first().tap(); await page.waitForTimeout(400);
    const editing = await page.locator('[data-testid="preview-title-edit"]').count();
    pencilOk = editing>0; }
} catch(e){ log('pencil err', e.message); }
log('[9] pencil title-edit opens inline editor:', pencilOk);
await page.keyboard.press('Escape').catch(()=>{});
await page.screenshot({ path: `${OUT}/m-09a-pencil.png` });

// 9b: can still scroll the preview
const scrolled = await page.evaluate(()=>{
  const stage=document.querySelector('[data-testid="preview-stage"]')||document.scrollingElement;
  const before=window.scrollY; window.scrollBy(0,150); return {before,after:window.scrollY};
});
log('[9] preview scroll moved:', JSON.stringify(scrolled));

// 9c: selecting widget still works (tap bezel chrome → resize handles appear / widget selected)
await dismiss();
const widgetSelectable = await page.evaluate(()=>{
  return !!document.querySelector('[data-testid="preview-drag-handle"], [data-testid^="preview-resize-handle-"], [data-testid="preview-recenter-widget"]');
});
log('[9] widget select affordances exist:', widgetSelectable);

log('CONSOLE ERRORS:', JSON.stringify(errors));
await browser.close();

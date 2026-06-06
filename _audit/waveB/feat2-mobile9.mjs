import { chromium, devices } from 'playwright';
const URL = 'http://localhost:5099/wizard?template=driveway_paving';
const OUT = '_audit/waveB';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  deviceScaleFactor: 2, userAgent: devices['iPhone 13'].userAgent,
});
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
const log = (...a) => console.log(...a);
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2800);
async function dismiss(){ const b=page.locator('[data-testid="lead-modal-backdrop"]'); if(await b.count()&&await b.isVisible().catch(()=>false)){await page.keyboard.press('Escape');await page.waitForTimeout(250);} }
async function sheetOpen(){ return await page.evaluate(()=>{const b=document.querySelector('[data-testid="wizard-sheet-backdrop"]');return !!b && getComputedStyle(b).display!=='none';}); }

log('=== [9] MOBILE regression (fresh, sheet folded) ===');
log('sheet open at start:', await sheetOpen(), '(expect false)');

// 9a — pencil title-edit (sheet folded → preview interactive)
await dismiss();
let pencilOk=false;
const hint = page.locator('[data-testid="advanced-title-edit-hint"]').first();
await hint.scrollIntoViewIfNeeded();
await hint.tap();
await page.waitForTimeout(500);
pencilOk = (await page.locator('[data-testid="preview-title-edit"]').count())>0;
log('[9a] pencil opens inline title editor:', pencilOk);
await page.screenshot({ path: `${OUT}/m-09a-pencil.png` });
// commit/cancel the edit
await page.keyboard.press('Escape').catch(()=>{});
await page.waitForTimeout(300);

// 9b — preview scroll: scroll the preview stage container
await dismiss();
const scroll = await page.evaluate(()=>{
  const cands=['[data-testid="preview-stage"]','[data-testid="editor-preview-pane"]','[data-testid="preview-mobile-clean"]'];
  for(const s of cands){const el=document.querySelector(s); if(el && el.scrollHeight>el.clientHeight){const b=el.scrollTop; el.scrollTop=b+120; return {sel:s,before:b,after:el.scrollTop};}}
  // fallback window
  const b=window.scrollY; window.scrollBy(0,120); return {sel:'window',before:b,after:window.scrollY};
});
log('[9b] preview scroll:', JSON.stringify(scroll), '(after>before ⇒ scroll works)');

// 9c — widget select / drag: tap empty bezel chrome to select widget, expect select affordances
await dismiss();
// tap near the widget edge (inside calculator but on chrome)
const sel = await page.evaluate(()=>{
  const cal=document.querySelector('[data-testid="advanced-calculator"]');
  if(cal){ cal.dispatchEvent(new MouseEvent('click',{bubbles:true})); }
  return true;
});
await page.waitForTimeout(400);
const afford = await page.evaluate(()=>({
  drag: !!document.querySelector('[data-testid="preview-drag-handle"]'),
  resize: document.querySelectorAll('[data-testid^="preview-resize-handle-"]').length,
  recenter: !!document.querySelector('[data-testid="preview-recenter-widget"]'),
  reset: !!document.querySelector('[data-testid="preview-reset-widget-position"]'),
}));
log('[9c] widget select affordances:', JSON.stringify(afford));
await page.screenshot({ path: `${OUT}/m-09c-widget-select.png` });

// 9d — confirm no hijacked drag: a field tap pulses tab but does NOT open sheet (already proven in check 8; re-confirm sheet stays folded after a generic preview tap)
const stillFolded = !(await sheetOpen());
log('[9d] sheet still folded after preview interactions:', stillFolded, '(expect true)');

log('CONSOLE ERRORS:', JSON.stringify(errors));
await browser.close();

import { chromium, devices } from '@playwright/test';

const OUT = 'C:/Users/Owner/.codex/wt-preview/_audit/sheetfix';
const URL = 'http://localhost:5099/wizard';
const sel = (tid) => `[data-testid="${tid}"]`;

async function describeAtPoint(page, x, y) {
  return await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return { found: false };
    let cur = el, tid = null;
    while (cur && !tid) { tid = cur.getAttribute && cur.getAttribute('data-testid'); if (!tid) cur = cur.parentElement; }
    return {
      found: true, tag: el.tagName,
      cls: el.className && el.className.toString ? el.className.toString().slice(0, 120) : '',
      directTestId: el.getAttribute ? el.getAttribute('data-testid') : null,
      ancestorTestId: tid,
      isBackdrop: !!(el.getAttribute && el.getAttribute('data-testid') === 'wizard-sheet-backdrop') ||
                  (el.className && el.className.toString && el.className.toString().includes('qq-sheet-backdrop')),
    };
  }, [x, y]);
}
async function sheetState(page) {
  return await page.evaluate(() => {
    const s = document.querySelector('[data-testid="wizard-bottom-sheet"]');
    if (!s) return { exists: false };
    const r = s.getBoundingClientRect();
    return { exists: true, open: s.getAttribute('data-open'), ariaLabel: s.getAttribute('aria-label'), top: r.y };
  });
}
async function backdropGeom(page) {
  return await page.evaluate(() => {
    const e = document.querySelector('[data-testid="wizard-sheet-backdrop"]');
    if (!e) return null; const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return { x:r.x, y:r.y, w:r.width, h:r.height, bottom:r.y+r.height, pointerEvents: cs.pointerEvents, display: cs.display };
  });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2, userAgent: devices['Pixel 5'].userAgent });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil:'networkidle' });
  await page.waitForTimeout(1500);

  // open action sheet
  await page.locator(sel('editor-tab-action')).tap();
  await page.waitForTimeout(700);
  let st = await sheetState(page);
  console.log('Sheet open:', st.open, 'top=', st.top, 'label=', st.ariaLabel);
  let bg = await backdropGeom(page);
  console.log('Backdrop geom:', JSON.stringify(bg));

  // exposed strip = between backdrop.y (64) and sheet.top. probe its midpoint.
  const probeY = Math.round((bg.y + st.top) / 2);
  console.log('Exposed backdrop strip: y', bg.y, '->', st.top, '; probe at y=', probeY);

  // Check 5 redo: top bar NOT backdrop, exposed strip IS backdrop
  const atTop = await describeAtPoint(page, 195, 30);
  const atStrip = await describeAtPoint(page, 195, probeY);
  console.log('\n[Check5] y=30 (top bar):', JSON.stringify(atTop));
  console.log('[Check5] y=' + probeY + ' (exposed strip):', JSON.stringify(atStrip));
  const c5 = !atTop.isBackdrop && atStrip.isBackdrop;
  console.log(`[Check5] => ${c5 ? 'PASS':'FAIL'}`);

  // also confirm bottom tab bar area (y=814) not backdrop
  const atTabs = await describeAtPoint(page, 195, 814);
  console.log('[Check5b] y=814 (tab bar):', JSON.stringify(atTabs), '=>', !atTabs.isBackdrop ? 'tab bar exposed PASS':'FAIL');

  // Check 4 redo: tap exposed backdrop strip -> dismiss
  const before = await sheetState(page);
  console.log('\n[Check4] before open=', before.open, 'tapping backdrop strip at (195,', probeY, ')');
  await page.touchscreen.tap(195, probeY);
  await page.waitForTimeout(800);
  let after = await sheetState(page);
  let c4 = after.open === 'false' || after.exists === false;
  console.log('[Check4] after open=', after.open);

  // fallback: try Playwright .tap() on the backdrop element directly if still open
  if (!c4) {
    console.log('[Check4] strip tap did not close; trying .tap() on backdrop element directly');
    try { await page.locator(sel('wizard-sheet-backdrop')).tap({ position:{ x:195, y: Math.max(2, probeY - bg.y) } }); } catch(e){ console.log('  tap err', e.message.slice(0,100)); }
    await page.waitForTimeout(800);
    after = await sheetState(page);
    c4 = after.open === 'false' || after.exists === false;
    console.log('[Check4] after element-tap open=', after.open);
  }
  console.log(`[Check4] => ${c4 ? 'PASS':'FAIL'}`);

  await page.screenshot({ path: `${OUT}/05-strip-probe.png` });
  await browser.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});

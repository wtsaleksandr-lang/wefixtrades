import { chromium, devices } from '@playwright/test';

const OUT = 'C:/Users/Owner/.codex/wt-preview/_audit/sheetfix';
const URL = 'http://localhost:5099/wizard';

const results = [];
function rec(n, pass, evidence) {
  results.push({ n, pass, evidence });
  console.log(`\n[${pass ? 'PASS' : 'FAIL'}] ${n}\n   ${evidence}`);
}

const sel = (tid) => `[data-testid="${tid}"]`;

async function describeAtPoint(page, x, y) {
  return await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return { found: false };
    // climb to find a data-testid
    let cur = el, tid = null;
    while (cur && !tid) { tid = cur.getAttribute && cur.getAttribute('data-testid'); if (!tid) cur = cur.parentElement; }
    return {
      found: true,
      tag: el.tagName,
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
    return {
      exists: true,
      open: s.getAttribute('data-open'),
      ariaLabel: s.getAttribute('aria-label'),
      text: (s.innerText || '').slice(0, 200).replace(/\s+/g, ' '),
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    userAgent: devices['Pixel 5'].userAgent,
  });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('   [console.error]', m.text().slice(0,160)); });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // ---- Check 1: open a panel sheet via bottom tab ----
  const actionTab = page.locator(sel('editor-tab-action'));
  let c1pass = false, c1ev = '';
  try {
    await actionTab.waitFor({ state: 'visible', timeout: 8000 });
    await actionTab.tap();
    await page.waitForTimeout(700);
    const st = await sheetState(page);
    c1pass = st.exists && st.open === 'true';
    c1ev = `sheet exists=${st.exists}, data-open=${st.open}, aria-label="${st.ariaLabel}"`;
  } catch (e) { c1ev = 'error: ' + e.message.slice(0, 160); }
  rec('1. Open panel sheet via editor-tab-action', c1pass, c1ev);
  await page.screenshot({ path: `${OUT}/01-sheet-open.png` });

  // geometry of style tab + publish + sheet for point math
  const geom = await page.evaluate(() => {
    const g = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width/2, cy: r.y + r.height/2 }; };
    return {
      styleTab: g('[data-testid="editor-tab-style"]'),
      publish: g('[data-testid="quotequick-publish"]'),
      sheet: g('[data-testid="wizard-bottom-sheet"]'),
      backdrop: g('[data-testid="wizard-sheet-backdrop"]'),
      vw: window.innerWidth, vh: window.innerHeight,
    };
  });
  console.log('\n   GEOM:', JSON.stringify(geom));

  // ---- Check 2: bottom tab bar reachable (not covered by backdrop), and switches panel ----
  let c2pass = false, c2ev = '';
  if (geom.styleTab) {
    const hit = await describeAtPoint(page, geom.styleTab.cx, geom.styleTab.cy);
    const reachable = hit.found && !hit.isBackdrop && (hit.ancestorTestId === 'editor-tab-style' || hit.directTestId === 'editor-tab-style');
    const beforeLabel = (await sheetState(page)).ariaLabel;
    let switched = false, afterLabel = '';
    try {
      await page.locator(sel('editor-tab-style')).tap();
      await page.waitForTimeout(700);
      const after = await sheetState(page);
      afterLabel = after.ariaLabel;
      switched = after.open === 'true' && (/(style)/i.test(after.ariaLabel || '') || /(style)/i.test(after.text || '') || (afterLabel !== beforeLabel));
    } catch (e) { afterLabel = 'tap-error: ' + e.message.slice(0,100); }
    c2pass = reachable && switched;
    c2ev = `elementFromPoint@styleTab(${geom.styleTab.cx.toFixed(0)},${geom.styleTab.cy.toFixed(0)})=> tag=${hit.tag} testid=${hit.ancestorTestId||hit.directTestId} isBackdrop=${hit.isBackdrop}; reachable=${reachable}; before="${beforeLabel}" after="${afterLabel}" switched=${switched}`;
  } else c2ev = 'editor-tab-style not found';
  rec('2. Bottom tab (Style) reachable + switches panel', c2pass, c2ev);
  await page.screenshot({ path: `${OUT}/02-style-tab.png` });

  // ---- Check 3: top-bar Publish reachable (not backdrop) ----
  let c3pass = false, c3ev = '';
  if (geom.publish) {
    const hit = await describeAtPoint(page, geom.publish.cx, geom.publish.cy);
    c3pass = hit.found && !hit.isBackdrop && (hit.ancestorTestId === 'quotequick-publish' || hit.directTestId === 'quotequick-publish');
    c3ev = `elementFromPoint@publish(${geom.publish.cx.toFixed(0)},${geom.publish.cy.toFixed(0)})=> tag=${hit.tag} testid=${hit.ancestorTestId||hit.directTestId} isBackdrop=${hit.isBackdrop}`;
  } else c3ev = 'quotequick-publish not found';
  rec('3. Top-bar Publish reachable (on top of backdrop)', c3pass, c3ev);

  // ---- Check 5 (do before 4 since 4 closes the sheet): backdrop zone confined ----
  // re-confirm a sheet is open
  let openNow = (await sheetState(page)).open;
  if (openNow !== 'true') { try { await actionTab.tap(); await page.waitForTimeout(600); } catch {} }
  const atTop = await describeAtPoint(page, 195, 30);
  const atPreview = await describeAtPoint(page, 195, 300);
  const c5pass = !atTop.isBackdrop && atPreview.isBackdrop;
  const c5ev = `y=30 (top-bar)=> testid=${atTop.ancestorTestId||atTop.directTestId} isBackdrop=${atTop.isBackdrop} | y=300 (preview)=> testid=${atPreview.ancestorTestId||atPreview.directTestId} cls=${atPreview.cls} isBackdrop=${atPreview.isBackdrop}`;
  rec('5. Backdrop confined to preview (not over 64px top bar)', c5pass, c5ev);

  // ---- Check 4: backdrop tap in preview zone dismisses sheet ----
  let c4pass = false, c4ev = '';
  const beforeClose = await sheetState(page);
  if (beforeClose.open !== 'true') {
    try { await actionTab.tap(); await page.waitForTimeout(600); } catch {}
  }
  try {
    await page.touchscreen.tap(195, 300);
    await page.waitForTimeout(700);
    const after = await sheetState(page);
    c4pass = after.open === 'false' || after.exists === false;
    c4ev = `before data-open=${beforeClose.open}; tapped backdrop (195,300); after data-open=${after.open} exists=${after.exists}`;
  } catch (e) { c4ev = 'error: ' + e.message.slice(0,160); }
  rec('4. Backdrop tap in preview zone dismisses sheet', c4pass, c4ev);
  await page.screenshot({ path: `${OUT}/04-after-dismiss.png` });

  // summary
  console.log('\n==================== SUMMARY ====================');
  const order = [1,2,3,4,5];
  for (const i of order) { const r = results.find(x => x.n.startsWith(i + '.')); console.log(`Check ${i}: ${r ? (r.pass ? 'PASS' : 'FAIL') : '??'}`); }
  const all = results.every(r => r.pass);
  console.log(`\nOVERALL: ${all ? 'ALL PASS' : 'SOME FAIL'}`);

  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });

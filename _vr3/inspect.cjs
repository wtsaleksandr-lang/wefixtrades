const { chromium } = require('playwright');
const URL = 'http://localhost:5099/wizard';

(async () => {
  const browser = await chromium.launch();
  for (const profile of ['desktop','mobile']) {
    const ctxOpts = profile === 'desktop'
      ? { viewport: { width: 1440, height: 900 } }
      : { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    console.log(`\n##### ${profile} #####`);
    // list editor tabs
    const tabs = await page.locator('[data-testid^="editor-tab-"]').evaluateAll(els =>
      els.map(e => ({ tid: e.getAttribute('data-testid'), cls: e.className, vis: !!(e.offsetWidth||e.offsetHeight), selected: e.getAttribute('aria-selected') })));
    console.log('TABS:', JSON.stringify(tabs));
    // backdrop present at load?
    const bd = await page.locator('[data-testid="wizard-sheet-backdrop"]').count();
    console.log('backdrop count at load:', bd);
    // click style tab via JS to bypass interception
    const styleTab = page.locator('[data-testid="editor-tab-style"]');
    if (await styleTab.count()) {
      await styleTab.first().dispatchEvent('click');
      await page.waitForTimeout(800);
      const panel = await page.locator('[data-testid="editor-tabpanel-style"]').count();
      console.log('style panel after click:', panel);
      // what does the advanced toggle look like?
      const adv = await page.locator('text=/Advanced/i').evaluateAll(els =>
        els.map(e => ({ tag: e.tagName, role: e.getAttribute('role'), cls: e.className, txt: (e.textContent||'').trim().slice(0,40) })));
      console.log('ADVANCED matches:', JSON.stringify(adv));
      // backdrop after open
      console.log('backdrop after style open:', await page.locator('[data-testid="wizard-sheet-backdrop"]').count(),
        'visible:', await page.locator('[data-testid="wizard-sheet-backdrop"]').first().isVisible().catch(()=>false));
    }
    await ctx.close();
  }
  await browser.close();
})();

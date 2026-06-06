const { chromium } = require('playwright');
const path = require('path');
const DIR = 'C:/Users/Owner/.codex/wt-preview/_vr3';
const URL = 'http://localhost:5099/wizard';

const CFG = {
  style: { tab:'editor-tab-style', panel:'editor-tabpanel-style',
    advFirst:'style-group-layout', advLast:'style-group-floating-launcher' },
  settings: { tab:'editor-tab-settings', panel:'editor-tabpanel-settings',
    advFirst:'settings-group-pricing', advLast:'settings-group-business-profile' },
};

(async () => {
  const browser = await chromium.launch();
  for (const profile of ['desktop','mobile']) {
    const ctxOpts = profile === 'desktop'
      ? { viewport:{width:1440,height:900} }
      : { viewport:{width:412,height:915}, deviceScaleFactor:2, isMobile:true, hasTouch:true };
    for (const [name,c] of Object.entries(CFG)) {
      const ctx = await browser.newContext(ctxOpts);
      const page = await ctx.newPage();
      await page.goto(URL,{waitUntil:'networkidle'});
      await page.waitForTimeout(1200);
      await page.locator(`[data-testid="${c.tab}"]`).first().dispatchEvent('click');
      await page.waitForTimeout(800);
      // expand advanced
      const lbl = page.locator('.qq-adv-toggle-label');
      const btn = page.locator('.qq-adv-toggle, button:has(.qq-adv-toggle-label)');
      const target = (await btn.count())? btn.first(): lbl.first();
      await target.dispatchEvent('click');
      await page.waitForTimeout(800);
      // scroll first advanced group into view + shot
      const first = page.locator(`[data-testid="${c.advFirst}"]`);
      await first.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(DIR, `${profile}-${name}-adv-first.png`) });
      // scroll last advanced group into view + shot
      const last = page.locator(`[data-testid="${c.advLast}"]`);
      await last.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(DIR, `${profile}-${name}-adv-last.png`) });
      // capture bounding boxes of all adv groups to detect empty/zero-height sections
      const boxes = await page.evaluate(() => {
        const out = {};
        document.querySelectorAll('[data-testid^="style-group-"],[data-testid^="settings-group-"]').forEach(el => {
          const b = el.getBoundingClientRect();
          out[el.getAttribute('data-testid')] = { w: Math.round(b.width), h: Math.round(b.height) };
        });
        return out;
      });
      console.log(`\n## ${profile}/${name} adv group boxes (w x h):`);
      for (const [k,v] of Object.entries(boxes)) console.log(`  ${k}: ${v.w}x${v.h}${v.h<8?'  <-- SUSPECT EMPTY':''}`);
      await ctx.close();
    }
  }
  await browser.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});

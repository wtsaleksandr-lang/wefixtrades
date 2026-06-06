import { chromium } from 'playwright';
const URL = 'http://localhost:5099/wizard?template=driveway_paving';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const combo = page.locator('[data-testid="advanced-calculator"] [role="combobox"]').first();
await combo.click();
await page.waitForTimeout(500);
const opts = await page.evaluate(() => {
  const o = [...document.querySelectorAll('[role="option"]')].map((e) => ({ txt: (e.textContent||'').trim(), val: e.getAttribute('data-value') || e.getAttribute('value'), testid: e.getAttribute('data-testid') }));
  return o;
});
console.log('LISTBOX OPTIONS:', JSON.stringify(opts, null, 2));
await browser.close();

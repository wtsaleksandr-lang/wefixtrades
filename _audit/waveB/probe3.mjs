import { chromium } from 'playwright';
const URL = 'http://localhost:5099/wizard?template=driveway_paving';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const info = await page.evaluate(() => {
  const cal = document.querySelector('[data-testid="advanced-calculator"]');
  const cells = [...cal.querySelectorAll('[data-colspan]')];
  return cells.map((c, i) => {
    const controls = [...c.querySelectorAll('button,select,input,[role="combobox"],[role="button"],[role="switch"],[role="radio"],[role="option"],[role="slider"]')]
      .map((el) => ({ tag: el.tagName, role: el.getAttribute('role'), testid: el.getAttribute('data-testid'), txt: (el.textContent||'').trim().slice(0,30), type: el.getAttribute('type') }));
    return { idx: i, label: (c.textContent||'').trim().slice(0,40), controls };
  });
});
console.log(JSON.stringify(info, null, 2));
await browser.close();

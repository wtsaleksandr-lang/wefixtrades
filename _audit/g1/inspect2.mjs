import { chromium } from 'playwright-core';
const BASE = 'http://localhost:5099';
const TEMPLATES = ['car_towing','driveway_paving','property_cleaning','energy_upgrade','landscaping'];
const browser = await chromium.launch();
for (const tpl of TEMPLATES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/templates/${tpl}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3500);
  const info = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[data-testid="advanced-calculator"]')];
    return els.map(e => {
      const r = e.getBoundingClientRect();
      // find a heading-ish text inside
      const h = e.querySelector('h1,h2,h3,[class*="title" i],[class*="header" i]');
      return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), firstText: (e.textContent||'').trim().slice(0,50) };
    });
  });
  console.log(tpl, '-> count:', info.length, JSON.stringify(info));
  await ctx.close();
}
await browser.close();

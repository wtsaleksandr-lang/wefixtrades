import { chromium } from 'playwright-core';

const BASE = 'http://localhost:5099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/templates/car_towing`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);

const info = await page.evaluate(() => {
  const out = [];
  // find elements that look like the calculator widget
  const sels = ['[class*="calculator" i]','[class*="Calculator"]','[data-testid]','[class*="widget" i]','[class*="quote-widget" i]','[class*="embed" i]'];
  const found = new Set();
  for (const s of sels) document.querySelectorAll(s).forEach(e => found.add(e));
  for (const e of found) {
    const r = e.getBoundingClientRect();
    if (r.width < 150 || r.height < 100) continue;
    out.push({
      tag: e.tagName.toLowerCase(),
      cls: (e.className && e.className.toString().slice(0,80)) || '',
      testid: e.getAttribute('data-testid') || '',
      w: Math.round(r.width), h: Math.round(r.height),
      inputs: e.querySelectorAll('input,select,button').length,
    });
  }
  return out;
});
console.log(JSON.stringify(info, null, 2));
await browser.close();

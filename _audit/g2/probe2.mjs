import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto('http://localhost:5099/templates/gutter_cleaning', { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForSelector('[class*="qq-widget"]', { timeout: 20000 });
await page.waitForTimeout(2500);
const info = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('[class*="qq-widget"], [class^="advcalc-"]')) {
    const c = (el.className||'').toString();
    // only roots (no suffix)
    const r = el.getBoundingClientRect();
    out.push({ cls: c.slice(0,40), w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y), disp: getComputedStyle(el).display, pos: getComputedStyle(el).position });
  }
  return out;
});
console.log(JSON.stringify(info.slice(0,30), null, 1));
await browser.close();

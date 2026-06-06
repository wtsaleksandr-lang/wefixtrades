import { chromium } from 'playwright';
const base = 'http://localhost:5099';
const id = process.argv[2] || 'plumbing_service';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${base}/templates/${id}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

const info = await page.evaluate(() => {
  const widgets = [...document.querySelectorAll('.qq-widget-0')];
  return widgets.map((w, i) => {
    const r = w.getBoundingClientRect();
    const adv = w.querySelector('[class^="advcalc-"]');
    const heads = [...w.querySelectorAll('h1,h2,h3,h4')].map(h=>h.textContent.trim()).slice(0,3);
    const inputs = w.querySelectorAll('input,select,textarea').length;
    return { i, top: Math.round(r.top + window.scrollY), h: Math.round(r.height), advCls: adv?.className||'', heads, inputs };
  });
});
console.log(JSON.stringify(info, null, 2));
await browser.close();

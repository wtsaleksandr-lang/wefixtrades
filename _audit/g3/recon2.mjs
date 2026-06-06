import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:5099/templates/house_renovation', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3000);
const data = await p.evaluate(() => {
  const calcs = [...document.querySelectorAll('[data-testid="advanced-calculator"]')];
  return calcs.map((el, i) => {
    const r = el.getBoundingClientRect();
    // climb ancestors to find a rail/card context
    let inRail = false, ctx = '';
    let cur = el;
    for (let k = 0; k < 8 && cur; k++) {
      const c = (cur.className?.toString?.() || '');
      const tid = cur.getAttribute?.('data-testid') || '';
      if (/rail|tpl-card|template-rail/.test(c + tid)) { inRail = true; ctx = c + ' ' + tid; break; }
      cur = cur.parentElement;
    }
    const title = el.querySelector('[data-testid="advanced-title"]')?.innerText || '';
    return { i, title, inRail, ctx: ctx.slice(0, 60), top: Math.round(r.top + window.scrollY), w: Math.round(r.width) };
  });
});
console.log(JSON.stringify(data, null, 2));
await b.close();

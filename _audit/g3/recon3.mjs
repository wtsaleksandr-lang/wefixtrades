import { chromium } from 'playwright';
const ids = ['house_renovation', 'deep_home_cleaning', 'move_out_cleaning', 'office_cleaning', 'window_cleaning_quote'];
const b = await chromium.launch();
for (const id of ids) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  let ok = true;
  try {
    await p.goto('http://localhost:5099/templates/' + id, { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch (e) { ok = false; }
  await p.waitForTimeout(2500);
  const main = await p.evaluate(() => {
    const calcs = [...document.querySelectorAll('[data-testid="advanced-calculator"]')];
    const list = calcs.map(el => {
      let inRail = false, cur = el;
      for (let k = 0; k < 8 && cur; k++) {
        const c = (cur.className?.toString?.() || '') + (cur.getAttribute?.('data-testid') || '');
        if (/rail|tpl-card/.test(c)) { inRail = true; break; }
        cur = cur.parentElement;
      }
      const r = el.getBoundingClientRect();
      return { title: el.querySelector('[data-testid="advanced-title"]')?.innerText || '', inRail, w: Math.round(r.width) };
    });
    return list.filter(x => !x.inRail);
  });
  console.log(id, '=>', ok ? JSON.stringify(main) : 'NAV_FAIL');
  await p.close();
}
await b.close();

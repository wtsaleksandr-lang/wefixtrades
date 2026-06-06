import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto('http://localhost:5099/templates/office_cleaning', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2800);
const info = await p.evaluate(() => {
  const els = [...document.querySelectorAll('*')].filter(e => (e.childNodes.length === 1 && e.childNodes[0].nodeType === 3 && (e.textContent || '').trim() === 'Business hours'));
  return els.map(el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    // is it inside a selected/active option?
    let anc = '';
    let cur = el; for (let k = 0; k < 5 && cur; k++) { anc += cur.tagName + '[' + (cur.getAttribute('data-testid') || cur.className?.toString?.()?.slice(0, 30) || '') + '] aria-checked=' + (cur.getAttribute('aria-checked') || cur.getAttribute('data-selected') || '') + ' > '; cur = cur.parentElement; }
    return { color: cs.color, bg: cs.backgroundColor, fontSize: cs.fontSize, top: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height), anc };
  });
});
console.log(JSON.stringify(info, null, 2));
await b.close();

import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:5099/templates/house_renovation', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3000);
const info = await p.evaluate(() => {
  const out = [];
  document.querySelectorAll('[class*="calc"],[class*="Calc"],[class*="widget"],[class*="Widget"],[data-testid],[class*="step"],[class*="Step"]').forEach(el => {
    const c = el.className?.toString?.() || '';
    out.push(el.tagName + ' | ' + c.slice(0, 90) + ' | testid=' + (el.getAttribute('data-testid') || ''));
  });
  return out.slice(0, 80);
});
console.log(info.join('\n'));
console.log('--- body height', await p.evaluate(() => document.body.scrollHeight));
console.log('--- buttons', await p.evaluate(() => [...document.querySelectorAll('button')].map(b => (b.innerText || '').trim().slice(0, 40)).filter(Boolean).slice(0, 40).join(' || ')));
await b.close();

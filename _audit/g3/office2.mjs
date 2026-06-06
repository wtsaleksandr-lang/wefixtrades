import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto('http://localhost:5099/templates/office_cleaning', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2800);
// find the button containing "Business hours" and dump its group siblings
const data = await p.evaluate(() => {
  let target = null;
  document.querySelectorAll('button').forEach(btn => { if ((btn.innerText || '').trim().toLowerCase().includes('business hours')) target = btn; });
  if (!target) return { err: 'not found' };
  const group = target.parentElement;
  const sibs = [...group.children].filter(c => c.tagName === 'BUTTON');
  return {
    target: { color: getComputedStyle(target.querySelector('span') || target).color, btnBg: getComputedStyle(target).backgroundColor, text: target.innerText.trim().slice(0,40), selected: target.getAttribute('aria-pressed') || target.getAttribute('data-state') || target.className?.toString?.() },
    sibs: sibs.map(s => ({ text: (s.innerText || '').trim().slice(0, 25), btnBg: getComputedStyle(s).backgroundColor, spanColor: getComputedStyle(s.querySelector('span') || s).color, cls: (s.className?.toString?.() || '').slice(0, 40) }))
  };
});
console.log(JSON.stringify(data, null, 2));
// screenshot the main widget result/cta region
const box = await p.evaluate(() => {
  const cs=[...document.querySelectorAll('[data-testid="advanced-calculator"]')];let w=null;
  for(const el of cs){let ir=false,c=el;for(let k=0;k<8&&c;k++){const n=(c.className?.toString?.()||'')+(c.getAttribute?.('data-testid')||'');if(/rail|tpl-card/.test(n)){ir=true;break;}c=c.parentElement;}if(!ir){w=el;break;}}
  if(!w)return null;w.scrollIntoView();const r=w.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};
});
await p.waitForTimeout(400);
await p.screenshot({ path: 'C:/Users/Owner/.codex/wt-preview/_audit/g3/office_cleaning_inspect.png', clip: box });
await b.close();

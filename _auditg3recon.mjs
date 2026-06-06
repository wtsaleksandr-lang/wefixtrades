import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900} });
await p.goto('http://localhost:5099/templates/house_renovation', { waitUntil:'networkidle' });
await p.waitForTimeout(1500);
// dump candidate widget containers
const info = await p.evaluate(()=>{
  const out = [];
  document.querySelectorAll('[class*="calc"],[class*="Calc"],[class*="widget"],[class*="Widget"],[data-testid]').forEach(el=>{
    const c = el.className?.toString?.()||''; 
    out.push((el.tagName)+' | '+c.slice(0,80)+' | testid='+(el.getAttribute('data-testid')||''));
  });
  return out.slice(0,60);
});
console.log(info.join('\n'));
console.log('--- page height', await p.evaluate(()=>document.body.scrollHeight));
await b.close();

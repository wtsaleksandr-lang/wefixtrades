import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900} });
await p.goto('http://localhost:5099/templates/roof_repair', {waitUntil:'domcontentloaded', timeout:60000});
try { await p.waitForSelector('[data-testid="advanced-calculator"]', {timeout:20000}); } catch(e){ console.log('no testid found'); }
await p.waitForTimeout(2000);
const info = await p.evaluate(()=>{
  const els=[...document.querySelectorAll('[data-testid="advanced-calculator"]')];
  return els.map(e=>{const r=e.getBoundingClientRect(); return {w:Math.round(r.width),h:Math.round(r.height)};});
});
console.log('advanced-calculator count:', info.length);
console.log(JSON.stringify(info));
// also probe radio-like elements in the largest
const radios = await p.evaluate(()=>{
  const els=[...document.querySelectorAll('[data-testid="advanced-calculator"]')];
  if(!els.length) return 'none';
  els.sort((a,b)=>b.getBoundingClientRect().width-a.getBoundingClientRect().width);
  const big=els[0];
  const btns=[...big.querySelectorAll('button, [role=radio], label, input[type=radio]')];
  return {bigW:Math.round(big.getBoundingClientRect().width), candidates:btns.length, sample:btns.slice(0,8).map(x=>x.tagName+':'+(x.getAttribute('role')||'')+':'+(x.textContent||'').trim().slice(0,20))};
});
console.log('radio probe:', JSON.stringify(radios,null,1));
await b.close();

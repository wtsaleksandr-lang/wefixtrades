import { chromium } from 'playwright';
const BASE='http://localhost:5099';
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:1440,height:900}});
const page=await ctx.newPage();
await page.goto(`${BASE}/templates/tree_service`,{waitUntil:'domcontentloaded'});
await page.waitForTimeout(2500);
const info=await page.evaluate(()=>{
  // find the range slider (calculator-specific) and the $price text, climb to common card
  const range=document.querySelector('[type="range"],[role="slider"]');
  // find element whose text contains a $ price
  let priceEl=null;
  document.querySelectorAll('*').forEach(el=>{ if(!priceEl){ const t=el.childNodes.length?Array.from(el.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent).join(''):''; if(/\$\d/.test(t) && el.getBoundingClientRect().y<1300) priceEl=el; } });
  function box(el){if(!el)return null;const r=el.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),y:Math.round(r.y+window.scrollY),x:Math.round(r.x),cls:(el.className||'').toString().slice(0,70),tag:el.tagName};}
  function lca(a,b){ if(!a||!b)return null; const anc=new Set(); let x=a; while(x){anc.add(x);x=x.parentElement;} let y=b; while(y&&!anc.has(y))y=y.parentElement; return y; }
  const root=lca(range,priceEl);
  const chain=[]; let n=root; for(let i=0;i<5&&n;i++){chain.push(box(n));n=n.parentElement;}
  return {range:box(range), priceEl:box(priceEl), lca:box(root), chainUp:chain};
});
console.log(JSON.stringify(info,null,2));
await browser.close();

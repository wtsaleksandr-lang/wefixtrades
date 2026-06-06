import { chromium } from 'playwright';
const BASE='http://localhost:5099';
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:1440,height:900}});
const page=await ctx.newPage();
await page.goto(`${BASE}/templates/tree_service`,{waitUntil:'domcontentloaded'});
await page.waitForTimeout(2500);
const info=await page.evaluate(()=>{
  const ctrls=Array.from(document.querySelectorAll('input,select,button,[role="radio"],[type="range"]'));
  // lowest common ancestor of first 6 controls in the upper part of page
  const upper=ctrls.filter(c=>{const r=c.getBoundingClientRect();return r.y+window.scrollY < 1200 && r.width>0;});
  function lca(nodes){ if(!nodes.length)return null; let a=nodes[0]; for(let i=1;i<nodes.length;i++){ let b=nodes[i]; const anc=new Set(); let x=a; while(x){anc.add(x);x=x.parentElement;} let y=b; while(y && !anc.has(y)) y=y.parentElement; a=y; } return a; }
  const root=lca(upper);
  function box(el){const r=el.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),y:Math.round(r.y+window.scrollY),x:Math.round(r.x),cls:(el.className||'').toString().slice(0,60),tag:el.tagName};}
  // walk up from root a few levels
  const chain=[]; let n=root; for(let i=0;i<6&&n;i++){chain.push(box(n));n=n.parentElement;}
  return {upperCount:upper.length, root:root?box(root):null, chain};
});
console.log(JSON.stringify(info,null,2));
await browser.close();

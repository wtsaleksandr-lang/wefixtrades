import { chromium } from 'playwright';
const BASE='http://localhost:5099';
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:1440,height:900}});
const page=await ctx.newPage();
await page.goto(`${BASE}/templates/tree_service`,{waitUntil:'domcontentloaded'});
await page.waitForTimeout(2500);
const info=await page.evaluate(()=>{
  const out=[];
  document.querySelectorAll('[class*="alculator"]').forEach(el=>{
    const r=el.getBoundingClientRect();
    out.push({cls:el.className.toString().slice(0,80), tag:el.tagName, w:Math.round(r.width), h:Math.round(r.height), y:Math.round(r.y+window.scrollY)});
  });
  // also look for likely widget root: data attributes, iframe
  const ifr=Array.from(document.querySelectorAll('iframe')).map(f=>({src:f.src,w:f.clientWidth,h:f.clientHeight}));
  // controls clusters
  const inputs=document.querySelectorAll('input,select,[role="radio"],[type="range"]').length;
  return {calc:out, iframes:ifr, totalInputs:inputs};
});
console.log(JSON.stringify(info,null,2));
await browser.close();

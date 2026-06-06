import { chromium } from 'playwright';
const BASE='http://localhost:5099';
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1440,height:900}});const p=await ctx.newPage();
 await p.goto(`${BASE}/wizard`,{waitUntil:'domcontentloaded'});await p.waitForTimeout(1500);
 await p.evaluate(()=>{const x=[...document.querySelectorAll('button,a,[role=tab]')].find(e=>/^build$/i.test(e.textContent.trim()));if(x)x.click();});await p.waitForTimeout(700);
 await p.evaluate(()=>{const x=[...document.querySelectorAll('button,a')].find(e=>/browse all/i.test(e.textContent));if(x)x.click();});await p.waitForTimeout(1200);
 // The modal grid card NAME label is the bold text rendered in the white area below each preview.
 const r=await p.evaluate(()=>{
  const modal=document.querySelector('[role="dialog"],[class*="modal"],[class*="Modal"]');
  // grid cards = direct children of the scrollable grid with role/button
  const grid=[...modal.querySelectorAll('*')].find(e=>{const cs=getComputedStyle(e);return cs.display==='grid'&&e.children.length>=10;});
  if(!grid)return{found:false};
  const cards=[...grid.children];
  // name = last non-empty short text line in each card
  const names=cards.map(c=>{const lines=c.innerText.split('\n').map(s=>s.trim()).filter(Boolean);return lines[lines.length-1];});
  const m={};names.forEach(n=>m[n]=(m[n]||0)+1);
  return{found:true,gridDisplay:getComputedStyle(grid).display,gridCols:getComputedStyle(grid).gridTemplateColumns,cardCount:cards.length,uniqueNames:new Set(names).size,dupes:Object.entries(m).filter(([k,v])=>v>1)};
 });
 console.log(JSON.stringify(r,null,1));
 await ctx.close();await b.close();
})().catch(e=>{console.error(e);process.exit(1);});

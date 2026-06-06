import { chromium } from 'playwright';
import fs from 'fs';
const BASE='http://localhost:5099'; const OUT='C:/Users/Owner/.codex/wt-preview/_hunt';
const log=[];const L=s=>{console.log(s);log.push(s);};
(async()=>{
 const b=await chromium.launch();
 const ctx=await b.newContext({viewport:{width:1440,height:900}});
 const p=await ctx.newPage();
 await p.goto(`${BASE}/wizard`,{waitUntil:'domcontentloaded'});await p.waitForTimeout(1500);
 await p.evaluate(()=>{const x=[...document.querySelectorAll('button,a,[role=tab]')].find(e=>/^build$/i.test(e.textContent.trim()));if(x)x.click();});await p.waitForTimeout(800);
 await p.evaluate(()=>{const x=[...document.querySelectorAll('button,a')].find(e=>/browse all/i.test(e.textContent));if(x)x.click();});await p.waitForTimeout(1200);
 // ONLY count the bold card NAMES under each card in the MODAL (the template name label, not the widget headline)
 const names=await p.evaluate(()=>{
  const modal=document.querySelector('[role="dialog"],[class*="modal"],[class*="Modal"]');if(!modal)return{err:'no modal'};
  // card title labels: short bold text directly under each card preview
  const all=[...modal.querySelectorAll('*')];
  // heuristic: leaf text nodes that match known template-name style (not the widget internal headline 'Dispatch a Tow Truck...')
  const leaf=all.filter(e=>e.children.length===0&&e.textContent.trim().length>2&&e.textContent.trim().length<35);
  const txt=leaf.map(e=>e.textContent.trim());
  // template NAME is rendered as the label below card; widget HEADLINE ends with '…' typically
  const headlines=txt.filter(t=>/Tow Truck|Driveway|Cleaning|Energy|Gutter|Fence|Landscap/i.test(t));
  return {totalLeaf:txt.length, headlines};
 });
 L('modal leaf inspection: '+JSON.stringify(names,null,1));
 // direct: count cards in modal grid and their NAME labels
 const cardNames=await p.evaluate(()=>{
  const modal=document.querySelector('[role="dialog"],[class*="modal"],[class*="Modal"]');
  const cards=[...modal.querySelectorAll('*')].filter(e=>{const r=e.getBoundingClientRect();return r.width>150&&r.width<260&&r.height>150;});
  // for each card find the bold name text that is OUTSIDE the dark widget-preview area
  return cards.map(c=>c.textContent.trim().slice(-30)).slice(0,80);
 });
 L('card tail-text (name appears at end): '+JSON.stringify(cardNames.slice(0,20)));
 const map={};cardNames.forEach(t=>map[t]=(map[t]||0)+1);
 L('card-name dupes: '+JSON.stringify(Object.entries(map).filter(([k,v])=>v>1)));
 await ctx.close();await b.close();
 fs.writeFileSync(`${OUT}/report3.txt`,log.join('\n'));console.log('DONE3');
})().catch(e=>{console.error(e);process.exit(1);});

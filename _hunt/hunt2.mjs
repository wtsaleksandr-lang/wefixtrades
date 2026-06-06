import { chromium } from 'playwright';
import fs from 'fs';
const BASE = 'http://localhost:5099';
const OUT = 'C:/Users/Owner/.codex/wt-preview/_hunt';
const log = []; const L = s => { console.log(s); log.push(s); };

// Walk up from an overflowing element to find whether a scroll container clips it (intentional carousel)
async function classifyOverflow(page, selector) {
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found:false };
    let node = el, chain = [];
    for (let i=0;i<8 && node;i++){
      const cs = getComputedStyle(node);
      chain.push({ tag:node.tagName.toLowerCase(), cls:(typeof node.className==='string'?node.className.slice(0,60):''),
        overflowX: cs.overflowX, scrollW: node.scrollWidth, clientW: node.clientWidth, scrollable: node.scrollWidth>node.clientWidth+2 && (cs.overflowX==='auto'||cs.overflowX==='scroll') });
      node = node.parentElement;
    }
    return { found:true, chain };
  }, selector);
}

(async () => {
  const browser = await chromium.launch();

  // ---- DESKTOP: classify the carousels ----
  let ctx = await browser.newContext({ viewport:{width:1440,height:900} });
  let page = await ctx.newPage();

  // /templates top strip — find the off-screen unlabeled buttons' container
  await page.goto(`${BASE}/templates`, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1500);
  // crop the top region (hero + featured strip + filter row)
  await page.screenshot({ path:`${OUT}/templates_top_desktop.png`, clip:{x:0,y:0,width:1440,height:760} });
  L('templates_top_desktop.png');
  // identify horizontal scroll containers on the page
  const scrollers = await page.evaluate(() => {
    const res=[];
    document.querySelectorAll('body *').forEach(el=>{
      const cs=getComputedStyle(el);
      if ((cs.overflowX==='auto'||cs.overflowX==='scroll') && el.scrollWidth>el.clientWidth+4){
        res.push({tag:el.tagName.toLowerCase(), cls:(typeof el.className==='string'?el.className.slice(0,70):''), scrollW:el.scrollWidth, clientW:el.clientWidth});
      }
    });
    return res;
  });
  L('TEMPLATES horizontal scroll containers (intentional carousels):');
  scrollers.forEach(s=>L('  '+JSON.stringify(s)));

  // mobile templates: classify those overflowing unlabeled buttons (filter chips?)
  // detail page: classify tpl-swatch overflow chain
  await page.goto(`${BASE}/templates/car_towing`, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1200);
  const swatchChain = await classifyOverflow(page, '.tpl-swatch-split');
  L('DETAIL .tpl-swatch-split overflow chain (desktop): '+JSON.stringify(swatchChain.chain,null,1));
  const detailScrollers = await page.evaluate(() => {
    const res=[];
    document.querySelectorAll('body *').forEach(el=>{
      const cs=getComputedStyle(el);
      if ((cs.overflowX==='auto'||cs.overflowX==='scroll') && el.scrollWidth>el.clientWidth+4){
        res.push({tag:el.tagName.toLowerCase(), cls:(typeof el.className==='string'?el.className.slice(0,70):''), scrollW:el.scrollWidth, clientW:el.clientWidth});
      }
    });
    return res;
  });
  L('DETAIL horizontal scroll containers: '); detailScrollers.forEach(s=>L('  '+JSON.stringify(s)));

  // ---- WIZARD GALLERY MODAL grid (the real one) ----
  await page.goto(`${BASE}/wizard`, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.evaluate(()=>{ const b=[...document.querySelectorAll('button,a,[role=tab]')].find(e=>/^build$/i.test(e.textContent.trim())); if(b)b.click(); });
  await page.waitForTimeout(800);
  await page.evaluate(()=>{ const b=[...document.querySelectorAll('button,a')].find(e=>/browse all/i.test(e.textContent)); if(b)b.click(); });
  await page.waitForTimeout(1200);
  // analyze the MODAL grid specifically
  const modalGrid = await page.evaluate(() => {
    const modal = document.querySelector('[role="dialog"], [class*="modal"], [class*="Modal"]');
    if(!modal) return {found:false, reason:'no modal'};
    // find the grid inside modal: a container whose children are uniform cards
    const cands=[...modal.querySelectorAll('div,ul')];
    let best=null,score=0;
    for(const el of cands){
      const cs=getComputedStyle(el);
      const kids=[...el.children].filter(k=>{const r=k.getBoundingClientRect();return r.width>80&&r.height>80;});
      if(kids.length>=4 && (cs.display==='grid'||cs.display==='flex') && kids.length>score){score=kids.length;best={el,kids,cs};}
    }
    if(!best) return {found:false, reason:'no grid in modal'};
    const rects=best.kids.map(k=>{const r=k.getBoundingClientRect();return{left:Math.round(r.left),right:Math.round(r.right),top:Math.round(r.top),width:Math.round(r.width),height:Math.round(r.height)};});
    const lefts={};rects.forEach(r=>{const k=Math.round(r.left/3)*3;lefts[k]=(lefts[k]||0)+1;});
    const W=rects.map(r=>r.width),H=rects.map(r=>r.height);
    const modalR=modal.getBoundingClientRect();
    return {found:true, display:best.cs.display, gridTemplateColumns:best.cs.gridTemplateColumns, gap:best.cs.gap,
      count:best.kids.length, columnLefts:lefts, distinctWidths:[...new Set(W)], minW:Math.min(...W),maxW:Math.max(...W),
      distinctHeights:[...new Set(H)].length, minH:Math.min(...H),maxH:Math.max(...H),
      modalRight:Math.round(modalR.right), viewport:window.innerWidth,
      sample:rects.slice(0,8)};
  });
  L('WIZARD GALLERY MODAL grid: '+JSON.stringify(modalGrid,null,1));
  // modal duplicate titles
  const modalTitles = await page.evaluate(()=>{
    const modal=document.querySelector('[role="dialog"],[class*="modal"],[class*="Modal"]'); if(!modal)return[];
    return [...modal.querySelectorAll('*')].map(e=>e.childNodes.length===1&&e.childNodes[0].nodeType===3?e.textContent.trim():'').filter(t=>t.length>3&&t.length<40);
  });
  L('modal text labels count='+modalTitles.length);
  await page.screenshot({ path:`${OUT}/wizard_gallery2_desktop.png` });
  L('wizard_gallery2_desktop.png');
  await ctx.close();

  // ---- MOBILE: gallery modal + templates filter chips ----
  ctx = await browser.newContext({ viewport:{width:375,height:812}, isMobile:true, hasTouch:true });
  page = await ctx.newPage();
  await page.goto(`${BASE}/templates`, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path:`${OUT}/templates_top_mobile.png`, clip:{x:0,y:0,width:375,height:900} });
  L('templates_top_mobile.png');
  const mScrollers = await page.evaluate(()=>{const res=[];document.querySelectorAll('body *').forEach(el=>{const cs=getComputedStyle(el);if((cs.overflowX==='auto'||cs.overflowX==='scroll')&&el.scrollWidth>el.clientWidth+4)res.push({tag:el.tagName.toLowerCase(),cls:(typeof el.className==='string'?el.className.slice(0,70):''),scrollW:el.scrollWidth,clientW:el.clientWidth});});return res;});
  L('TEMPLATES mobile scroll containers:'); mScrollers.forEach(s=>L('  '+JSON.stringify(s)));
  // classify the unlabeled overflowing buttons on mobile templates
  const chipChain = await page.evaluate(()=>{
    // find a button at left>375 (off screen) and walk its parents
    const btns=[...document.querySelectorAll('button')].filter(b=>{const r=b.getBoundingClientRect();return r.left>380;});
    if(!btns.length)return{found:false};
    let node=btns[0],chain=[];
    for(let i=0;i<6&&node;i++){const cs=getComputedStyle(node);chain.push({tag:node.tagName.toLowerCase(),cls:(typeof node.className==='string'?node.className.slice(0,50):''),overflowX:cs.overflowX,scrollW:node.scrollWidth,clientW:node.clientWidth,txt:node.textContent.slice(0,20)});node=node.parentElement;}
    return{found:true,chain};
  });
  L('TEMPLATES mobile off-screen button chain: '+JSON.stringify(chipChain.chain,null,1));

  // mobile wizard gallery modal
  await page.goto(`${BASE}/wizard`, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.evaluate(()=>{ const b=[...document.querySelectorAll('button,a,[role=tab]')].find(e=>/^build$/i.test(e.textContent.trim())); if(b)b.click(); });
  await page.waitForTimeout(800);
  await page.evaluate(()=>{ const b=[...document.querySelectorAll('button,a')].find(e=>/browse all/i.test(e.textContent)); if(b)b.click(); });
  await page.waitForTimeout(1200);
  const mModal = await page.evaluate(()=>{
    const modal=document.querySelector('[role="dialog"],[class*="modal"],[class*="Modal"]');
    if(!modal)return{found:false,reason:'no modal'};
    const cands=[...modal.querySelectorAll('div,ul')];let best=null,score=0;
    for(const el of cands){const cs=getComputedStyle(el);const kids=[...el.children].filter(k=>{const r=k.getBoundingClientRect();return r.width>80&&r.height>80;});if(kids.length>=3&&(cs.display==='grid'||cs.display==='flex')&&kids.length>score){score=kids.length;best={el,kids,cs};}}
    if(!best)return{found:false,reason:'no grid'};
    const rects=best.kids.map(k=>{const r=k.getBoundingClientRect();return{left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),height:Math.round(r.height)};});
    const W=rects.map(r=>r.width);const modalR=modal.getBoundingClientRect();
    return{found:true,display:best.cs.display,gridTemplateColumns:best.cs.gridTemplateColumns,count:best.kids.length,distinctWidths:[...new Set(W)],minW:Math.min(...W),maxW:Math.max(...W),modalRight:Math.round(modalR.right),viewport:window.innerWidth,maxRight:Math.max(...rects.map(r=>r.right)),sample:rects.slice(0,6)};
  });
  L('WIZARD GALLERY MODAL grid (mobile): '+JSON.stringify(mModal,null,1));
  await page.screenshot({ path:`${OUT}/wizard_gallery2_mobile.png` });
  L('wizard_gallery2_mobile.png');
  await ctx.close();

  await browser.close();
  fs.writeFileSync(`${OUT}/report2.txt`, log.join('\n'));
  console.log('=== DONE2 ===');
})().catch(e=>{console.error('FATAL',e);process.exit(1);});

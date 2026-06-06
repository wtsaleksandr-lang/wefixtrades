import { chromium } from 'playwright';
import fs from 'fs';

const OUT = 'C:/Users/Owner/.codex/wt-preview/_vr6';
const BASE = 'http://localhost:5099/templates/';
const TPLS = ['house_renovation','kitchen_renovation','hvac_installation','web_design_quote'];

async function pickWidget(page){
  return await page.evaluateHandle(() => {
    const els = [...document.querySelectorAll('[data-testid="advanced-calculator"]')];
    els.sort((a,b)=>b.getBoundingClientRect().width-a.getBoundingClientRect().width);
    return els[0];
  });
}

async function audit(page, widget){
  return await page.evaluate((w) => {
    const out = {};
    const root = w;
    const rr = root.getBoundingClientRect();
    out.widget = {w: Math.round(rr.width), h: Math.round(rr.height)};
    // horizontal scroll within widget
    out.overflowX = root.scrollWidth - root.clientWidth;
    out.scrollWidth = root.scrollWidth;
    out.clientWidth = root.clientWidth;
    // any descendant overflowing widget right edge
    const overflowers = [];
    [...root.querySelectorAll('*')].forEach(el=>{
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.right > rr.right + 2) {
        overflowers.push({tag: el.tagName, cls:(el.className&&el.className.toString?el.className.toString():'').slice(0,40), overByPx: Math.round(r.right - rr.right), text:(el.textContent||'').trim().slice(0,25)});
      }
    });
    // de-dup nested: keep distinct elements, cap
    out.rightOverflow = overflowers.slice(0,8);

    // two-column field pairs: find grid containers with 2 columns
    const grids = [];
    [...root.querySelectorAll('*')].forEach(el=>{
      const cs = getComputedStyle(el);
      if (cs.display === 'grid') {
        const cols = cs.gridTemplateColumns.split(' ').filter(Boolean);
        if (cols.length === 2) {
          const kids = [...el.children].filter(c=>{const r=c.getBoundingClientRect(); return r.width>0&&r.height>0;});
          if (kids.length >= 2) {
            // measure top-alignment of first row pair and height delta
            const rects = kids.map(c=>c.getBoundingClientRect());
            // group into rows by y
            grids.push({
              cols: cs.gridTemplateColumns,
              childCount: kids.length,
              firstPairTopDelta: Math.round(Math.abs(rects[0].top - rects[1].top)),
              firstPairHeightDelta: Math.round(Math.abs(rects[0].height - rects[1].height)),
              gap: cs.gap,
            });
          }
        }
      }
    });
    out.twoColGrids = grids.slice(0,6);
    return out;
  }, widget);
}

async function run(){
  const b = await chromium.launch();
  const results = {};
  for (const tpl of TPLS){
    results[tpl] = {};
    // desktop
    try{
      const page = await b.newPage({viewport:{width:1440,height:900}});
      await page.goto(BASE+tpl,{waitUntil:'domcontentloaded',timeout:60000});
      await page.waitForSelector('[data-testid="advanced-calculator"]',{timeout:25000});
      await page.waitForTimeout(1800);
      const widget = await pickWidget(page);
      results[tpl].desktop = await audit(page, widget);
      const ss = `${OUT}/B_${tpl}_desktop.png`;
      await widget.screenshot({path: ss}).catch(async()=>{await page.screenshot({path:ss});});
      results[tpl].desktop.screenshot = ss;
      await page.close();
    }catch(e){ results[tpl].desktopError = e.message.slice(0,120); }
    // mobile
    try{
      const mp = await b.newPage({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
      await mp.goto(BASE+tpl,{waitUntil:'domcontentloaded',timeout:60000});
      await mp.waitForSelector('[data-testid="advanced-calculator"]',{timeout:25000});
      await mp.waitForTimeout(1800);
      const widget = await pickWidget(mp);
      results[tpl].mobile = await audit(mp, widget);
      const ss = `${OUT}/B_${tpl}_mobile.png`;
      await widget.screenshot({path: ss}).catch(async()=>{await mp.screenshot({path:ss});});
      results[tpl].mobile.screenshot = ss;
      await mp.close();
    }catch(e){ results[tpl].mobileError = e.message.slice(0,120); }
  }
  await b.close();
  fs.writeFileSync(`${OUT}/partB_results.json`, JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
}
run();

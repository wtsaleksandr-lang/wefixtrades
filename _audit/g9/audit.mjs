import { chromium } from 'playwright';
import fs from 'fs';

const OUT = 'C:/Users/Owner/.codex/wt-preview/_audit/g9';
const BASE = 'http://localhost:5099/templates';
const TEMPLATES = ['appliance_repair','junk_removal_quote','window_replacement_quote','carpet_cleaning_quote','mold_remediation_quote'];

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false },
  mobile:  { width: 375,  height: 812, isMobile: true,  hasTouch: true },
};

function parseRGB(s){
  if(!s) return null;
  const m = s.match(/rgba?\(([^)]+)\)/);
  if(!m) return null;
  const p = m[1].split(',').map(x=>parseFloat(x.trim()));
  return { r:p[0], g:p[1], b:p[2], a: p.length>3 ? p[3] : 1 };
}
function lum({r,g,b}){
  const f = c => { c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4); };
  return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);
}
function ratio(fg,bg){
  const L1 = lum(fg), L2 = lum(bg);
  const hi = Math.max(L1,L2), lo = Math.min(L1,L2);
  return (hi+0.05)/(lo+0.05);
}

// In-page: collect text elements with computed color + effective bg (walk up for non-transparent bg)
const COLLECT = () => {
  function effBg(el){
    let e = el;
    while(e){
      const cs = getComputedStyle(e);
      const bg = cs.backgroundColor;
      const m = bg && bg.match(/rgba?\(([^)]+)\)/);
      if(m){
        const p = m[1].split(',').map(x=>parseFloat(x.trim()));
        const a = p.length>3 ? p[3] : 1;
        if(a>0.1) return bg;
      }
      e = e.parentElement;
    }
    return 'rgb(255,255,255)';
  }
  const widget = document.querySelector('[data-testid="advanced-calculator"], .advanced-calculator, [class*="alculator"]') || document.body;
  const out = [];
  const els = widget.querySelectorAll('*');
  els.forEach(el=>{
    const txt = Array.from(el.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ').trim();
    if(!txt || txt.length<1) return;
    const r = el.getBoundingClientRect();
    if(r.width<2 || r.height<2) return;
    const cs = getComputedStyle(el);
    if(cs.visibility==='hidden' || cs.display==='none' || parseFloat(cs.opacity)<0.1) return;
    out.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.className && el.className.toString().slice(0,60))||'',
      text: txt.slice(0,50),
      color: cs.color,
      bg: effBg(el),
      fontSize: parseFloat(cs.fontSize),
      fontWeight: cs.fontWeight,
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
    });
  });
  return out;
};

async function findWidget(page){
  // scroll through page to trigger lazy render
  await page.evaluate(async ()=>{
    for(let y=0;y<document.body.scrollHeight;y+=400){ window.scrollTo(0,y); await new Promise(r=>setTimeout(r,80)); }
    window.scrollTo(0,0);
  });
  await page.waitForTimeout(800);
  const sel = '[data-testid="advanced-calculator"], .advanced-calculator, [class*="alculator"]';
  const el = await page.$(sel);
  return el;
}

const report = {};

const browser = await chromium.launch();
for(const id of TEMPLATES){
  report[id] = {};
  for(const [vp, cfg] of Object.entries(VIEWPORTS)){
    const ctx = await browser.newContext({ viewport:{width:cfg.width,height:cfg.height}, isMobile:cfg.isMobile, hasTouch:cfg.hasTouch, deviceScaleFactor:1 });
    const page = await ctx.newPage();
    const res = { errors:[], shots:[], contrast:[], widgetBox:null };
    page.on('console', m=>{ if(m.type()==='error') res.errors.push(m.text().slice(0,120)); });
    try{
      await page.goto(`${BASE}/${id}`, { waitUntil:'networkidle', timeout:30000 });
    }catch(e){ res.errors.push('goto: '+e.message.slice(0,80)); }
    const widget = await findWidget(page);
    if(!widget){
      res.blocker = 'widget not found';
      // full page shot for evidence
      const fp = `${OUT}/${id}_${vp}_FULLPAGE.png`;
      await page.screenshot({ path: fp, fullPage:true }).catch(()=>{});
      res.shots.push(fp);
      report[id][vp] = res;
      await ctx.close();
      continue;
    }
    await widget.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const box = await widget.boundingBox();
    res.widgetBox = box;
    // step 1 screenshot
    const s1 = `${OUT}/${id}_${vp}_01.png`;
    await widget.screenshot({ path: s1 }).catch(async()=>{ await page.screenshot({path:s1}); });
    res.shots.push(s1);

    // collect contrast on step 1
    const data1 = await page.evaluate(COLLECT);

    // try to advance through steps: click first option/next a few times, screenshot each
    let shotN = 2;
    for(let step=0; step<5; step++){
      // try clicking a selectable option or Next/Continue button
      const advanced = await page.evaluate(()=>{
        const btnText = /next|continue|get|calculate|see|quote|result|start|begin/i;
        // prefer option cards/radios first if nothing selected
        const opt = document.querySelector('[class*="option"]:not([aria-disabled="true"]), input[type="radio"]:not(:checked), [role="radio"]');
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        const nextBtn = buttons.find(b=>btnText.test(b.textContent||'') && !b.disabled);
        return { hasOpt: !!opt, hasNext: !!nextBtn };
      });
      let clicked = false;
      // click an option to satisfy required selection
      const optEl = await page.$('[class*="option"]:not([aria-disabled="true"]) , [role="radio"], input[type="radio"]:not(:checked)');
      if(optEl){ try{ await optEl.click({timeout:1500}); clicked=true; }catch{} }
      // then click next/continue
      const handles = await page.$$('button, [role="button"]');
      for(const h of handles){
        const t = (await h.innerText().catch(()=>''))||'';
        if(/next|continue|get|calculate|see|quote|result|start|begin/i.test(t)){
          const dis = await h.isDisabled().catch(()=>false);
          if(!dis){ try{ await h.click({timeout:1500}); clicked=true; break; }catch{} }
        }
      }
      if(!clicked) break;
      await page.waitForTimeout(700);
      const sN = `${OUT}/${id}_${vp}_0${shotN}.png`;
      const wb = await (await findWidget(page))?.boundingBox().catch(()=>null);
      const target = await findWidget(page);
      if(target){ await target.scrollIntoViewIfNeeded().catch(()=>{}); await target.screenshot({path:sN}).catch(async()=>{await page.screenshot({path:sN});}); }
      else await page.screenshot({path:sN});
      res.shots.push(sN);
      shotN++;
    }

    // collect contrast across final state too
    const data2 = await page.evaluate(COLLECT);
    const all = [...data1, ...data2];
    const seen = new Set();
    for(const d of all){
      const key = d.text+'|'+d.color+'|'+d.bg;
      if(seen.has(key)) continue; seen.add(key);
      const fg = parseRGB(d.color), bg = parseRGB(d.bg);
      if(!fg||!bg) continue;
      const rr = ratio(fg,bg);
      const big = d.fontSize>=18 || (d.fontSize>=14 && parseInt(d.fontWeight)>=700);
      const thresh = big?3:4.5;
      if(rr < thresh){
        res.contrast.push({ text:d.text, color:d.color, bg:d.bg, ratio:+rr.toFixed(2), thresh, fontSize:d.fontSize, weight:d.fontWeight, tag:d.tag, cls:d.cls });
      }
    }
    res.contrast.sort((a,b)=>a.ratio-b.ratio);
    report[id][vp] = res;
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report,null,2));
// print summary
for(const id of TEMPLATES){
  console.log('\n===== '+id+' =====');
  for(const vp of ['desktop','mobile']){
    const r = report[id][vp];
    if(!r){ console.log(vp+': NO DATA'); continue; }
    if(r.blocker){ console.log(vp+': BLOCKER - '+r.blocker); continue; }
    console.log(`${vp}: widget ${r.widgetBox?Math.round(r.widgetBox.width)+'x'+Math.round(r.widgetBox.height):'?'} | shots ${r.shots.length} | contrast defects ${r.contrast.length} | errs ${r.errors.length}`);
    r.contrast.slice(0,12).forEach(c=>console.log(`   CONTRAST ${c.ratio}:1 (need ${c.thresh}) fs${c.fontSize}/${c.weight} "${c.text}" fg=${c.color} bg=${c.bg}`));
    if(r.errors.length) console.log('   errs: '+r.errors.slice(0,3).join(' | '));
  }
}
console.log('\nDONE');

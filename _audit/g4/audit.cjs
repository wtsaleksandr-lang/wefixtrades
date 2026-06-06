const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const BASE = 'http://localhost:5099';
const TEMPLATES = ['kitchen_renovation','bathroom_renovation','basement_finishing','interior_painting_pro','hvac_installation'];

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false },
  mobile:  { width: 375,  height: 812, isMobile: true,  hasTouch: true },
};

// ---- contrast helpers ----
function parseColor(str){
  if(!str) return null;
  const m = str.match(/rgba?\(([^)]+)\)/);
  if(!m) return null;
  const p = m[1].split(',').map(s=>parseFloat(s.trim()));
  return { r:p[0], g:p[1], b:p[2], a: p.length>3 ? p[3] : 1 };
}
function lin(c){ c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4); }
function lum(c){ return 0.2126*lin(c.r)+0.7152*lin(c.g)+0.0722*lin(c.b); }
function ratio(fg,bg){
  const L1=lum(fg), L2=lum(bg);
  const a=Math.max(L1,L2), b=Math.min(L1,L2);
  return (a+0.05)/(b+0.05);
}
function blend(fg,bg){ // fg over bg with alpha
  const a=fg.a;
  return { r: fg.r*a + bg.r*(1-a), g: fg.g*a + bg.g*(1-a), b: fg.b*a + bg.b*(1-a), a:1 };
}

async function analyzeContrast(page){
  return await page.evaluate(()=>{
    function getEffBg(el){
      let cur=el;
      while(cur){
        const cs=getComputedStyle(cur);
        const bg=cs.backgroundColor;
        const m=bg && bg.match(/rgba?\(([^)]+)\)/);
        if(m){
          const p=m[1].split(',').map(s=>parseFloat(s.trim()));
          const a=p.length>3?p[3]:1;
          if(a>0) return {r:p[0],g:p[1],b:p[2],a};
        }
        cur=cur.parentElement;
      }
      return {r:255,g:255,b:255,a:1};
    }
    const results=[];
    const els=document.querySelectorAll('h1,h2,h3,h4,h5,h6,label,span,p,button,a,legend,li,div,small,strong');
    for(const el of els){
      const txt=(el.innerText||'').trim();
      if(!txt) continue;
      // only direct text nodes (avoid double counting parents) — require it to have text directly
      let hasDirect=false;
      for(const n of el.childNodes){ if(n.nodeType===3 && n.textContent.trim()){ hasDirect=true; break; } }
      if(!hasDirect) continue;
      const r=el.getBoundingClientRect();
      if(r.width===0||r.height===0) continue;
      const cs=getComputedStyle(el);
      if(cs.visibility==='hidden'||cs.display==='none'||parseFloat(cs.opacity)===0) continue;
      results.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className||'').toString().slice(0,60),
        text: txt.slice(0,50),
        color: cs.color,
        bg: getEffBg(el),
        fontSize: parseFloat(cs.fontSize),
        fontWeight: cs.fontWeight,
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      });
    }
    return results;
  });
}

// ---- overflow / alignment helpers ----
async function analyzeOverflow(page, vpWidth){
  return await page.evaluate((vpw)=>{
    const issues=[];
    const docW=document.documentElement.scrollWidth;
    if(docW > vpw + 2) issues.push({type:'horizontal-scroll', detail:`doc scrollWidth ${docW} > viewport ${vpw}`});
    const els=document.querySelectorAll('*');
    let clipped=0; const samples=[];
    for(const el of els){
      const r=el.getBoundingClientRect();
      if(r.width===0||r.height===0) continue;
      if(r.right > vpw + 3){
        clipped++;
        if(samples.length<8) samples.push({tag:el.tagName.toLowerCase(), cls:(el.className||'').toString().slice(0,50), right:Math.round(r.right), text:(el.innerText||'').trim().slice(0,30)});
      }
    }
    if(clipped) issues.push({type:'elements-overflow-right', count:clipped, samples});
    return issues;
  }, vpWidth);
}

async function findWidget(page){
  // try to locate the calculator container
  return await page.evaluate(()=>{
    const cands=document.querySelectorAll('[class*="calculator" i],[class*="widget" i],[id*="calculator" i],[id*="widget" i]');
    if(cands.length){
      const el=cands[0];
      const r=el.getBoundingClientRect();
      return {found:true, sel:cands[0].className.toString().slice(0,80), y: r.top + window.scrollY, h: r.height};
    }
    return {found:false};
  });
}

async function clickable(page, texts){
  for(const t of texts){
    const loc = page.locator(`button:has-text("${t}"), [role="button"]:has-text("${t}")`).first();
    if(await loc.count()>0 && await loc.isVisible().catch(()=>false)){
      return loc;
    }
  }
  return null;
}

(async()=>{
  const browser = await chromium.launch();
  const summary = {};

  for(const tpl of TEMPLATES){
    summary[tpl] = {};
    for(const [vpName, vp] of Object.entries(VIEWPORTS)){
      const tag = `${tpl}__${vpName}`;
      const rec = { screenshots:[], contrast:[], overflow:[], widget:null, error:null, steps:[] };
      const context = await browser.newContext({ viewport:{width:vp.width,height:vp.height}, isMobile:vp.isMobile, hasTouch:vp.hasTouch, deviceScaleFactor:1 });
      const page = await context.newPage();
      try{
        await page.goto(`${BASE}/templates/${tpl}`, {waitUntil:'domcontentloaded', timeout:30000});
        await page.waitForSelector('[class*="calculator" i],[class*="widget" i],[id*="calculator" i],[id*="widget" i]', {timeout:20000}).catch(()=>{});
        await page.waitForTimeout(2000);

        const w = await findWidget(page);
        rec.widget = w;
        if(w.found){
          await page.evaluate((y)=>window.scrollTo(0, Math.max(0, y-40)), w.y);
          await page.waitForTimeout(800);
        }

        // full page screenshot for context + widget region
        const sFull = path.join(OUT, `${tag}__page.png`);
        await page.screenshot({path:sFull, fullPage:true});
        rec.screenshots.push(sFull);

        // widget-focused screenshot (viewport after scroll)
        const sWidget = path.join(OUT, `${tag}__widget1.png`);
        await page.screenshot({path:sWidget});
        rec.screenshots.push(sWidget);

        // contrast + overflow at widget view
        const c1 = await analyzeContrast(page);
        rec.contrast = c1;
        rec.overflow = await analyzeOverflow(page, vp.width);

        // attempt to step through the widget
        let step=1;
        for(let i=0;i<6;i++){
          const next = await clickable(page, ['Next','Continue','Get Quote','Calculate','Get my quote','See price','Get Estimate','Get my price']);
          // also try selecting first option/radio to enable next
          if(i===0){
            // click first selectable card/option
            const opt = page.locator('[class*="option" i], [role="radio"], input[type="radio"]').first();
            if(await opt.count()>0 && await opt.isVisible().catch(()=>false)){
              await opt.click({timeout:3000}).catch(()=>{});
              await page.waitForTimeout(500);
            }
          }
          if(!next) break;
          await next.click({timeout:3000}).catch(()=>{});
          await page.waitForTimeout(900);
          step++;
          const sStep = path.join(OUT, `${tag}__step${step}.png`);
          await page.screenshot({path:sStep});
          rec.screenshots.push(sStep);
          rec.steps.push(`clicked next/continue -> step ${step}`);
          // re-analyze contrast on this step too
          const cN = await analyzeContrast(page);
          for(const item of cN) rec.contrast.push({...item, step});
        }
      }catch(e){
        rec.error = e.message;
      }
      await context.close();
      summary[tpl][vpName]=rec;
      console.log(`done ${tag} :: widget=${rec.widget && rec.widget.found} contrastEls=${rec.contrast.length} err=${rec.error||'none'}`);
    }
  }

  fs.writeFileSync(path.join(OUT,'raw.json'), JSON.stringify(summary,null,2));
  await browser.close();
  console.log('ALL DONE');
})();

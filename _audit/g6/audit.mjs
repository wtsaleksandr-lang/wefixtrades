import { chromium } from 'playwright';

const OUT = 'C:/Users/Owner/.codex/wt-preview/_audit/g6';
const BASE = 'http://localhost:5099';
const TEMPLATES = ['tree_service', 'pressure_washing_quote', 'mobile_car_detail', 'locksmith_service', 'water_damage_restoration'];

// ---- contrast helpers ----
function parseColor(str) {
  if (!str) return null;
  const m = str.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(',').map(s => parseFloat(s.trim()));
  return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] === undefined ? 1 : parts[3] };
}
function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lum(col) { return 0.2126 * lin(col.r) + 0.7152 * lin(col.g) + 0.0722 * lin(col.b); }
function ratio(fg, bg) {
  const l1 = lum(fg), l2 = lum(bg);
  const a = Math.max(l1, l2), b = Math.min(l1, l2);
  return (a + 0.05) / (b + 0.05);
}
function blend(fg, bg) {
  // composite fg over bg using fg alpha
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

async function effectiveBg(el) {
  // walk up to find first non-transparent bg
  return await el.evaluate(node => {
    function pc(str){const m=(str||'').match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(',').map(s=>parseFloat(s.trim()));return {r:p[0],g:p[1],b:p[2],a:p[3]===undefined?1:p[3]};}
    let n = node;
    let stack = [];
    while (n) {
      const cs = getComputedStyle(n);
      const c = pc(cs.backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; }
      n = n.parentElement;
    }
    // composite from bottom up
    let base = {r:255,g:255,b:255,a:1};
    for (let i = stack.length - 1; i >= 0; i--) {
      const c = stack[i];
      base = {r: c.r*c.a + base.r*(1-c.a), g: c.g*c.a + base.g*(1-c.a), b: c.b*c.a + base.b*(1-c.a), a:1};
    }
    return `rgb(${Math.round(base.r)}, ${Math.round(base.g)}, ${Math.round(base.b)})`;
  });
}

async function auditContrast(scope, viewport) {
  const handles = await scope.$$('label, h1, h2, h3, h4, h5, h6, p, span, button, legend, option, .label, [class*="label"], [class*="title"], [class*="heading"], [class*="help"], [class*="hint"]');
  const seen = new Set();
  const defects = [];
  for (const h of handles) {
    try {
      const info = await h.evaluate(node => {
        const cs = getComputedStyle(node);
        const txt = (node.innerText || node.textContent || '').trim();
        const rect = node.getBoundingClientRect();
        // only direct text (no element children with text), to avoid double counting
        const hasElChild = Array.from(node.children).some(c => (c.innerText||'').trim().length>0);
        return {
          txt: txt.slice(0,60), color: cs.color, fontSize: parseFloat(cs.fontSize),
          fontWeight: cs.fontWeight, visible: rect.width>0 && rect.height>0 && cs.visibility!=='hidden' && cs.display!=='none' && parseFloat(cs.opacity)>0,
          hasElChild, len: txt.length, tag: node.tagName.toLowerCase()
        };
      });
      if (!info.visible || !info.txt || info.len === 0 || info.hasElChild) continue;
      const key = info.tag + '|' + info.txt + '|' + info.color;
      if (seen.has(key)) continue; seen.add(key);
      const fg = parseColor(info.color);
      if (!fg) continue;
      const bgStr = await effectiveBg(h);
      const bg = parseColor(bgStr);
      let fgEff = fg.a < 1 ? blend(fg, bg) : fg;
      const r = ratio(fgEff, bg);
      const big = info.fontSize >= 24 || (info.fontSize >= 18.66 && (info.fontWeight === 'bold' || parseInt(info.fontWeight) >= 700));
      const threshold = big ? 3.0 : 4.5;
      if (r < threshold) {
        defects.push({ txt: info.txt, fg: info.color, bg: bgStr, ratio: r.toFixed(2), threshold, fontSize: info.fontSize, viewport });
      }
    } catch (e) {}
  }
  return defects;
}

async function run() {
  const browser = await chromium.launch();
  const report = {};
  for (const tpl of TEMPLATES) {
    report[tpl] = {};
    for (const vp of [{name:'desktop',w:1440,h:900,mobile:false},{name:'mobile',w:375,h:812,mobile:true}]) {
      const ctx = await browser.newContext({ viewport:{width:vp.w,height:vp.h}, isMobile:vp.mobile, hasTouch:vp.mobile, deviceScaleFactor:1 });
      const page = await ctx.newPage();
      const r = { rendered:false, contrast:[], notes:[], shots:[] };
      try {
        await page.goto(`${BASE}/templates/${tpl}`, { waitUntil:'networkidle', timeout:30000 });
        await page.waitForTimeout(1500);
        // full page screenshot
        const fp = `${OUT}/${tpl}_${vp.name}_full.png`;
        await page.screenshot({ path: fp, fullPage: true });
        r.shots.push(fp);

        // find widget: look for AdvancedCalculator container / inputs
        let widget = await page.$('[class*="alculator"], [class*="widget"], [data-widget], form');
        // Try locating by presence of interactive fields after scrolling
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(500);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);

        // Re-query for a richer widget container: element containing inputs/buttons/range
        const widgetHandle = await page.evaluateHandle(() => {
          const cands = Array.from(document.querySelectorAll('div,section,form'));
          let best=null, bestScore=0;
          for (const c of cands) {
            const inputs = c.querySelectorAll('input,select,button,[role="radio"],[role="button"],[type="range"]').length;
            const rect = c.getBoundingClientRect();
            if (inputs>=2 && rect.width>200) {
              // prefer the smallest container holding several controls
              const score = inputs*1000 - rect.height;
              if (inputs > 0 && (best===null || (inputs>=2 && c.contains(best)===false && inputs>bestScore))) {}
            }
          }
          // simpler: find element with class containing calculator
          const calc = document.querySelector('[class*="alculator"]');
          return calc || document.querySelector('form') || null;
        });
        const wEl = widgetHandle.asElement();
        if (wEl) {
          r.rendered = true;
          try {
            await wEl.scrollIntoViewIfNeeded();
            await page.waitForTimeout(400);
            const wp = `${OUT}/${tpl}_${vp.name}_widget.png`;
            await wEl.screenshot({ path: wp });
            r.shots.push(wp);
          } catch(e){ r.notes.push('widget screenshot failed: '+e.message); }
        } else {
          // fallback: any inputs present?
          const inputCount = await page.$$eval('input,select,button[type],[type="range"],[role="radio"]', els=>els.length);
          r.rendered = inputCount > 0;
          r.notes.push('no .calculator container; input-like count='+inputCount);
        }

        // contrast audit over whole page (widget marketing both)
        r.contrast = await auditContrast(page, vp.name);

        // Try to interact: click first few selectable options / next button to reach result
        try {
          const stepShots = [];
          for (let step=0; step<3; step++) {
            // click radio-like options
            const opt = await page.$('[role="radio"]:not([aria-checked="true"]), input[type="radio"], button:has-text("Next"), button:has-text("Continue"), button:has-text("Get")');
            if (!opt) break;
            await opt.click({ timeout: 2000 }).catch(()=>{});
            await page.waitForTimeout(600);
          }
          // capture potential result/price
          const priceText = await page.$$eval('[class*="price"],[class*="rice"],[class*="result"],[class*="total"],[class*="estimate"]', els=>els.map(e=>(e.innerText||'').trim()).filter(Boolean).slice(0,5));
          if (priceText.length) r.notes.push('price/result text: '+JSON.stringify(priceText));
          const sp = `${OUT}/${tpl}_${vp.name}_interacted.png`;
          await page.screenshot({ path: sp, fullPage: true });
          r.shots.push(sp);
          // re-run contrast after interaction (result screen)
          const c2 = await auditContrast(page, vp.name+'-after');
          // merge unique
          for (const d of c2) {
            if (!r.contrast.find(x=>x.txt===d.txt && x.fg===d.fg)) r.contrast.push(d);
          }
        } catch(e){ r.notes.push('interaction err: '+e.message); }

      } catch (e) {
        r.notes.push('LOAD ERROR: ' + e.message);
      }
      report[tpl][vp.name] = r;
      await ctx.close();
    }
  }
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}
run().catch(e=>{ console.error(e); process.exit(1); });

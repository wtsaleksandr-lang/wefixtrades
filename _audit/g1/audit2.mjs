import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const OUT = 'C:/Users/Owner/.codex/wt-preview/_audit/g1';
const BASE = 'http://localhost:5099';
const TEMPLATES = ['car_towing', 'driveway_paving', 'property_cleaning', 'energy_upgrade', 'landscaping'];
const WSEL = '[data-testid="advanced-calculator"]';

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  mobile: { width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

function parseColor(str) {
  if (!str) return null;
  const m = str.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map(s => parseFloat(s.trim()));
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}
function lum(c) { const f = v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }; return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); }
function over(fg, bg) { const a = fg.a; return { r: fg.r*a+bg.r*(1-a), g: fg.g*a+bg.g*(1-a), b: fg.b*a+bg.b*(1-a), a:1 }; }
function ratio(fg, bg) { const L1=lum(fg),L2=lum(bg),hi=Math.max(L1,L2),lo=Math.min(L1,L2); return (hi+0.05)/(lo+0.05); }

// extract text nodes only WITHIN the widget subtree
const EXTRACT = (sel) => {
  const root = document.querySelector(sel);
  if (!root) return [];
  const results = [];
  function effBg(el) {
    let node = el;
    while (node) {
      const cs = getComputedStyle(node);
      const m = cs.backgroundColor && cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
      if (m) { const p = m[1].split(',').map(s=>parseFloat(s.trim())); const a = p.length>3?p[3]:1; if (a>0.01) return cs.backgroundColor; }
      node = node.parentElement;
    }
    return 'rgb(255,255,255)';
  }
  for (const el of root.querySelectorAll('*')) {
    let txt = '';
    for (const n of el.childNodes) if (n.nodeType === 3) txt += n.textContent;
    txt = txt.trim();
    if (!txt) continue;
    const cs = getComputedStyle(el);
    if (cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)<0.1) continue;
    const r = el.getBoundingClientRect();
    if (r.width<1||r.height<1) continue;
    results.push({ text: txt.slice(0,60), color: cs.color, bg: effBg(el), fontSize: parseFloat(cs.fontSize), fontWeight: cs.fontWeight, tag: el.tagName.toLowerCase(), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
  }
  return results;
};

// overflow strictly within widget
const OVERFLOW = (sel) => {
  const root = document.querySelector(sel);
  if (!root) return [];
  const rb = root.getBoundingClientRect();
  const issues = [];
  for (const el of root.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width===0||r.height===0) continue;
    const cs = getComputedStyle(el);
    // element extends beyond widget's right/left edge while widget itself clips or not
    if (r.right > rb.right + 2 || r.left < rb.left - 2) {
      const t = (el.textContent||'').trim().slice(0,40);
      issues.push({ type:'extends-beyond-widget', tag: el.tagName.toLowerCase(), cls:(el.className&&el.className.toString().slice(0,40))||'', elRight: Math.round(r.right), elLeft: Math.round(r.left), widgetRight: Math.round(rb.right), widgetLeft: Math.round(rb.left), text: t });
    }
  }
  const seen = new Set();
  return issues.filter(i => { const k=i.tag+i.cls+i.elRight+i.elLeft; if(seen.has(k))return false; seen.add(k); return true; });
};

function dedupContrast(arr) {
  const seen = new Map();
  for (const c of arr) {
    const k = c.text + '|' + c.color + '|' + c.bg + '|' + c.viewport;
    if (!seen.has(k)) seen.set(k, c);
  }
  return [...seen.values()];
}

function scoreText(t) {
  const fg = parseColor(t.color), bgRaw = parseColor(t.bg);
  if (!fg || !bgRaw) return null;
  const white = { r:255,g:255,b:255,a:1 };
  const bgc = bgRaw.a < 1 ? over(bgRaw, white) : bgRaw;
  const fgc = fg.a < 1 ? over(fg, bgc) : fg;
  const cr = ratio(fgc, bgc);
  const large = t.fontSize>=18 || (t.fontSize>=14 && (t.fontWeight==='bold'||parseInt(t.fontWeight)>=700));
  const threshold = large ? 3.0 : 4.5;
  return { cr, threshold };
}

const report = {};
const browser = await chromium.launch();

for (const tpl of TEMPLATES) {
  report[tpl] = { rendered: {}, contrast: [], overflow: [], steps: {}, notes: [] };
  for (const [vp, cfg] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({ viewport: { width: cfg.width, height: cfg.height }, isMobile: cfg.isMobile, hasTouch: cfg.hasTouch, deviceScaleFactor: cfg.deviceScaleFactor });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/templates/${tpl}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => report[tpl].notes.push(`${vp}: goto ${e.message.slice(0,60)}`));
    // wait for widget to appear
    let appeared = false;
    try { await page.waitForSelector(WSEL, { timeout: 15000, state: 'attached' }); appeared = true; } catch {}
    await page.waitForTimeout(2000);
    report[tpl].rendered[vp] = appeared;
    if (!appeared) { await ctx.close(); continue; }

    const widget = await page.$(WSEL);
    try { await widget.scrollIntoViewIfNeeded(); } catch {}
    await page.waitForTimeout(600);

    // screenshot widget
    try { await widget.screenshot({ path: path.join(OUT, `${tpl}_${vp}_widget.png`) }); }
    catch { await page.screenshot({ path: path.join(OUT, `${tpl}_${vp}_widget.png`), clip: await widget.boundingBox() }); }

    // step counter heuristic: capture screen state, collect contrast each step
    const collectStep = async (label) => {
      try { await widget.screenshot({ path: path.join(OUT, `${tpl}_${vp}_${label}.png`) }); } catch {}
      const texts = await page.evaluate(EXTRACT, WSEL);
      let stepHits = 0;
      for (const t of texts) {
        const s = scoreText(t);
        if (s && s.cr < s.threshold) {
          stepHits++;
          report[tpl].contrast.push({ viewport: `${vp}/${label}`, text: t.text, color: t.color, bg: t.bg, ratio: Math.round(s.cr*100)/100, fontSize: t.fontSize, weight: t.fontWeight, threshold: s.threshold, tag: t.tag, screenshot: `${tpl}_${vp}_${label}.png` });
        }
      }
      const ov = await page.evaluate(OVERFLOW, WSEL);
      for (const o of ov) report[tpl].overflow.push({ viewport: `${vp}/${label}`, ...o, screenshot: `${tpl}_${vp}_${label}.png` });
      return stepHits;
    };

    await collectStep('s1');

    // step through up to 6 steps by clicking Next/Continue inside the widget
    for (let i = 2; i <= 6; i++) {
      const next = await page.$(`${WSEL} button:has-text("Next"), ${WSEL} button:has-text("Continue"), ${WSEL} button:has-text("Get my"), ${WSEL} button:has-text("See "), ${WSEL} button:has-text("Calculate"), ${WSEL} button:has-text("Get quote"), ${WSEL} button:has-text("Get estimate")`);
      if (!next) break;
      const disabled = await next.isDisabled().catch(() => false);
      if (disabled) {
        // try to satisfy required: click first option/radio in widget
        const opt = await page.$(`${WSEL} [role="radio"], ${WSEL} button[class*="option" i], ${WSEL} label`);
        if (opt) { await opt.click({ timeout: 2000 }).catch(()=>{}); await page.waitForTimeout(400); }
      }
      await next.scrollIntoViewIfNeeded().catch(()=>{});
      const ok = await next.click({ timeout: 2500 }).then(()=>true).catch(()=>false);
      if (!ok) break;
      await page.waitForTimeout(1200);
      await collectStep(`s${i}`);
    }

    await ctx.close();
  }
  report[tpl].contrast = dedupContrast(report[tpl].contrast);
}

await browser.close();
fs.writeFileSync(path.join(OUT, 'report2.json'), JSON.stringify(report, null, 2));

// print compact summary
for (const [t, d] of Object.entries(report)) {
  console.log(`\n=== ${t} ===`);
  console.log('rendered:', JSON.stringify(d.rendered));
  console.log('contrast defects:', d.contrast.length);
  for (const c of d.contrast) console.log(`  [${c.viewport}] "${c.text}" ${c.color} on ${c.bg} = ${c.ratio}:1 (need ${c.threshold}) ${c.fontSize}px/${c.weight} <${c.tag}>`);
  console.log('overflow defects:', d.overflow.length);
  for (const o of d.overflow) console.log(`  [${o.viewport}] <${o.tag} ${o.cls}> "${o.text}" elRight=${o.elRight} widgetRight=${o.widgetRight} elLeft=${o.elLeft} widgetLeft=${o.widgetLeft}`);
  if (d.notes.length) console.log('notes:', d.notes.join(' | '));
}
console.log('\nDONE');

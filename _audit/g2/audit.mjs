import { chromium, devices } from 'playwright';
import fs from 'fs';

const OUT = 'C:/Users/Owner/.codex/wt-preview/_audit/g2';
const BASE = 'http://localhost:5099';
const TEMPLATES = ['gutter_cleaning', 'fence_installation', 'roof_repair', 'solar_panels', 'interior_painting'];

function lum({ r, g, b }) {
  const a = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
function parse(str) {
  const m = str && str.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map(s => parseFloat(s.trim()));
  return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
}
function contrast(fgs, bgs) {
  const fg = parse(fgs), bg = parse(bgs);
  if (!fg || !bg) return null;
  const l1 = lum(fg), l2 = lum(bg);
  return ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
}

const FIND = `() => {
  // Live interactive widget = the LARGEST advcalc-* root (gallery thumbnails are ~140px wide).
  const roots = [...document.querySelectorAll('[class^="advcalc-"]')]
    .filter(el => /^advcalc-[a-z0-9]+$/.test((el.className||'').toString().trim()));
  const sized = roots.map(el => { const r = el.getBoundingClientRect(); return { cls:(el.className||'').toString().trim(), w:Math.round(r.width), h:Math.round(r.height), yAbs:Math.round(r.y+window.scrollY), area:Math.round(r.width*r.height) }; });
  sized.sort((a,b)=>b.area-a.area);
  return sized;
}`;

const SCAN = `(sel) => {
  function effBg(el){
    let n = el;
    while(n){
      const bg = getComputedStyle(n).backgroundColor;
      const m = bg && bg.match(/rgba?\\(([^)]+)\\)/);
      if(m){ const p=m[1].split(',').map(x=>parseFloat(x.trim())); const a=p[3]===undefined?1:p[3]; if(a>0.5) return bg; }
      n = n.parentElement;
    }
    return 'rgb(255, 255, 255)';
  }
  const root = document.querySelector(sel);
  if(!root) return {error:'no '+sel};
  const out=[];
  for(const el of root.querySelectorAll('*')){
    const own = [...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join('').trim();
    if(!own) continue;
    const r = el.getBoundingClientRect();
    if(r.width<2||r.height<2) continue;
    const s = getComputedStyle(el);
    if(s.visibility==='hidden'||s.display==='none'||parseFloat(s.opacity)<0.1) continue;
    out.push({ tag:el.tagName.toLowerCase(), cls:(el.className||'').toString().slice(0,50), text:own.slice(0,45), color:s.color, bg:effBg(el), fs:parseFloat(s.fontSize), fw:s.fontWeight });
  }
  return {items:out};
}`;

const OVERFLOW = `(sel) => {
  const root = document.querySelector(sel);
  if(!root) return {error:'no root'};
  const rr = root.getBoundingClientRect();
  const out=[];
  for(const el of root.querySelectorAll('*')){
    const r = el.getBoundingClientRect();
    if(r.width<1) continue;
    // horizontal overflow beyond root right edge by >2px
    if(r.right > rr.right + 2 || r.left < rr.left - 2){
      out.push({ tag:el.tagName.toLowerCase(), cls:(el.className||'').toString().slice(0,45), overRight:Math.round(r.right-rr.right), overLeft:Math.round(rr.left-r.left), text:(el.textContent||'').trim().slice(0,30) });
    }
  }
  return { rootW: Math.round(rr.width), scrollW: root.scrollWidth, clientW: root.clientWidth, overflowEls: out.slice(0,15) };
}`;

async function run() {
  const browser = await chromium.launch();
  const report = {};
  for (const id of TEMPLATES) {
    report[id] = {};
    for (const vp of ['desktop', 'mobile']) {
      const ctx = vp === 'mobile'
        ? await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })
        : await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      const errs = [];
      page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
      page.on('pageerror', e => errs.push('PAGEERR:' + e.message.slice(0, 160)));
      const r = report[id][vp] = { consoleErrors: errs };
      try {
        await page.goto(`${BASE}/templates/${id}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      } catch (e) { r.error = 'goto:' + e.message; await ctx.close(); continue; }
      // wait until a LARGE advcalc root (the live widget, not the ~140px gallery thumbnails) exists
      try {
        await page.waitForFunction(() => {
          const roots = [...document.querySelectorAll('[class^="advcalc-"]')].filter(el => /^advcalc-[a-z0-9]+$/.test((el.className||'').toString().trim()));
          return roots.some(el => { const r = el.getBoundingClientRect(); return r.width * r.height > 100000; });
        }, { timeout: 25000 });
      } catch (e) { r.waitErr = 'large widget never appeared: ' + e.message.slice(0, 80); }
      await page.waitForTimeout(1500);

      let widgets;
      try { widgets = await page.evaluate('(' + FIND + ')()'); } catch (e) { r.findErr = e.message; widgets = []; }
      r.widgetsFound = widgets;

      r.fullScreenshot = `${OUT}/${id}_${vp}_full.png`;
      await page.screenshot({ path: r.fullScreenshot, fullPage: true });

      if (!widgets || !widgets.length) { r.BLOCKER = 'no widget root found'; await ctx.close(); continue; }
      const live = widgets[0]; // largest advcalc root = the live interactive widget
      r.liveWidget = live;
      const sel = '.' + live.cls;
      r.widgetSel = sel;
      if (live.area < 5000) { r.BLOCKER = 'widget root too small (' + live.w + 'x' + live.h + ') - likely not rendered'; }

      try {
        const el = await page.$(sel);
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(600);
        r.widgetScreenshot = `${OUT}/${id}_${vp}_widget.png`;
        await el.screenshot({ path: r.widgetScreenshot });
      } catch (e) { r.shotErr = e.message; }

      // contrast
      try {
        const c = await page.evaluate(SCAN, sel);
        if (c.items) {
          const flagged = [];
          for (const it of c.items) {
            const ratio = contrast(it.color, it.bg);
            if (ratio === null) continue;
            const big = it.fs >= 18 || (it.fs >= 14 && parseInt(it.fw) >= 700);
            const thresh = big ? 3.0 : 4.5;
            if (ratio < thresh) flagged.push({ ...it, ratio: Math.round(ratio * 100) / 100, thresh });
          }
          r.contrastDefects = flagged;
        } else r.contrastDefects = c;
      } catch (e) { r.contrastErr = e.message; }

      // overflow / alignment
      try { r.overflow = await page.evaluate(OVERFLOW, sel); } catch (e) { r.overflowErr = e.message; }

      // Try to interact: click first option/button to reveal result screen, then screenshot
      try {
        // click a primary CTA or first selectable option to advance multistep
        const btns = await page.$$(`${sel} button, ${sel} [role="button"]`);
        if (btns.length) {
          // capture a "result" attempt: pick an option then look for result panel
          await btns[0].click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(800);
          r.afterClickScreenshot = `${OUT}/${id}_${vp}_afterclick.png`;
          const el2 = await page.$(sel);
          if (el2) await el2.screenshot({ path: r.afterClickScreenshot }).catch(() => {});
        }
      } catch (e) { /* best effort */ }

      await ctx.close();
    }
  }
  await browser.close();
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  console.log('DONE');
}
run().catch(e => { console.error(e); process.exit(1); });

import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const OUT = 'C:/Users/Owner/.codex/wt-preview/_audit/g1';
const BASE = 'http://localhost:5099';
const TEMPLATES = ['car_towing', 'driveway_paving', 'property_cleaning', 'energy_upgrade', 'landscaping'];

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  mobile: { width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

// ---- contrast helpers ----
function parseColor(str) {
  if (!str) return null;
  const m = str.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(',').map(s => parseFloat(s.trim()));
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}
function lum(c) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
function over(fg, bg) {
  // composite fg (with alpha) over opaque bg
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}
function ratio(fg, bg) {
  const L1 = lum(fg), L2 = lum(bg);
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

// In-page: walk text nodes, find effective bg by climbing parents, return color/bg/size/bold/text
const EXTRACT = () => {
  const results = [];
  function effBg(el) {
    let node = el;
    while (node) {
      const cs = getComputedStyle(node);
      const bc = cs.backgroundColor;
      const m = bc && bc.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const p = m[1].split(',').map(s => parseFloat(s.trim()));
        const a = p.length > 3 ? p[3] : 1;
        if (a > 0.01) return bc;
      }
      node = node.parentElement;
    }
    return 'rgb(255,255,255)';
  }
  const all = document.querySelectorAll('*');
  for (const el of all) {
    // must have a direct visible text node
    let txt = '';
    for (const n of el.childNodes) if (n.nodeType === 3) txt += n.textContent;
    txt = txt.trim();
    if (!txt || txt.length < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    results.push({
      text: txt.slice(0, 60),
      color: cs.color,
      bg: effBg(el),
      fontSize: parseFloat(cs.fontSize),
      fontWeight: cs.fontWeight,
      tag: el.tagName.toLowerCase(),
      x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height),
    });
  }
  return results;
};

// Overflow / off-bounds detection within the widget
const OVERFLOW = (sel) => {
  const root = document.querySelector(sel) || document.body;
  const rb = root.getBoundingClientRect();
  const issues = [];
  const docW = document.documentElement.clientWidth;
  for (const el of root.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > docW + 1) {
      const t = (el.textContent || '').trim().slice(0, 40);
      issues.push({ type: 'horizontal-overflow', tag: el.tagName.toLowerCase(), right: Math.round(r.right), docW, text: t });
    }
  }
  // dedup
  const seen = new Set();
  return issues.filter(i => { const k = i.tag + i.right + i.text; if (seen.has(k)) return false; seen.add(k); return true; });
};

async function findWidget(page) {
  // Heuristics: a container with form inputs / sliders / a price panel.
  const handle = await page.evaluateHandle(() => {
    const candidates = [];
    const sels = ['[class*="calculator" i]', '[class*="widget" i]', '[class*="quote" i]', '[data-testid*="calc" i]', 'form'];
    for (const s of sels) document.querySelectorAll(s).forEach(e => candidates.push(e));
    // pick the one with the most inputs/buttons and a sizable box
    let best = null, bestScore = -1;
    for (const c of candidates) {
      const r = c.getBoundingClientRect();
      if (r.width < 200 || r.height < 150) continue;
      const ctrls = c.querySelectorAll('input,select,button,[role="radio"],[role="slider"],[class*="slider" i],[class*="option" i]').length;
      const score = ctrls + r.height / 1000;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  });
  return handle.asElement();
}

const report = {};

const browser = await chromium.launch();
for (const tpl of TEMPLATES) {
  report[tpl] = { rendered: {}, contrast: [], overflow: [], notes: [] };
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: vp.deviceScaleFactor });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/templates/${tpl}`, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (e) {
      report[tpl].notes.push(`${vpName}: goto error ${e.message}`);
    }
    await page.waitForTimeout(2500);

    // find widget
    let widget = await findWidget(page);
    let rendered = !!widget;
    report[tpl].rendered[vpName] = rendered;

    // scroll widget into view
    if (widget) {
      try { await widget.scrollIntoViewIfNeeded(); } catch {}
      await page.waitForTimeout(800);
    }

    // full page screenshot first
    await page.screenshot({ path: path.join(OUT, `${tpl}_${vpName}_full.png`), fullPage: true });

    // widget screenshot
    if (widget) {
      try { await widget.screenshot({ path: path.join(OUT, `${tpl}_${vpName}_widget.png`) }); }
      catch { await page.screenshot({ path: path.join(OUT, `${tpl}_${vpName}_widget.png`) }); }
    }

    // contrast extraction (whole page, then filter to widget bounds)
    let wbox = null;
    if (widget) { try { wbox = await widget.boundingBox(); } catch {} }
    const texts = await page.evaluate(EXTRACT);
    for (const t of texts) {
      // limit to widget region if known (with margin)
      if (wbox) {
        const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
        // widget bbox is viewport-relative after scroll; we use absolute page coords from getBoundingClientRect at extract time
      }
      const fg = parseColor(t.color), bgRaw = parseColor(t.bg);
      if (!fg || !bgRaw) continue;
      const fgc = fg.a < 1 ? over(fg, bgRaw.a < 1 ? { r:255,g:255,b:255,a:1 } : bgRaw) : fg;
      const bgc = bgRaw.a < 1 ? over(bgRaw, { r:255,g:255,b:255,a:1 }) : bgRaw;
      const cr = ratio(fgc, bgc);
      const large = t.fontSize >= 18 || (t.fontSize >= 14 && (t.fontWeight === 'bold' || parseInt(t.fontWeight) >= 700));
      const threshold = large ? 3.0 : 4.5;
      if (cr < threshold) {
        report[tpl].contrast.push({
          viewport: vpName, text: t.text, color: t.color, bg: t.bg,
          ratio: Math.round(cr * 100) / 100, fontSize: t.fontSize, weight: t.fontWeight,
          threshold, tag: t.tag, pos: `${t.x},${t.y}`,
        });
      }
    }

    // overflow
    const ov = await page.evaluate(OVERFLOW, '[class*="calculator" i], body');
    for (const o of ov) report[tpl].overflow.push({ viewport: vpName, ...o });

    // Try to step through the widget: click first primary button / option to reveal more screens
    try {
      const btns = await page.$$('button:visible, [role="button"]:visible');
      // capture a "step 2" if a Next/Continue exists
      const nextBtn = await page.$('button:has-text("Next"), button:has-text("Continue"), button:has-text("Get"), button:has-text("Calculate"), button:has-text("Start")');
      if (nextBtn) {
        await nextBtn.scrollIntoViewIfNeeded();
        await nextBtn.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(OUT, `${tpl}_${vpName}_step2.png`), fullPage: true });
        // re-run contrast on step2
        const texts2 = await page.evaluate(EXTRACT);
        for (const t of texts2) {
          const fg = parseColor(t.color), bgRaw = parseColor(t.bg);
          if (!fg || !bgRaw) continue;
          const fgc = fg.a < 1 ? over(fg, bgRaw.a < 1 ? { r:255,g:255,b:255,a:1 } : bgRaw) : fg;
          const bgc = bgRaw.a < 1 ? over(bgRaw, { r:255,g:255,b:255,a:1 }) : bgRaw;
          const cr = ratio(fgc, bgc);
          const large = t.fontSize >= 18 || (t.fontSize >= 14 && (t.fontWeight === 'bold' || parseInt(t.fontWeight) >= 700));
          const threshold = large ? 3.0 : 4.5;
          if (cr < threshold) {
            report[tpl].contrast.push({ viewport: vpName + '-step2', text: t.text, color: t.color, bg: t.bg, ratio: Math.round(cr*100)/100, fontSize: t.fontSize, weight: t.fontWeight, threshold, tag: t.tag, pos: `${t.x},${t.y}` });
          }
        }
      }
    } catch (e) { report[tpl].notes.push(`${vpName}: step-through ${e.message}`); }

    await ctx.close();
  }
}
await browser.close();

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('DONE');
console.log(JSON.stringify(report, null, 2));

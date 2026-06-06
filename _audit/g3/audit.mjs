import { chromium } from 'playwright';
import fs from 'fs';

const OUT = 'C:/Users/Owner/.codex/wt-preview/_audit/g3';
const ids = ['house_renovation', 'deep_home_cleaning', 'move_out_cleaning', 'office_cleaning', 'window_cleaning_quote'];
const VIEWS = {
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false },
  mobile: { width: 375, height: 812, isMobile: true, hasTouch: true },
};

// --- color utilities ---
function parseColor(s) {
  if (!s) return null;
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(',').map(x => parseFloat(x.trim()));
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}
function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lum(c) { return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b); }
function ratio(fg, bg) {
  const L1 = lum(fg), L2 = lum(bg);
  const a = Math.max(L1, L2), b = Math.min(L1, L2);
  return (a + 0.05) / (b + 0.05);
}
function blend(fg, bg) { // fg over bg with alpha
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

const browser = await chromium.launch();
const report = {};

for (const id of ids) {
  report[id] = {};
  for (const [vname, vp] of Object.entries(VIEWS)) {
    const res = { rendered: false, shots: [], contrast: [], alignment: [] };
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    try {
      await p.goto('http://localhost:5099/templates/' + id, { waitUntil: 'domcontentloaded', timeout: 25000 });
    } catch (e) {
      res.blocker = 'nav fail: ' + e.message;
      report[id][vname] = res; await ctx.close(); continue;
    }
    await p.waitForTimeout(2800);

    // locate the main (non-rail) advanced-calculator
    const handle = await p.evaluateHandle(() => {
      const calcs = [...document.querySelectorAll('[data-testid="advanced-calculator"]')];
      for (const el of calcs) {
        let inRail = false, cur = el;
        for (let k = 0; k < 8 && cur; k++) {
          const c = (cur.className?.toString?.() || '') + (cur.getAttribute?.('data-testid') || '');
          if (/rail|tpl-card/.test(c)) { inRail = true; break; }
          cur = cur.parentElement;
        }
        if (!inRail) return el;
      }
      return null;
    });
    const widget = handle.asElement();
    if (!widget) { res.blocker = 'no main widget found'; report[id][vname] = res; await ctx.close(); continue; }
    res.rendered = true;

    await widget.scrollIntoViewIfNeeded();
    await p.waitForTimeout(600);

    const shot1 = `${OUT}/${id}_${vname}_1fields.png`;
    await widget.screenshot({ path: shot1 });
    res.shots.push(shot1);

    // --- contrast + alignment analysis fn (runs in page, scoped to widget) ---
    const analyze = async (label) => {
      const data = await p.evaluate(() => {
        const calcs = [...document.querySelectorAll('[data-testid="advanced-calculator"]')];
        let widget = null;
        for (const el of calcs) {
          let inRail = false, cur = el;
          for (let k = 0; k < 8 && cur; k++) {
            const c = (cur.className?.toString?.() || '') + (cur.getAttribute?.('data-testid') || '');
            if (/rail|tpl-card/.test(c)) { inRail = true; break; }
            cur = cur.parentElement;
          }
          if (!inRail) { widget = el; break; }
        }
        if (!widget) return { texts: [], box: null, overflowers: [] };
        const wrect = widget.getBoundingClientRect();

        function effBg(el) {
          let cur = el;
          while (cur) {
            const cs = getComputedStyle(cur);
            const bg = cs.backgroundColor;
            if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
              const m = bg.match(/rgba?\(([^)]+)\)/);
              if (m) { const pp = m[1].split(',').map(x => parseFloat(x)); if ((pp[3] === undefined ? 1 : pp[3]) > 0) return bg; }
            }
            cur = cur.parentElement;
          }
          return 'rgb(255,255,255)';
        }

        const texts = [];
        const walker = document.createTreeWalker(widget, NodeFilter.SHOW_TEXT, null);
        const seen = new Set();
        let n;
        while ((n = walker.nextNode())) {
          const t = (n.textContent || '').trim();
          if (!t || t.length < 1) continue;
          const el = n.parentElement;
          if (!el) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const key = el.getAttribute('data-testid') + '|' + t.slice(0, 30) + '|' + Math.round(r.top);
          if (seen.has(key)) continue; seen.add(key);
          texts.push({
            text: t.slice(0, 50),
            testid: el.getAttribute('data-testid') || (el.className?.toString?.() || '').slice(0, 30),
            color: cs.color,
            bg: effBg(el),
            fontSize: parseFloat(cs.fontSize),
            fontWeight: cs.fontWeight,
          });
        }

        // overflow / out-of-bounds detection within widget
        const overflowers = [];
        widget.querySelectorAll('*').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          if (r.right > wrect.right + 2 || r.left < wrect.left - 2) {
            const txt = (el.innerText || '').trim().slice(0, 30);
            overflowers.push({ tag: el.tagName, testid: el.getAttribute('data-testid') || (el.className?.toString?.() || '').slice(0, 25), overRight: Math.round(r.right - wrect.right), overLeft: Math.round(wrect.left - r.left), txt });
          }
        });

        return { texts, box: { l: Math.round(wrect.left), t: Math.round(wrect.top), w: Math.round(wrect.width), h: Math.round(wrect.height) }, overflowers: overflowers.slice(0, 15) };
      });
      return { ...data, label };
    };

    const proc = (a) => {
      for (const tx of a.texts) {
        const fg = parseColor(tx.color); let bg = parseColor(tx.bg);
        if (!fg || !bg) continue;
        let effFg = fg.a < 1 ? blend(fg, bg) : fg;
        const cr = ratio(effFg, bg);
        const large = tx.fontSize >= 24 || (tx.fontSize >= 18.66 && parseInt(tx.fontWeight) >= 700);
        const thresh = large ? 3.0 : 4.5;
        if (cr < thresh) {
          res.contrast.push({ screen: a.label, text: tx.text, testid: tx.testid, fg: tx.color, bg: tx.bg, ratio: +cr.toFixed(2), need: thresh, fontSize: tx.fontSize, weight: tx.fontWeight });
        }
      }
      for (const o of a.overflowers) {
        res.alignment.push({ screen: a.label, type: 'overflow', el: o.testid, tag: o.tag, overRight: o.overRight, overLeft: o.overLeft, txt: o.txt });
      }
    };

    proc(await analyze('fields'));

    // --- try to advance through steps / fill fields to reach result ---
    // Strategy: click first option in each visible select/multiselect group, bump number steppers,
    // then click the primary "next/→" or CTA-like button up to a few times.
    let stepShots = 0;
    for (let step = 0; step < 6; step++) {
      // interact with options in the widget body
      const acted = await p.evaluate(() => {
        const calcs = [...document.querySelectorAll('[data-testid="advanced-calculator"]')];
        let widget = null;
        for (const el of calcs) {
          let inRail = false, cur = el;
          for (let k = 0; k < 8 && cur; k++) {
            const c = (cur.className?.toString?.() || '') + (cur.getAttribute?.('data-testid') || '');
            if (/rail|tpl-card/.test(c)) { inRail = true; break; }
            cur = cur.parentElement;
          }
          if (!inRail) { widget = el; break; }
        }
        if (!widget) return false;
        let did = false;
        // single-select / multiselect option buttons
        const opts = [...widget.querySelectorAll('[data-testid^="adv-select-option"],[data-testid^="adv-multiselect-option"],[data-testid^="adv-option"]')];
        const visOpt = opts.find(o => { const r = o.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
        if (visOpt) { visOpt.click(); did = true; }
        // number stepper up
        const up = [...widget.querySelectorAll('[data-testid^="adv-number-step-up"]')].find(o => { const r = o.getBoundingClientRect(); return r.width > 0; });
        if (up) { up.click(); did = true; }
        return did;
      });
      // click a "next" / arrow / continue button if present
      const nextClicked = await p.evaluate(() => {
        const calcs = [...document.querySelectorAll('[data-testid="advanced-calculator"]')];
        let widget = null;
        for (const el of calcs) {
          let inRail = false, cur = el;
          for (let k = 0; k < 8 && cur; k++) {
            const c = (cur.className?.toString?.() || '') + (cur.getAttribute?.('data-testid') || '');
            if (/rail|tpl-card/.test(c)) { inRail = true; break; }
            cur = cur.parentElement;
          }
          if (!inRail) { widget = el; break; }
        }
        if (!widget) return false;
        const btns = [...widget.querySelectorAll('button')];
        const next = btns.find(b => /next|continue|→|see|get|calculate/i.test((b.innerText || '').trim()) && b.getBoundingClientRect().width > 0 && !/adv-number/.test(b.getAttribute('data-testid') || ''));
        if (next) { next.click(); return true; }
        return false;
      });
      await p.waitForTimeout(700);
      if (!acted && !nextClicked) break;
    }
    await p.waitForTimeout(800);

    // screenshot the result/widget after interaction
    const shot2 = `${OUT}/${id}_${vname}_2result.png`;
    try { await widget.scrollIntoViewIfNeeded(); } catch (e) {}
    await widget.screenshot({ path: shot2 });
    res.shots.push(shot2);

    proc(await analyze('result'));

    // dedupe contrast by testid+text+screen
    const seenC = new Set();
    res.contrast = res.contrast.filter(c => { const k = c.screen + c.testid + c.text + c.ratio; if (seenC.has(k)) return false; seenC.add(k); return true; });
    const seenA = new Set();
    res.alignment = res.alignment.filter(a => { const k = a.screen + a.el + a.txt; if (seenA.has(k)) return false; seenA.add(k); return true; });

    report[id][vname] = res;
    await ctx.close();
  }
}

await browser.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

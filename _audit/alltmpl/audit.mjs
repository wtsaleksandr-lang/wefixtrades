import { chromium } from 'playwright';
import fs from 'node:fs';
import { PNG } from 'pngjs';

const BASE = 'http://localhost:5099';
const OUT = 'C:\\Users\\Owner\\.codex\\wt-preview\\_audit\\alltmpl\\';

const TEMPLATES = [
  'driveway_paving',
  'house_renovation',
  'window_replacement_quote',
  'deep_home_cleaning',
  'web_design_quote',
  'energy_upgrade',
];

// ---- color helpers ----
function parseColor(s) {
  if (!s) return null;
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map(x => parseFloat(x.trim()));
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}
function relLum({ r, g, b }) {
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(fg, bg) {
  if (!fg || !bg) return null;
  // composite fg over bg if fg has alpha
  let f = fg;
  if (fg.a < 1) {
    f = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
  }
  const L1 = relLum(f), L2 = relLum(bg);
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}
function sameColor(a, b) {
  if (!a || !b) return false;
  return Math.abs(a.r - b.r) <= 3 && Math.abs(a.g - b.g) <= 3 && Math.abs(a.b - b.b) <= 3;
}
function colStr(c) { return c ? `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})${c.a < 1 ? ' a=' + c.a.toFixed(2) : ''}` : 'n/a'; }

// resolve the effective (non-transparent) background of an element by walking up
async function effBg(locator) {
  return await locator.evaluate(el => {
    let n = el;
    while (n) {
      const bg = getComputedStyle(n).backgroundColor;
      const m = bg.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const p = m[1].split(',').map(x => parseFloat(x.trim()));
        const a = p.length > 3 ? p[3] : 1;
        if (a > 0.01) return bg;
      }
      n = n.parentElement;
    }
    return 'rgb(255,255,255)';
  });
}

async function auditTemplate(ctx, id) {
  const r = { id, tiers: 'n-a', tierLayout: 'n-a', badge: 'n-a', tierContrast: 'n-a', tierEqCta: 'n-a',
    options1Line: 'n-a', casing: 'n-a', trustScroll: 'n-a', whiteBand: 'n-a', panelContrast: 'n-a',
    measures: {}, notes: [] };
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/wizard?template=${id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4500);

    // Confirm template loaded: check heading text or a known testid present
    const previewExists = await page.locator('[data-testid="advanced-calculator"]').count();
    if (!previewExists) { r.notes.push('NO advanced-calculator preview found'); }

    // Scope to the preview widget bezel/clean container if present
    const widget = page.locator('[data-testid="preview-mobile-clean"]').first();
    const widgetExists = await widget.count();
    const scope = widgetExists ? widget : page.locator('[data-testid="advanced-calculator"]').first();

    // === 1. TIER CARDS ===
    const tierSel = page.locator('[data-testid="tier-selector"]');
    const tierCount = await page.locator('[data-testid^="tier-card-"]').evaluateAll(
      els => els.filter(e => /^tier-card-\d+$/.test(e.getAttribute('data-testid'))).length
    ).catch(() => 0);
    if (await tierSel.count() && tierCount > 0) {
      r.tiers = `yes (${tierCount})`;
      // layout: single full-width column? check x-positions + widths
      const cards = [];
      for (let i = 0; i < tierCount; i++) {
        const c = page.locator(`[data-testid="tier-card-${i}"]`).first();
        const bb = await c.boundingBox().catch(() => null);
        if (bb) cards.push({ i, ...bb });
      }
      // single column => all share ~same x and width, and y strictly increasing
      let singleCol = true, overlap = false;
      const xs = cards.map(c => Math.round(c.x));
      const ws = cards.map(c => Math.round(c.width));
      const sameX = Math.max(...xs) - Math.min(...xs) <= 4;
      const sameW = Math.max(...ws) - Math.min(...ws) <= 4;
      for (let i = 1; i < cards.length; i++) {
        if (cards[i].y < cards[i - 1].y + cards[i - 1].height - 6) overlap = true;
        if (Math.abs(cards[i].y - cards[i - 1].y) < 8) singleCol = false; // same row => grid
      }
      singleCol = singleCol && sameX && sameW;
      r.tierLayout = (singleCol && !overlap) ? 'PASS' : 'FAIL';
      r.measures.tierCards = cards.map(c => `#${c.i} x=${Math.round(c.x)} w=${Math.round(c.width)} y=${Math.round(c.y)} h=${Math.round(c.height)}`).join(' | ');
      if (overlap) r.notes.push('tier cards OVERLAP');
      if (!sameX || !sameW) r.notes.push(`tier cards not uniform col (x range ${Math.max(...xs)-Math.min(...xs)}, w range ${Math.max(...ws)-Math.min(...ws)})`);

      // popular badge fully visible
      const badge = page.locator('[data-testid="tier-card-1-popular-badge"]').first();
      if (await badge.count()) {
        const vis = await badge.isVisible().catch(() => false);
        const bb = await badge.boundingBox().catch(() => null);
        const vp = page.viewportSize();
        let fully = vis && bb && bb.x >= -1 && (bb.x + bb.width) <= vp.width + 1 && bb.y >= -1;
        r.badge = fully ? 'PASS' : 'FAIL';
        if (bb) r.measures.badge = `x=${Math.round(bb.x)} w=${Math.round(bb.width)} right=${Math.round(bb.x+bb.width)} vpW=${vp.width}`;
        if (!fully) r.notes.push('popular badge clipped/hidden: ' + r.measures.badge);
      } else { r.badge = 'no-badge'; }

      // contrast on selected/popular card: read price + label text vs card bg
      // find selected card (aria-pressed/selected) else default to popular (card-1)
      const selIdx = await page.evaluate(() => {
        for (let i = 0; i < 3; i++) {
          const el = document.querySelector(`[data-testid="tier-card-${i}"]`);
          if (!el) continue;
          if (el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-selected') === 'true' ||
              el.dataset.selected === 'true' || el.getAttribute('data-state') === 'selected') return i;
        }
        return 1; // popular default
      });
      r.measures.selectedTierIdx = selIdx;
      const selCard = page.locator(`[data-testid="tier-card-${selIdx}"]`).first();
      const cardBgStr = await effBg(selCard);
      const cardBg = parseColor(cardBgStr);
      // Measure ACTUAL visible leaf text nodes inside the card vs each one's own effective bg.
      const leafTexts = await selCard.evaluate(card => {
        const effBg = (el) => { let n = el; while (n) { const c = getComputedStyle(n).backgroundColor; const m = c.match(/rgba?\(([^)]+)\)/); if (m) { const q = m[1].split(',').map(x => parseFloat(x)); if ((q[3] ?? 1) > 0.05) return c; } n = n.parentElement; } return 'rgb(255,255,255)'; };
        const out = [];
        card.querySelectorAll('*').forEach(n => {
          if (n.childElementCount === 0) { const t = (n.innerText || '').trim(); if (t) out.push({ t: t.slice(0, 24), color: getComputedStyle(n).color, bg: effBg(n), fs: Math.round(parseFloat(getComputedStyle(n).fontSize)) }); }
        });
        return out;
      });
      // price = the *-price testid; name = tier label (first non-price, non-badge text)
      let priceItem = leafTexts.find(x => /\$|–|-/.test(x.t) && /\d/.test(x.t)) || leafTexts.find(x => x.fs >= 16);
      let nameItem = leafTexts.find(x => x !== priceItem && /^[A-Za-z]/.test(x.t) && !/popular/i.test(x.t));
      const cPrice = priceItem ? contrast(parseColor(priceItem.color), parseColor(priceItem.bg)) : null;
      const cName = nameItem ? contrast(parseColor(nameItem.color), parseColor(nameItem.bg)) : null;
      // worst contrast across ALL leaf texts (each on its own bg)
      let worstTier = null, worstTierR = 99;
      for (const it of leafTexts) { const cr = contrast(parseColor(it.color), parseColor(it.bg)); if (cr != null && cr < worstTierR) { worstTierR = cr; worstTier = it; } }
      r.measures.tierContrast = `cardBg=${colStr(cardBg)} | price "${priceItem?priceItem.t:'?'}" ${priceItem?priceItem.color:''} ratio=${cPrice?cPrice.toFixed(2):'?'} | name "${nameItem?nameItem.t:'?'}" ratio=${cName?cName.toFixed(2):'?'} | worst "${worstTier?worstTier.t:''}"(fs${worstTier?worstTier.fs:''}) ratio=${worstTierR<99?worstTierR.toFixed(2):'?'}`;
      const priceOk = cPrice && cPrice >= 3;
      const nameOk = cName && cName >= 4.5;
      // also require the worst small-font text to be >=4.5 (price big-font allowed >=3)
      const worstThr = worstTier && worstTier.fs >= 16 ? 3 : 4.5;
      const worstOk = worstTierR >= worstThr;
      r.tierContrast = (priceOk && nameOk && worstOk) ? 'PASS' : 'FAIL';
      if (!priceOk) r.notes.push(`tier price contrast ${cPrice?cPrice.toFixed(2):'?'} < 3`);
      if (!nameOk) r.notes.push(`tier name "${nameItem?nameItem.t:''}" contrast ${cName?cName.toFixed(2):'?'} < 4.5`);
      if (!worstOk) r.notes.push(`tier worst text "${worstTier?worstTier.t:''}" contrast ${worstTierR.toFixed(2)} < ${worstThr} (fs ${worstTier?worstTier.fs:''})`);

      // === tier == CTA bg color ===
      const cta = page.locator('[data-testid="advanced-cta"]').first();
      await cta.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
      const ctaBgStr = (await cta.count()) ? await effBg(cta) : 'rgb(255,255,255)';
      const ctaBg = parseColor(ctaBgStr);
      const eq = sameColor(cardBg, ctaBg);
      r.tierEqCta = eq ? 'PASS' : 'FAIL';
      r.measures.tierEqCta = `tierBg=${colStr(cardBg)} ctaBg=${colStr(ctaBg)} equal=${eq}`;
      if (!eq) r.notes.push(`tier!=CTA bg: tier ${colStr(cardBg)} vs cta ${colStr(ctaBg)}`);
    } else {
      r.tiers = 'no tiers';
    }

    // === 2. OPTIONS SINGLE-LINE ===
    // field labels in preview: preview-field-* labels / select option labels
    const lineInfo = await scope.evaluate(root => {
      const out = [];
      const els = root.querySelectorAll('[data-testid^="preview-field-"], label, [class*="label"], [class*="option"]');
      for (const el of els) {
        const txt = (el.innerText || '').trim();
        if (!txt || txt.length > 60) continue;
        const cs = getComputedStyle(el);
        const lh = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) * 1.3);
        const h = el.getBoundingClientRect().height;
        const lines = h > 0 && lh > 0 ? Math.round(h / lh) : 1;
        const tid = el.getAttribute('data-testid') || '';
        // classify: a "deco" element = the field label/question; "select/option" = the option chip
        const kind = /select|option/.test(tid) || /option/i.test(el.className) ? 'option' : (/deco|label/.test(tid) || /label/i.test(el.className) ? 'label' : 'other');
        const isQuestion = /\?$/.test(txt); // question prompts may legitimately wrap
        if (txt.length > 1) out.push({ t: txt.slice(0, 40), lines, kind, tid, isQuestion });
      }
      return out;
    });
    // Only FAIL on wrapped OPTION chips / short non-question labels. A long question
    // prompt wrapping to 2 lines is acceptable (it's a heading, not a one-line label).
    const wrapped = lineInfo.filter(x => x.lines >= 2);
    const badWrap = wrapped.filter(x => x.kind === 'option' || (!x.isQuestion && x.kind === 'label'));
    r.options1Line = badWrap.length === 0 ? 'PASS' : 'FAIL';
    r.measures.options = `sampled ${lineInfo.length}; wrapped=${wrapped.length} (badWrap=${badWrap.length})` +
      (wrapped.length ? '; wrapped:[' + wrapped.slice(0,5).map(w=>`"${w.t}"(${w.lines}L,${w.kind}${w.isQuestion?',Q':''})`).join(', ') + ']' : '');
    if (badWrap.length) r.notes.push('wrapped option/label: ' + badWrap.slice(0,4).map(w=>`"${w.t}"(${w.kind})`).join(', '));

    // === 3. LABEL CASING ===
    const casing = await scope.evaluate(root => {
      // collect field labels from preview decorations
      const labels = [];
      root.querySelectorAll('[data-testid^="preview-field-deco-"]').forEach(el => {
        const t = (el.innerText || '').trim();
        if (t) labels.push(t.split('\n')[0].trim());
      });
      // fallback: any label element
      if (labels.length < 2) {
        root.querySelectorAll('label').forEach(el => {
          const t = (el.innerText || '').trim();
          if (t && t.length < 50) labels.push(t.split('\n')[0].trim());
        });
      }
      return labels;
    });
    const isAllCaps = s => s.length >= 3 && s === s.toUpperCase() && /[A-Z]/.test(s);
    const allcaps = casing.filter(isAllCaps);
    const sentence = casing.filter(s => !isAllCaps(s) && /[a-z]/.test(s));
    const mixed = allcaps.length > 0 && sentence.length > 0;
    r.casing = casing.length < 2 ? 'n-a' : (mixed ? 'FAIL' : 'PASS');
    r.measures.casing = `${casing.length} labels; allcaps=${allcaps.length} sentence=${sentence.length}` + (mixed ? ` MIX: caps[${allcaps.slice(0,2).join(',')}] vs [${sentence.slice(0,2).join(',')}]` : '');
    if (mixed) r.notes.push('mixed casing: ' + r.measures.casing);

    // === 4. TRUST BADGES ===
    const trustRow = page.locator('[data-testid="trust-badge-row"]').first();
    if (await trustRow.count()) {
      const docW = await page.evaluate(() => document.documentElement.scrollWidth);
      const innerW = await page.evaluate(() => window.innerWidth);
      const rowInfo = await trustRow.evaluate(el => ({
        sw: el.scrollWidth, cw: el.clientWidth,
        overflowX: getComputedStyle(el).overflowX,
        // edge fade: mask-image or a ::after / gradient
        mask: getComputedStyle(el).maskImage + '|' + getComputedStyle(el).webkitMaskImage,
      }));
      const noWiden = Math.abs(docW - innerW) <= 3;
      const scrolls = rowInfo.sw > rowInfo.cw + 2 || ['auto','scroll'].includes(rowInfo.overflowX);
      const hasFade = (rowInfo.mask && rowInfo.mask !== 'none|none' && rowInfo.mask.includes('gradient'));
      r.trustScroll = noWiden ? 'PASS' : 'FAIL';
      r.measures.trust = `docW=${docW} innerW=${innerW} (Δ${docW-innerW}); rowScrollW=${rowInfo.sw} clientW=${rowInfo.cw} overflowX=${rowInfo.overflowX}; fade=${hasFade}`;
      if (!noWiden) r.notes.push(`trust badges widen page: docW ${docW} vs innerW ${innerW}`);
      if (!hasFade) r.notes.push('trust row: no edge-fade mask detected');
    } else {
      r.trustScroll = 'badges-off';
      r.measures.trust = 'no trust-badge-row';
    }

    // === 5. WHITE BAND below widget ===
    // Sample RENDERED pixels (pngjs-decoded screenshot of the preview pane) along a
    // horizontal line just below the widget's painted bottom, inside the pane.
    const bezel = page.locator('[data-testid="preview-bezel-mobile-clean"]').first();
    const bezelExists = await bezel.count();
    const target = bezelExists ? bezel : page.locator('[data-testid="preview-mobile-clean"]').first();
    const pane = page.locator('[data-testid="editor-preview-pane"]').first();
    const paneBox = await pane.boundingBox().catch(() => null);
    const widgetBox = (await target.count()) ? await target.boundingBox().catch(() => null) : null;
    if (paneBox && widgetBox) {
      // capture the preview pane only
      const paneShot = await pane.screenshot().catch(() => null);
      if (paneShot) {
        const png = PNG.sync.read(paneShot);
        const dsf = png.width / Math.round(paneBox.width); // device scale factor of the shot
        // y of widget bottom relative to pane top, in shot px
        const widgetBottomRel = (widgetBox.y + widgetBox.height - paneBox.y) * dsf;
        const sampleYs = [widgetBottomRel + 8 * dsf, widgetBottomRel + 30 * dsf, png.height - 6];
        const samples = [];
        for (const sy0 of sampleYs) {
          const sy = Math.round(sy0);
          if (sy < 0 || sy >= png.height) continue;
          // median-ish: sample 5 x positions across the pane width
          for (const fx of [0.2, 0.35, 0.5, 0.65, 0.8]) {
            const sx = Math.round(png.width * fx);
            const idx = (png.width * sy + sx) * 4;
            samples.push({ y: Math.round(sy / dsf), r: png.data[idx], g: png.data[idx + 1], b: png.data[idx + 2] });
          }
        }
        if (samples.length) {
          // count near-white samples below the widget
          const whites = samples.filter(s => s.r > 240 && s.g > 240 && s.b > 240);
          const avg = c => Math.round(samples.reduce((a, s) => a + s[c], 0) / samples.length);
          const av = { r: avg('r'), g: avg('g'), b: avg('b') };
          r.measures.belowWidget = `widgetBottom~${Math.round(widgetBox.y + widgetBox.height - paneBox.y)}px in pane; samples=${samples.length} whitePx=${whites.length}/${samples.length} avg=${colStr(av)}`;
          const bandPresent = whites.length >= Math.ceil(samples.length * 0.5);
          if (id === 'energy_upgrade') {
            r.whiteBand = 'PASS (light)';
            r.notes.push('light template (white/light below widget is expected): ' + r.measures.belowWidget);
          } else {
            r.whiteBand = bandPresent ? 'FAIL' : 'PASS';
            if (bandPresent) r.notes.push('WHITE BAND below widget on dark template: ' + r.measures.belowWidget);
          }
        } else { r.whiteBand = 'n-a (below fold)'; r.measures.belowWidget = 'widget extends past pane; no band region visible'; }
      } else { r.whiteBand = 'n-a'; r.measures.belowWidget = 'pane screenshot failed'; }
    } else { r.whiteBand = 'n-a'; r.measures.belowWidget = 'no pane/widget box'; }

    // === 6. RESULT PANEL CONTRAST ===
    const panel = page.locator('[data-testid="advanced-result-panel"]').first();
    if (await panel.count()) {
      const panelBgStr = await effBg(panel);
      const panelBg = parseColor(panelBgStr);
      const heading = page.locator('[data-testid="advanced-result-heading"]').first();
      const headColStr = await heading.evaluate(el => getComputedStyle(el).color).catch(() => null);
      const headCol = parseColor(headColStr);
      // line items + price: gather text colors inside panel, EXCLUDING tier-card
      // descendants (they sit on their own card bg, not the panel bg). Measure each
      // leaf text against ITS OWN effective bg.
      const textCols = await panel.evaluate(el => {
        const effBg = (n) => { let p = n; while (p) { const c = getComputedStyle(p).backgroundColor; const m = c.match(/rgba?\(([^)]+)\)/); if (m) { const q = m[1].split(',').map(x => parseFloat(x)); if ((q[3] ?? 1) > 0.05) return c; } p = p.parentElement; } return 'rgb(255,255,255)'; };
        const inTier = (n) => !!n.closest('[data-testid^="tier-card-"],[data-testid="tier-selector"]');
        const out = [];
        const seen = new Set();
        for (const n of el.querySelectorAll('*')) {
          if (n.childElementCount !== 0) continue;
          if (inTier(n)) continue;
          const t = (n.innerText || '').trim();
          if (!t) continue;
          const c = getComputedStyle(n).color;
          const bg = effBg(n);
          const fs = Math.round(parseFloat(getComputedStyle(n).fontSize));
          const key = c + bg + fs;
          if (seen.has(key)) continue; seen.add(key);
          out.push({ t: t.slice(0, 20), c, bg, fs });
        }
        return out.slice(0, 16);
      });
      let minRatio = 99, worst = null;
      for (const tc of textCols) {
        const ratio = contrast(parseColor(tc.c), parseColor(tc.bg));
        if (ratio != null && ratio < minRatio) { minRatio = ratio; worst = { ...tc, ratio }; }
      }
      const headRatio = contrast(headCol, panelBg);
      r.measures.panelContrast = `panelBg=${colStr(panelBg)} heading=${colStr(headCol)}/${headRatio?headRatio.toFixed(2):'?'} | worstText="${worst?worst.t:''}" col=${worst?colStr(parseColor(worst.c)):''} onBg=${worst?colStr(parseColor(worst.bg)):''} ratio=${minRatio<99?minRatio.toFixed(2):'?'} (fs ${worst?worst.fs:'?'})`;
      // price text is large; allow >=3 for big font, >=4.5 for body
      const worstThresh = worst && worst.fs >= 20 ? 3 : 4.5;
      const headOk = headRatio && headRatio >= 4.5;
      const bodyOk = minRatio >= worstThresh;
      r.panelContrast = (headOk && bodyOk) ? 'PASS' : 'FAIL';
      if (!headOk) r.notes.push(`result heading contrast ${headRatio?headRatio.toFixed(2):'?'} < 4.5`);
      if (!bodyOk) r.notes.push(`result text "${worst?worst.t:''}" contrast ${minRatio.toFixed(2)} < ${worstThresh} (fs ${worst?worst.fs:''})`);
    } else {
      r.panelContrast = 'no-panel';
    }

    // screenshot
    await page.screenshot({ path: OUT + id + '_mobile.png', fullPage: false });
    // also full page for review
    await page.screenshot({ path: OUT + id + '_full.png', fullPage: true });
  } catch (e) {
    r.notes.push('ERROR: ' + e.message);
  } finally {
    await page.close();
  }
  return r;
}

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  });
  const results = [];
  for (const id of TEMPLATES) {
    process.stdout.write(`\n=== ${id} ===\n`);
    const r = await auditTemplate(ctx, id);
    results.push(r);
    console.log(JSON.stringify(r, null, 2));
  }
  fs.writeFileSync(OUT + 'results.json', JSON.stringify(results, null, 2));
  await browser.close();
  console.log('\n\nDONE -> results.json');
};
run();

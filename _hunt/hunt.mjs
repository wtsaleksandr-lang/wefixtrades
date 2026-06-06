import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://localhost:5099';
const OUT = 'C:/Users/Owner/.codex/wt-preview/_hunt';
fs.mkdirSync(OUT, { recursive: true });

const DETAIL_IDS = ['car_towing','kitchen_renovation','web_design_quote','moving_service','house_renovation','solar_panel_install','junk_removal_quote','mold_remediation_quote'];

const viewports = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: 'mobile',  width: 375,  height: 812, isMobile: true,  hasTouch: true },
];

const log = [];
function L(s){ console.log(s); log.push(s); }

// Returns overflow report: doc-level + per-section
async function measureOverflow(page) {
  return await page.evaluate(() => {
    const out = { doc: {}, offenders: [] };
    const se = document.scrollingElement || document.documentElement;
    out.doc.scrollWidth = se.scrollWidth;
    out.doc.innerWidth = window.innerWidth;
    out.doc.horizontalScroll = se.scrollWidth - window.innerWidth;
    // find elements wider than viewport (real overflow culprits)
    const vw = window.innerWidth;
    const all = document.querySelectorAll('body *');
    for (const el of all) {
      const r = el.getBoundingClientRect();
      // element extends beyond right edge of viewport by > 1px and is visible
      const style = getComputedStyle(el);
      if (style.position === 'fixed' || style.position === 'sticky') continue;
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 1 || r.left < -1) {
        const overR = Math.round(r.right - vw);
        const overL = Math.round(0 - r.left);
        if (overR > 2 || overL > 2) {
          out.offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className && typeof el.className === 'string') ? el.className.slice(0,80) : '',
            left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
            overR, overL,
          });
        }
      }
    }
    // dedupe-ish: keep widest 15
    out.offenders.sort((a,b)=> (b.overR+b.overL)-(a.overR+a.overL));
    out.offenders = out.offenders.slice(0,15);
    return out;
  });
}

// Analyze a CSS grid of cards: column x-positions, card heights/widths
async function analyzeGrid(page, gridSelector) {
  return await page.evaluate((sel) => {
    const grid = document.querySelector(sel);
    if (!grid) return { found: false };
    const cs = getComputedStyle(grid);
    const cards = Array.from(grid.children).filter(c => {
      const r = c.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const rects = cards.map(c => {
      const r = c.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) };
    });
    // unique column left edges (rounded to 2px buckets)
    const leftsSet = {};
    rects.forEach(r => { const k = Math.round(r.left/2)*2; leftsSet[k]=(leftsSet[k]||0)+1; });
    const widths = rects.map(r=>r.width);
    const heights = rects.map(r=>r.height);
    const uniq = arr => [...new Set(arr)];
    return {
      found: true,
      display: cs.display,
      gridTemplateColumns: cs.gridTemplateColumns,
      gap: cs.gap,
      cardCount: cards.length,
      columnLefts: leftsSet,
      distinctWidths: uniq(widths).sort((a,b)=>a-b),
      minWidth: Math.min(...widths), maxWidth: Math.max(...widths),
      distinctHeights: uniq(heights).sort((a,b)=>a-b).length,
      minHeight: Math.min(...heights), maxHeight: Math.max(...heights),
      sampleRects: rects.slice(0,12),
    };
  }, gridSelector);
}

(async () => {
  const browser = await chromium.launch();
  for (const vp of viewports) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile, hasTouch: vp.hasTouch,
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();

    // ---------- /templates grid ----------
    L(`\n========== [${vp.name}] /templates ==========`);
    await page.goto(`${BASE}/templates`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const ov = await measureOverflow(page);
    L(`doc scrollWidth=${ov.doc.scrollWidth} innerWidth=${ov.doc.innerWidth} horizontalScroll=${ov.doc.horizontalScroll}`);
    if (ov.offenders.length) { L('OVERFLOW offenders:'); ov.offenders.forEach(o=>L('  '+JSON.stringify(o))); }
    else L('no overflow offenders');

    // try several grid selectors
    const gridSelectors = [
      '[data-testid="template-grid"]',
      '.template-grid',
      '[class*="grid"][class*="template"]',
    ];
    let gridInfo = null, usedSel = null;
    // heuristic: find the container with the most card-like children
    const autoSel = await page.evaluate(() => {
      // find element with most direct children that look like cards (have a link or heading)
      const candidates = Array.from(document.querySelectorAll('div, section, ul'));
      let best = null, bestScore = 0;
      for (const el of candidates) {
        const kids = Array.from(el.children);
        if (kids.length < 6) continue;
        const cardish = kids.filter(k => k.querySelector('a, h2, h3') && k.getBoundingClientRect().height > 60);
        if (cardish.length >= 6 && cardish.length > bestScore) {
          // skip if it's basically the whole body
          bestScore = cardish.length;
          // build a selector
          let s = el.tagName.toLowerCase();
          if (el.id) s += '#'+el.id;
          else if (el.className && typeof el.className==='string') s += '.'+el.className.trim().split(/\s+/).slice(0,2).join('.');
          best = { selector: s, count: cardish.length, cls: el.className };
        }
      }
      return best;
    });
    L('auto-detected grid: ' + JSON.stringify(autoSel));
    if (autoSel) { gridInfo = await analyzeGrid(page, autoSel.selector); usedSel = autoSel.selector; }
    L(`grid analysis (${usedSel}): ` + JSON.stringify(gridInfo, null, 1));

    // duplicate titles
    const titles = await page.evaluate(() => {
      const hs = Array.from(document.querySelectorAll('h2, h3, [class*="title"], [class*="Title"]'));
      const texts = hs.map(h=>h.textContent.trim()).filter(t=>t.length>2 && t.length<60);
      return texts;
    });
    // also try card-link titles
    const cardTitles = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/templates/"]'));
      return links.map(a => a.textContent.trim().split('\n')[0].trim()).filter(t=>t.length>2);
    });
    const countDupes = (arr) => {
      const m = {}; arr.forEach(t=>m[t]=(m[t]||0)+1);
      return Object.entries(m).filter(([k,v])=>v>1);
    };
    L(`heading-like titles count=${titles.length}, unique=${new Set(titles).size}`);
    L(`card-link titles count=${cardTitles.length}, unique=${new Set(cardTitles).size}`);
    const dupes = countDupes(cardTitles.filter(Boolean));
    L('DUPLICATE card titles: ' + JSON.stringify(dupes));

    await page.screenshot({ path: `${OUT}/templates_${vp.name}.png`, fullPage: true });
    L(`screenshot: templates_${vp.name}.png`);

    // ---------- detail pages ----------
    for (const id of DETAIL_IDS) {
      L(`\n---------- [${vp.name}] /templates/${id} ----------`);
      const resp = await page.goto(`${BASE}/templates/${id}`, { waitUntil: 'domcontentloaded' }).catch(e=>null);
      await page.waitForTimeout(900);
      const status = resp ? resp.status() : 'ERR';
      const dov = await measureOverflow(page);
      L(`status=${status} doc scrollWidth=${dov.doc.scrollWidth} innerWidth=${dov.doc.innerWidth} horizontalScroll=${dov.doc.horizontalScroll}`);
      if (dov.offenders.length) { L('OVERFLOW offenders:'); dov.offenders.forEach(o=>L('  '+JSON.stringify(o))); }
      else L('no overflow offenders');
      await page.screenshot({ path: `${OUT}/detail_${id}_${vp.name}.png`, fullPage: true });
      L(`screenshot: detail_${id}_${vp.name}.png`);
    }

    // ---------- wizard ----------
    L(`\n========== [${vp.name}] /wizard ==========`);
    await page.goto(`${BASE}/wizard`, { waitUntil: 'domcontentloaded' }).catch(()=>{});
    await page.waitForTimeout(1500);
    const wov = await measureOverflow(page);
    L(`doc scrollWidth=${wov.doc.scrollWidth} innerWidth=${wov.doc.innerWidth} horizontalScroll=${wov.doc.horizontalScroll}`);
    if (wov.offenders.length) { L('OVERFLOW offenders:'); wov.offenders.forEach(o=>L('  '+JSON.stringify(o))); }
    await page.screenshot({ path: `${OUT}/wizard_initial_${vp.name}.png`, fullPage: true });
    L(`screenshot: wizard_initial_${vp.name}.png`);

    // try to find Build tab
    const buildClicked = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('button, a, [role="tab"], [class*="tab"]'));
      const b = els.find(e => /build/i.test(e.textContent) && e.textContent.length < 30);
      if (b) { b.click(); return b.textContent.trim(); }
      return null;
    });
    L('Build tab clicked: ' + JSON.stringify(buildClicked));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/wizard_build_${vp.name}.png`, fullPage: true });
    L(`screenshot: wizard_build_${vp.name}.png`);

    // try to open "Browse all" gallery
    const browseClicked = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('button, a'));
      const b = els.find(e => /browse all|browse templates|all templates|view all/i.test(e.textContent) && e.textContent.length < 40);
      if (b) { b.click(); return b.textContent.trim(); }
      return null;
    });
    L('Browse-all clicked: ' + JSON.stringify(browseClicked));
    await page.waitForTimeout(1200);
    const gov = await measureOverflow(page);
    L(`gallery doc scrollWidth=${gov.doc.scrollWidth} innerWidth=${gov.doc.innerWidth} horizontalScroll=${gov.doc.horizontalScroll}`);
    // analyze gallery grid if modal present
    const galSel = await page.evaluate(() => {
      const modal = document.querySelector('[role="dialog"], [class*="modal"], [class*="Modal"], [class*="dialog"]');
      const scope = modal || document.body;
      const candidates = Array.from(scope.querySelectorAll('div, ul'));
      let best=null, score=0;
      for (const el of candidates) {
        const kids = Array.from(el.children);
        if (kids.length<6) continue;
        const cardish = kids.filter(k => k.getBoundingClientRect().height>50 && k.getBoundingClientRect().width>50);
        if (cardish.length>=6 && cardish.length>score) {
          score=cardish.length;
          let s = el.tagName.toLowerCase();
          if (el.className && typeof el.className==='string') s += '.'+el.className.trim().split(/\s+/).slice(0,2).join('.');
          best={selector:s,count:cardish.length, inModal: !!modal};
        }
      }
      return best;
    });
    L('gallery grid auto: ' + JSON.stringify(galSel));
    if (galSel) { const gi = await analyzeGrid(page, galSel.selector); L('gallery grid analysis: '+JSON.stringify(gi,null,1)); }
    const galTitles = await page.evaluate(() => {
      const modal = document.querySelector('[role="dialog"], [class*="modal"], [class*="Modal"]');
      const scope = modal || document.body;
      const hs = Array.from(scope.querySelectorAll('h2,h3,h4,[class*="title"]'));
      return hs.map(h=>h.textContent.trim()).filter(t=>t.length>2&&t.length<50);
    });
    const galDupes = (()=>{const m={};galTitles.forEach(t=>m[t]=(m[t]||0)+1);return Object.entries(m).filter(([k,v])=>v>1);})();
    L(`gallery titles count=${galTitles.length} unique=${new Set(galTitles).size}`);
    L('gallery DUPLICATE titles: ' + JSON.stringify(galDupes));
    await page.screenshot({ path: `${OUT}/wizard_gallery_${vp.name}.png`, fullPage: true });
    L(`screenshot: wizard_gallery_${vp.name}.png`);

    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(`${OUT}/report.txt`, log.join('\n'));
  console.log('\n=== DONE. report.txt written ===');
})().catch(e=>{ console.error('FATAL', e); process.exit(1); });

import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import fs from 'fs';

const BASE = 'http://localhost:5099';
const OUT = 'C:/Users/Owner/.codex/wt-preview/_audit/sweep/A';

const ROUTES = [
  '/', '/about', '/ai-receptionists', '/blog', '/bundles', '/calculator',
  '/case-studies', '/checkout/cancelled', '/checkout/success', '/citation-builder',
  '/citation-tracker', '/compare/reputationshield-vs-nicejob', '/contact',
  '/contentflow', '/cookies', '/demo', '/demos', '/demos/rankflow',
  '/demos/reputationshield', '/demos/socialsync', '/design-showcase',
];

const VIEWPORTS = [
  { name: 'DESKTOP', width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: 'MOBILE', width: 375, height: 812, isMobile: true, hasTouch: true },
];

// noise filter for console/network
function isNetworkNoise(t) {
  if (!t) return false;
  const s = String(t);
  return /Failed to fetch|ERR_|AbortError|net::|\/api\/|status (4|5)\d\d|NetworkError|Load failed|ERR_NETWORK|the server responded with a status|404|403|401|500|502|503|fetch/i.test(s);
}

const slug = (r) => r.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home';

const results = {};

const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  for (const route of ROUTES) {
    const key = `${route}::${vp.name}`;
    const rec = { jsExceptions: [], consoleErrors: [], brokenImgs: [], a11y: [], overflow: [], crash: null };
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile, hasTouch: vp.hasTouch,
    });
    const page = await ctx.newPage();

    page.on('pageerror', (err) => {
      rec.jsExceptions.push(err && err.message ? err.message : String(err));
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const txt = msg.text();
        if (!isNetworkNoise(txt)) rec.consoleErrors.push(txt);
      }
    });
    // also capture unhandledrejection / window error via init script
    await page.addInitScript(() => {
      window.__sweepErrors = [];
      window.addEventListener('error', (e) => {
        try { window.__sweepErrors.push('window.error: ' + (e.message || (e.error && e.error.message) || String(e))); } catch (_) {}
      });
      window.addEventListener('unhandledrejection', (e) => {
        try { window.__sweepErrors.push('unhandledrejection: ' + ((e.reason && e.reason.message) || String(e.reason))); } catch (_) {}
      });
    });

    try {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      rec.crash = 'navigation failed: ' + e.message;
    }
    await page.waitForTimeout(2500);

    // window-level errors
    try {
      const we = await page.evaluate(() => window.__sweepErrors || []);
      for (const e of we) if (!isNetworkNoise(e)) rec.jsExceptions.push(e);
    } catch (_) {}

    // crash / blank detection
    try {
      const info = await page.evaluate(() => {
        const bodyText = (document.body && document.body.innerText || '').trim();
        const html = document.documentElement.innerHTML || '';
        const crashWords = /something went wrong|application error|an unexpected error|this page (didn't|did not) load/i;
        const found = crashWords.test(bodyText);
        return { textLen: bodyText.length, crashText: found ? bodyText.slice(0, 200) : null,
          rootChildren: (document.getElementById('root') || document.body).children.length };
      });
      if (info.crashText) rec.crash = 'crash text: ' + info.crashText;
      else if (info.textLen < 30 && info.rootChildren <= 1) rec.crash = `blank page (textLen=${info.textLen}, rootChildren=${info.rootChildren})`;
      rec.textLen = info.textLen;
    } catch (e) { rec.crash = (rec.crash || '') + ' eval-failed:' + e.message; }

    // broken images
    try {
      rec.brokenImgs = await page.evaluate(() => {
        const out = [];
        for (const img of Array.from(document.images)) {
          const src = img.currentSrc || img.src || '';
          if (!src || src.startsWith('data:')) continue;
          if (img.complete && img.naturalWidth === 0) out.push(src);
        }
        return out;
      });
    } catch (_) {}

    // layout overflow
    try {
      rec.overflow = await page.evaluate(() => {
        const out = [];
        const iw = window.innerWidth;
        const de = document.documentElement;
        if (de.scrollWidth > iw + 2) out.push({ sel: 'document', amt: de.scrollWidth - iw });
        // find offending visible elements
        const all = document.querySelectorAll('body *');
        let count = 0;
        for (const el of all) {
          if (count > 12) break;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.right > iw + 2) {
            // skip if ancestor is horizontal-scroll container
            let p = el.parentElement, skip = false;
            while (p) { const ov = getComputedStyle(p).overflowX; if (ov === 'auto' || ov === 'scroll') { skip = true; break; } p = p.parentElement; }
            if (skip) continue;
            const cs = getComputedStyle(el);
            if (cs.position === 'fixed') continue;
            const id = el.id ? '#' + el.id : '';
            const cls = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
            out.push({ sel: el.tagName.toLowerCase() + id + cls, amt: Math.round(r.right - iw) });
            count++;
          }
        }
        return out;
      });
    } catch (_) {}

    // a11y - axe critical + serious
    try {
      const axe = await new AxeBuilder({ page }).analyze();
      rec.a11y = axe.violations
        .filter(v => v.impact === 'critical' || v.impact === 'serious')
        .map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
    } catch (e) { rec.a11y = [{ id: 'axe-failed', impact: 'serious', nodes: 0, err: e.message }]; }

    // screenshot for crash/overflow/brokenimg
    const needShot = rec.crash || rec.overflow.length || rec.brokenImgs.length;
    if (needShot) {
      const fn = `${slug(route)}_${vp.name}.png`;
      try { await page.screenshot({ path: `${OUT}/${fn}`, fullPage: false }); rec.shot = fn; } catch (_) {}
    }

    results[key] = rec;
    await ctx.close();
    process.stderr.write(`done ${key}\n`);
  }
}

await browser.close();
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log('WROTE results.json');

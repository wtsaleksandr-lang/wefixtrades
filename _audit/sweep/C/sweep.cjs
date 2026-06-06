// Read-only Playwright error sweep for WeFixTrades preview (port 5099).
// No file modification beyond writing screenshots/results under this dir.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:5099';
const OUT = __dirname;
const AXE = path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js');

const ROUTES = [
  '/missed-call-calculator', '/plans', '/platform', '/pricing',
  '/pricing/quotequick', '/privacy', '/product', '/products',
  '/products/ai-chat', '/products/ai-voice', '/products/assistants',
  '/products/booking-addon', '/products/fix-and-optimize',
  '/products/quickquote', '/products/quotequick',
  '/products/tradeline-complete', '/quote-demo', '/resources',
  '/security', '/services', '/signup', '/signup/business',
];

const VIEWPORTS = [
  { name: 'DESKTOP', width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: 'MOBILE', width: 375, height: 812, isMobile: true, hasTouch: true },
];

// Network-noise filter: ignore anything that's a backend/fetch/network failure.
function isNetworkNoise(s) {
  if (!s) return false;
  const t = s.toLowerCase();
  return (
    t.includes('failed to fetch') ||
    t.includes('networkerror') ||
    t.includes('err_') ||
    t.includes('aborterror') ||
    t.includes('the user aborted') ||
    t.includes('/api/') ||
    t.includes('net::') ||
    t.includes('load failed') ||
    /\b(4\d\d|5\d\d)\b.*(status|error|response)/.test(t) ||
    t.includes('status code 4') ||
    t.includes('status code 5') ||
    t.includes('xhr') ||
    t.includes('fetch') ||
    t.includes('econnrefused') ||
    t.includes('cors')
  );
}

const safe = (r, v) => (r.replace(/\//g, '_').replace(/^_/, '') || 'root') + '__' + v;

(async () => {
  const browser = await chromium.launch();
  const results = {};

  for (const vp of VIEWPORTS) {
    for (const route of ROUTES) {
      const key = route + ' [' + vp.name + ']';
      const defects = [];
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        hasTouch: vp.hasTouch,
        deviceScaleFactor: 1,
      });
      const page = await ctx.newPage();

      // Hook errors BEFORE navigation.
      page.on('pageerror', (err) => {
        const m = (err && (err.message || String(err))) || 'unknown';
        if (!isNetworkNoise(m)) defects.push({ t: 'JS-EXCEPTION', d: m });
      });
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const txt = msg.text();
        if (!isNetworkNoise(txt)) defects.push({ t: 'CONSOLE', d: txt });
      });
      // Inject window error + unhandledrejection listeners as init script.
      await page.addInitScript(() => {
        window.__sweepErrors = [];
        window.addEventListener('error', (e) => {
          window.__sweepErrors.push('window.error: ' + (e.message || (e.error && e.error.message) || ''));
        });
        window.addEventListener('unhandledrejection', (e) => {
          const r = e.reason;
          window.__sweepErrors.push('unhandledrejection: ' + ((r && (r.message || r)) || ''));
        });
      });

      try {
        await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 25000 });
      } catch (e) {
        // networkidle may never fire w/o backend; fall back to domcontentloaded.
        try {
          await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 20000 });
        } catch (e2) {
          defects.push({ t: 'NAV', d: 'navigation failed: ' + (e2.message || e2) });
        }
      }
      // settle for client render / late errors
      await page.waitForTimeout(2500);

      // Pull window-level errors
      try {
        const winErrs = await page.evaluate(() => window.__sweepErrors || []);
        for (const we of winErrs) {
          if (!isNetworkNoise(we)) defects.push({ t: 'JS-EXCEPTION', d: we });
        }
      } catch {}

      // CRASH detection: blank render or error-boundary text
      try {
        const crash = await page.evaluate(() => {
          const root = document.querySelector('#root, #app, [data-reactroot], main') || document.body;
          const txt = (document.body.innerText || '').trim();
          const lower = txt.toLowerCase();
          const boundary =
            lower.includes('something went wrong') ||
            lower.includes('application error') ||
            lower.includes('unexpected error has occurred') ||
            lower.includes('this page isn') && lower.includes('working');
          const visibleEls = document.body.querySelectorAll('*').length;
          const blank = txt.length < 5 && visibleEls < 8;
          return { boundary, blank, len: txt.length, sample: txt.slice(0, 80) };
        });
        if (crash.boundary) defects.push({ t: 'CRASH', d: 'error-boundary text: "' + crash.sample + '"', shot: true });
        if (crash.blank) defects.push({ t: 'CRASH', d: 'blank/white render (body text len=' + crash.len + ')', shot: true });
      } catch {}

      // BROKEN-IMG
      try {
        const broken = await page.evaluate(() => {
          const out = [];
          for (const img of Array.from(document.images)) {
            const src = img.currentSrc || img.src || '';
            if (!src) continue;
            if (src.startsWith('data:') && src.length < 60) continue; // empty data uri
            if (img.complete && img.naturalWidth === 0) out.push(src);
          }
          return out;
        });
        for (const src of broken) defects.push({ t: 'BROKEN-IMG', d: src, shot: true });
      } catch {}

      // OVERFLOW
      try {
        const overflow = await page.evaluate((vw) => {
          const out = [];
          const docW = document.documentElement.scrollWidth;
          if (docW > window.innerWidth + 2) {
            out.push({ sel: 'document', amt: docW - window.innerWidth });
          }
          const cssEsc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);
          function selFor(el) {
            if (el.id) return '#' + cssEsc(el.id);
            let s = el.tagName.toLowerCase();
            if (el.className && typeof el.className === 'string') {
              const c = el.className.trim().split(/\s+/).slice(0, 2).map(cssEsc).join('.');
              if (c) s += '.' + c;
            }
            return s;
          }
          const all = document.body.querySelectorAll('*');
          let count = 0;
          for (const el of all) {
            if (count > 12) break;
            const cs = getComputedStyle(el);
            if (cs.position === 'fixed') continue;
            const ox = cs.overflowX;
            if (ox === 'auto' || ox === 'scroll') continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (r.right > window.innerWidth + 2) {
              // skip if an ancestor is a scroll carousel
              let anc = el.parentElement, skip = false;
              while (anc) {
                const ax = getComputedStyle(anc).overflowX;
                if (ax === 'auto' || ax === 'scroll') { skip = true; break; }
                anc = anc.parentElement;
              }
              if (skip) continue;
              out.push({ sel: selFor(el), amt: Math.round(r.right - window.innerWidth) });
              count++;
            }
          }
          return out;
        }, vp.width);
        // dedupe by selector
        const seen = new Set();
        for (const o of overflow) {
          const k = o.sel + '|' + o.amt;
          if (seen.has(k)) continue;
          seen.add(k);
          defects.push({ t: 'OVERFLOW', d: o.sel + ' (+' + o.amt + 'px past viewport)', shot: true });
        }
      } catch {}

      // A11Y via axe-core (critical+serious only)
      try {
        await page.addScriptTag({ path: AXE });
        const ax = await page.evaluate(async () => {
          if (!window.axe) return [];
          const res = await window.axe.run(document, {
            resultTypes: ['violations'],
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
          });
          return res.violations
            .filter((v) => v.impact === 'critical' || v.impact === 'serious')
            .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
        });
        for (const v of ax) defects.push({ t: 'A11Y', d: v.id + ' (' + v.impact + ', ' + v.nodes + ' nodes)' });
      } catch (e) {
        // axe inject failed - record once, non-fatal
        defects.push({ t: 'A11Y', d: 'axe-run-failed: ' + (e.message || e) });
      }

      // Screenshot only when a shot-worthy defect exists
      const needShot = defects.some((d) => d.shot);
      if (needShot) {
        const file = path.join(OUT, safe(route, vp.name) + '.png');
        try {
          await page.screenshot({ path: file, fullPage: true });
          for (const d of defects) if (d.shot) d.file = path.basename(file);
        } catch {}
      }

      results[key] = defects;
      process.stdout.write('done ' + key + ' (' + defects.length + ' defects)\n');
      await ctx.close();
    }
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  console.log('\n=== SWEEP COMPLETE ===');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });

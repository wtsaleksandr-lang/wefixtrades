const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:5099';
const OUT = __dirname;
const AXE = fs.readFileSync(require.resolve('axe-core'), 'utf8');

const ROUTES = [
  '/docs', '/docs/ai', '/docs/api', '/docs/booking', '/docs/domain', '/docs/embed',
  '/docs/mapguard', '/docs/reputationshield', '/docs/troubleshooting', '/docs/webhooks',
  '/features/ai-employee', '/features/booking', '/features/calculator-engine',
  '/features/instant-quotes', '/features/sms', '/for-agencies', '/for-franchises',
  '/for-solo-traders', '/free-audit', '/free-tools', '/mapguard-suite',
];

const VIEWPORTS = [
  { name: 'DESKTOP', width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: 'MOBILE', width: 375, height: 812, isMobile: true, hasTouch: true },
];

// suppress network/backend noise (no API backend in this build)
function isNetworkNoise(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return (
    t.includes('failed to fetch') ||
    t.includes('networkerror') ||
    t.includes('err_') ||
    t.includes('aborterror') ||
    t.includes('the user aborted') ||
    t.includes('/api/') ||
    t.includes('load resource') ||
    t.includes('net::') ||
    t.includes('status of 4') ||
    t.includes('status of 5') ||
    t.includes('http error') ||
    t.includes('xhr') ||
    t.includes('fetch')
  );
}

function safeName(route, vp, suffix) {
  return route.replace(/[\/]/g, '_').replace(/^_/, '') + `__${vp}${suffix}`;
}

(async () => {
  const browser = await chromium.launch();
  const report = {};

  for (const route of ROUTES) {
    report[route] = {};
    for (const vp of VIEWPORTS) {
      const defects = [];
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        hasTouch: vp.hasTouch,
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();

      // listeners BEFORE navigation
      page.on('pageerror', (err) => {
        const msg = err && err.message ? err.message : String(err);
        if (!isNetworkNoise(msg)) defects.push({ type: 'JS-EXCEPTION', detail: msg, vp: vp.name });
      });
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const text = m.text();
        if (!isNetworkNoise(text)) defects.push({ type: 'CONSOLE', detail: text, vp: vp.name });
      });

      try {
        await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 20000 });
      } catch (e) {
        defects.push({ type: 'CONSOLE', detail: 'nav-failed: ' + e.message, vp: vp.name });
      }
      // short settle for SPA render (NOT networkidle)
      await page.waitForTimeout(2000);

      // CRASH detection
      let crash = null;
      try {
        const bodyText = (await page.evaluate(() => document.body ? document.body.innerText : '')) || '';
        const visibleLen = bodyText.replace(/\s+/g, '').length;
        const rootHtmlLen = await page.evaluate(() => {
          const r = document.getElementById('root') || document.querySelector('#app') || document.body;
          return r ? r.innerHTML.length : 0;
        });
        const lc = bodyText.toLowerCase();
        if (lc.includes('something went wrong') || lc.includes('this page crashed') ||
            lc.includes('application error') || lc.includes('error boundary')) {
          crash = 'error-boundary-text: ' + bodyText.slice(0, 140).replace(/\n/g, ' ');
        } else if (visibleLen < 5 && rootHtmlLen < 50) {
          crash = `blank-render (visibleChars=${visibleLen}, rootHtml=${rootHtmlLen})`;
        }
      } catch (e) {
        crash = 'crash-check-failed: ' + e.message;
      }
      if (crash) {
        const shot = safeName(route, vp.name, '__CRASH.png');
        try { await page.screenshot({ path: path.join(OUT, shot), fullPage: true }); } catch {}
        defects.push({ type: 'CRASH', detail: crash, vp: vp.name, shot });
      }

      // BROKEN-IMG
      try {
        const broken = await page.evaluate(() => {
          const out = [];
          document.querySelectorAll('img').forEach((img) => {
            const src = img.currentSrc || img.src || '';
            if (!src) return;
            if (src.startsWith('data:') && src.length < 60) return;
            if (img.complete && img.naturalWidth === 0) out.push(src.slice(0, 200));
          });
          return out;
        });
        broken.forEach((src) => defects.push({ type: 'BROKEN-IMG', detail: src, vp: vp.name }));
        if (broken.length) {
          const shot = safeName(route, vp.name, '__BROKENIMG.png');
          try { await page.screenshot({ path: path.join(OUT, shot), fullPage: false }); } catch {}
          defects.filter(d => d.type === 'BROKEN-IMG' && d.vp === vp.name && !d.shot).forEach(d => d.shot = shot);
        }
      } catch {}

      // OVERFLOW (ignore overflow-x auto/scroll carousels AND their children)
      try {
        const overflow = await page.evaluate(() => {
          const iw = window.innerWidth;
          const res = [];
          const sw = document.documentElement.scrollWidth;
          if (sw > iw + 2) res.push({ sel: 'document', amount: sw - iw });

          // mark scroll containers + descendants to ignore
          const scrollers = new Set();
          document.querySelectorAll('body *').forEach((el) => {
            const ox = getComputedStyle(el).overflowX;
            if (ox === 'auto' || ox === 'scroll') {
              scrollers.add(el);
              el.querySelectorAll('*').forEach((c) => scrollers.add(c));
            }
          });

          const els = document.querySelectorAll('body *');
          let count = 0;
          for (const el of els) {
            if (count > 8) break;
            if (scrollers.has(el)) continue;
            const style = getComputedStyle(el);
            if (style.position === 'fixed') continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (r.right > iw + 2) {
              let sel = el.tagName.toLowerCase();
              if (el.id) sel += '#' + el.id;
              else if (el.className && typeof el.className === 'string') {
                sel += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
              }
              res.push({ sel, amount: Math.round(r.right - iw) });
              count++;
            }
          }
          return res;
        });
        overflow.forEach((o) => defects.push({ type: 'OVERFLOW', detail: `${o.sel} +${o.amount}px`, vp: vp.name, overflow: true }));
        if (overflow.length) {
          const shot = safeName(route, vp.name, '__OVERFLOW.png');
          try { await page.screenshot({ path: path.join(OUT, shot), fullPage: false }); } catch {}
          defects.filter(d => d.type === 'OVERFLOW' && d.vp === vp.name && !d.shot).forEach(d => d.shot = shot);
        }
      } catch {}

      // A11Y (critical + serious only)
      try {
        await page.evaluate(AXE);
        const results = await page.evaluate(async () => {
          return await window.axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
          });
        });
        (results.violations || [])
          .filter((v) => v.impact === 'critical' || v.impact === 'serious')
          .forEach((v) => {
            defects.push({ type: 'A11Y', detail: `${v.id} (${v.impact}) nodes=${v.nodes.length}`, vp: vp.name });
          });
      } catch (e) {}

      report[route][vp.name] = defects;
      await context.close();
      console.error(`done ${route} ${vp.name} (${defects.length} defects)`);
    }
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

  for (const route of ROUTES) {
    const all = [...(report[route].DESKTOP || []), ...(report[route].MOBILE || [])];
    if (all.length === 0) {
      console.log(`ROUTE ${route}: OK`);
    } else {
      console.log(`ROUTE ${route}:`);
      all.forEach((d) => {
        console.log(`  [${d.type}] ${d.detail} (${d.vp})${d.shot ? ' -> ' + d.shot : ''}`);
      });
    }
  }
  console.log('\n=== JSON written to report.json ===');
})();

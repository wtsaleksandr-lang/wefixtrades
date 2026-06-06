import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = 'https://wefixtrades.com';
const OUT = 'C:\\Users\\Owner\\.codex\\wt-preview\\_audit\\prod\\B';

const ROUTES = [
  '/tools', '/tools/free-audit', '/tools/local-rank-tracker', '/tools/local-serp-checker',
  '/tools/map-snapshot', '/tools/citation-checker', '/tools/google-review-link-generator',
  '/tools/missed-call-calculator', '/free-audit', '/free-tools',
  '/features/ai-employee', '/features/booking', '/features/calculator-engine',
  '/features/instant-quotes', '/features/sms',
  '/docs', '/docs/api', '/docs/embed', '/docs/webhooks', '/docs/domain',
];

const VIEWPORTS = [
  { name: 'DESKTOP', width: 1440, height: 900 },
  { name: 'MOBILE', width: 375, height: 812 },
];

const noisy = (u) => /google-analytics|googletagmanager|doubleclick|gtag|facebook|fbevents|hotjar|clarity|segment|sentry|intercom|analytics|favicon\.ico|gstatic|fonts\.googleapis|cdn\.jsdelivr|ads|adsystem|posthog|mixpanel/i.test(u || '');

function slug(s) { return s.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root'; }

const results = [];

const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  for (const route of ROUTES) {
    const url = BASE + route;
    const rec = { route, viewport: vp.name, defects: [], httpStatus: null };
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, userAgent: 'Mozilla/5.0 (audit-readonly Playwright)' });
    const page = await context.newPage();

    page.on('pageerror', (err) => {
      rec.defects.push({ type: 'JS-EXCEPTION', detail: String(err && err.message ? err.message : err).slice(0, 300) });
    });
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const txt = msg.text();
      if (noisy(txt)) return;
      rec.defects.push({ type: 'CONSOLE', detail: txt.slice(0, 300) });
    });
    page.on('response', (resp) => {
      try {
        const u = resp.url();
        const st = resp.status();
        if (st >= 500 && u.includes('wefixtrades.com')) {
          rec.defects.push({ type: 'NET-5xx', detail: `${st} ${u}`.slice(0, 300) });
        }
      } catch {}
    });

    let resp = null;
    try {
      resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      rec.httpStatus = resp ? resp.status() : null;
      if (resp && resp.status() >= 400) {
        rec.defects.push({ type: 'HTTP', detail: `main document ${resp.status()}` });
      }
      await page.waitForTimeout(2500);
      try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
    } catch (e) {
      rec.defects.push({ type: 'HTTP', detail: `navigation failed: ${String(e.message).slice(0, 200)}` });
    }

    // CRASH / blank render check
    try {
      const info = await page.evaluate(() => {
        const bodyText = (document.body && document.body.innerText || '').trim();
        const errBoundary = !!document.querySelector('[data-error-boundary], .error-boundary');
        const hasMain = !!document.querySelector('main, #root > *, [role=main]');
        return { textLen: bodyText.length, errBoundary, hasMain, rootChildren: (document.getElementById('root')?.children.length) ?? -1 };
      });
      if (info.errBoundary) rec.defects.push({ type: 'CRASH', detail: 'error-boundary element present' });
      if (info.textLen < 30 && rec.httpStatus && rec.httpStatus < 400) {
        rec.defects.push({ type: 'CRASH', detail: `near-blank render textLen=${info.textLen} rootChildren=${info.rootChildren}` });
      }
    } catch {}

    // BROKEN-IMG
    try {
      const broken = await page.evaluate(() => {
        const out = [];
        for (const img of Array.from(document.images)) {
          if (img.complete && img.naturalWidth === 0 && img.currentSrc) {
            out.push(img.currentSrc);
          }
        }
        return out.slice(0, 20);
      });
      for (const b of broken) {
        if (noisy(b)) continue;
        rec.defects.push({ type: 'BROKEN-IMG', detail: b.slice(0, 300) });
      }
    } catch {}

    // OVERFLOW
    try {
      const ov = await page.evaluate(() => {
        const iw = window.innerWidth;
        const docW = document.documentElement.scrollWidth;
        const out = { docOverflow: docW - iw, offenders: [] };
        if (docW > iw + 2) {
          const els = Array.from(document.querySelectorAll('body *'));
          for (const el of els) {
            const cs = getComputedStyle(el);
            if (/(auto|scroll)/.test(cs.overflowX)) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            const over = r.right - iw;
            if (over > 2) {
              // skip if any ancestor is overflow auto/scroll
              let anc = el.parentElement, skip = false;
              while (anc) { const acs = getComputedStyle(anc); if (/(auto|scroll|clip|hidden)/.test(acs.overflowX)) { skip = true; break; } anc = anc.parentElement; }
              if (skip) continue;
              out.offenders.push({ tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 60), over: Math.round(over), right: Math.round(r.right) });
            }
          }
        }
        // dedupe-ish, keep biggest few
        out.offenders.sort((a, b) => b.over - a.over);
        out.offenders = out.offenders.slice(0, 5);
        return out;
      });
      if (ov.docOverflow > 2) {
        const det = `docScrollWidth exceeds innerWidth by ${ov.docOverflow}px; top offenders: ` +
          ov.offenders.map(o => `${o.tag}.${o.cls}(+${o.over}px)`).join(', ');
        rec.defects.push({ type: 'OVERFLOW', detail: det, _shot: true });
      }
    } catch {}

    // Screenshots for CRASH / OVERFLOW / BROKEN-IMG
    const needsShot = rec.defects.some(d => ['CRASH', 'OVERFLOW', 'BROKEN-IMG'].includes(d.type));
    if (needsShot) {
      const fn = `${slug(route)}__${vp.name}.png`;
      const fp = path.join(OUT, fn);
      try { await page.screenshot({ path: fp, fullPage: true }); rec.screenshot = fn; } catch {}
    }

    results.push(rec);
    const tag = rec.defects.length ? rec.defects.map(d => d.type).join(',') : 'OK';
    console.log(`[${vp.name}] ${route} -> HTTP ${rec.httpStatus} :: ${tag}`);
    await context.close();
  }
}

await browser.close();
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
console.log('\nDONE. results.json written.');

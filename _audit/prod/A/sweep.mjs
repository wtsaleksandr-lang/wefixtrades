import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = 'https://wefixtrades.com';
const OUT = path.resolve('_audit/prod/A');
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = [
  '/', '/pricing', '/pricing/quotequick', '/products', '/products/quotequick',
  '/products/tradeline-complete', '/products/ai-voice', '/products/ai-chat',
  '/products/assistants', '/products/booking-addon', '/products/fix-and-optimize',
  '/products/quickquote', '/platform', '/services', '/bundles', '/plans', '/templates'
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: 'mobile', width: 375, height: 812, isMobile: true, hasTouch: true },
];

// noise filters for console/network
function isNoise(url) {
  return /google-analytics|googletagmanager|doubleclick|gtag|facebook|fbcdn|hotjar|clarity|segment|intercom|sentry\.io|fullstory|cdn\.jsdelivr|fonts\.g|favicon|posthog|mixpanel|stripe\.com\/v3|js\.stripe|recaptcha|gstatic/i.test(url || '');
}

const results = [];

const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    userAgent: vp.isMobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
      : undefined,
  });

  for (const route of ROUTES) {
    const page = await context.newPage();
    const rec = {
      route, vp: vp.name, httpStatus: null, jsExceptions: [], consoleErrors: [],
      net5xx: [], net4xx: [], brokenImgs: [], overflow: null, crash: false, crashText: null, navError: null,
    };

    page.on('pageerror', (err) => rec.jsExceptions.push(String(err && err.message || err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const t = msg.text();
        if (!isNoise(t)) rec.consoleErrors.push(t.slice(0, 300));
      }
    });
    page.on('response', (resp) => {
      try {
        const u = resp.url();
        const s = resp.status();
        if (isNoise(u)) return;
        const sameOrigin = u.startsWith(BASE);
        if (s >= 500) rec.net5xx.push({ url: u.slice(0, 200), status: s, sameOrigin });
        else if (s >= 400 && sameOrigin) rec.net4xx.push({ url: u.slice(0, 200), status: s });
      } catch {}
    });

    let mainResp = null;
    try {
      mainResp = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45000 });
    } catch (e) {
      try { mainResp = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
      catch (e2) { rec.navError = String(e2.message || e2); }
    }
    if (mainResp) rec.httpStatus = mainResp.status();

    // settle
    await page.waitForTimeout(2500);

    // crash / error boundary detection
    try {
      const bodyText = (await page.evaluate(() => document.body ? document.body.innerText : '')) || '';
      const crashMarkers = ['Something went wrong', 'Application error', 'This page isn’t working', 'Internal Server Error', 'Error: Minified React'];
      const hit = crashMarkers.find(m => bodyText.includes(m));
      if (hit) { rec.crash = true; rec.crashText = hit; }
      // blank render: body essentially empty
      const visibleLen = bodyText.replace(/\s+/g, '').length;
      if (visibleLen < 30 && !rec.navError) { rec.crash = true; rec.crashText = `blank render (visibleLen=${visibleLen})`; }
    } catch {}

    // broken images
    try {
      rec.brokenImgs = await page.evaluate(() => {
        const out = [];
        for (const img of Array.from(document.images)) {
          if (img.complete && img.naturalWidth === 0 && img.currentSrc) {
            out.push(img.currentSrc.slice(0, 200));
          }
        }
        return out;
      });
    } catch {}

    // overflow
    try {
      rec.overflow = await page.evaluate(() => {
        const vw = window.innerWidth;
        const docSW = document.documentElement.scrollWidth;
        const offenders = [];
        if (docSW > vw + 2) {
          const all = Array.from(document.querySelectorAll('body *'));
          for (const el of all) {
            const st = getComputedStyle(el);
            if (st.overflowX === 'auto' || st.overflowX === 'scroll') continue;
            // skip if any ancestor is a horizontal scroller
            let anc = el.parentElement, skip = false;
            while (anc) {
              const as = getComputedStyle(anc);
              if (as.overflowX === 'auto' || as.overflowX === 'scroll') { skip = true; break; }
              anc = anc.parentElement;
            }
            if (skip) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (r.right > vw + 2) {
              offenders.push({
                tag: el.tagName.toLowerCase(),
                cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 80),
                right: Math.round(r.right), vw,
              });
            }
          }
        }
        return { docSW, vw, overflowing: docSW > vw + 2, offenders: offenders.slice(0, 6) };
      });
    } catch {}

    // screenshot only for real defects
    const hasRealDefect = rec.crash || rec.brokenImgs.length || (rec.overflow && rec.overflow.overflowing) ||
      rec.net5xx.length || (rec.httpStatus && rec.httpStatus >= 400);
    if (hasRealDefect) {
      const safe = route === '/' ? 'home' : route.replace(/\//g, '_').replace(/^_/, '');
      const file = path.join(OUT, `${safe}__${vp.name}.png`);
      try { await page.screenshot({ path: file, fullPage: true }); rec.screenshot = file; } catch {}
    }

    results.push(rec);
    const flags = [];
    if (rec.httpStatus !== 200) flags.push(`HTTP ${rec.httpStatus}`);
    if (rec.navError) flags.push('NAV-ERR');
    if (rec.crash) flags.push('CRASH');
    if (rec.jsExceptions.length) flags.push(`JS x${rec.jsExceptions.length}`);
    if (rec.net5xx.length) flags.push(`5xx x${rec.net5xx.length}`);
    if (rec.net4xx.length) flags.push(`4xx x${rec.net4xx.length}`);
    if (rec.brokenImgs.length) flags.push(`IMG x${rec.brokenImgs.length}`);
    if (rec.consoleErrors.length) flags.push(`CON x${rec.consoleErrors.length}`);
    if (rec.overflow && rec.overflow.overflowing) flags.push('OVERFLOW');
    console.log(`[${vp.name}] ${route} -> ${flags.length ? flags.join(', ') : 'OK'}`);

    await page.close();
  }
  await context.close();
}

await browser.close();
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
console.log('\nDONE. results.json written.');

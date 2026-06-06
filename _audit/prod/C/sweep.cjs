// Read-only Playwright error sweep of LIVE PRODUCTION https://wefixtrades.com
// LOAD + OBSERVE ONLY. No submits, no logins, no mutations.
const { chromium } = require('playwright');
const path = require('path');

const BASE = 'https://wefixtrades.com';
const OUT = __dirname;

const ROUTES = [
  '/about', '/contact', '/case-studies', '/resources', '/security', '/privacy',
  '/terms', '/demos', '/demos/rankflow', '/demos/reputationshield', '/demos/socialsync',
  '/for-agencies', '/for-franchises', '/for-solo-traders', '/ai-receptionists',
  '/mapguard-suite', '/wefixtrades-vs-jobber', '/wefixtrades-vs-housecall-pro',
  '/wefixtrades-vs-servicetitan', '/compare/reputationshield-vs-nicejob',
  '/signup', '/login',
];

const VIEWPORTS = [
  { name: 'DESKTOP', width: 1440, height: 900 },
  { name: 'MOBILE', width: 375, height: 812 },
];

// noise filters for console.error / requests we ignore
const NOISE = [
  'google-analytics', 'googletagmanager', 'gtag', 'analytics', 'doubleclick',
  'facebook', 'fbevents', 'hotjar', 'segment', 'mixpanel', 'sentry', 'clarity',
  'favicon', 'intercom', 'hubspot', 'linkedin', 'twitter', 'tiktok',
  'cookiebot', 'cookieyes', 'consent', 'recaptcha', 'gstatic', 'fonts.googleapis',
  'fonts.gstatic', 'cdn.jsdelivr', 'unpkg',
];
function isNoise(s) {
  if (!s) return false;
  const l = String(s).toLowerCase();
  return NOISE.some(n => l.includes(n));
}

function host(u) { try { return new URL(u).host; } catch { return ''; } }
const BASE_HOST = host(BASE);
function sameOrigin(u) { return host(u) === BASE_HOST; }

function safeName(route, vp) {
  return (route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root') + '_' + vp;
}

(async () => {
  const browser = await chromium.launch();
  const results = [];

  for (const route of ROUTES) {
    for (const vp of VIEWPORTS) {
      const url = BASE + route;
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 ReadOnlyAudit',
      });
      const page = await ctx.newPage();
      const defects = [];
      const jsExceptions = [];
      const consoleErrors = [];
      const net5xx = [];

      page.on('pageerror', err => { jsExceptions.push(err.message || String(err)); });
      page.on('console', msg => {
        if (msg.type() !== 'error') return;
        const txt = msg.text();
        if (isNoise(txt)) return;
        consoleErrors.push(txt);
      });
      page.on('response', resp => {
        try {
          const u = resp.url();
          const st = resp.status();
          if (st >= 500 && sameOrigin(u)) net5xx.push(st + ' ' + u);
        } catch {}
      });

      let mainStatus = null;
      let navErr = null;
      try {
        const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        mainStatus = resp ? resp.status() : null;
        // let it settle
        try { await page.waitForLoadState('networkidle', { timeout: 12000 }); } catch {}
        await page.waitForTimeout(1500);
      } catch (e) {
        navErr = e.message;
      }

      // [HTTP]
      if (navErr) defects.push(`[HTTP] navigation failed: ${navErr} (${vp.name})`);
      else if (mainStatus !== null && (mainStatus < 200 || mainStatus >= 400))
        defects.push(`[HTTP] main document status ${mainStatus} (${vp.name})`);

      // [CRASH] blank render / error boundary
      let crash = null;
      try {
        crash = await page.evaluate(() => {
          const bodyText = (document.body && document.body.innerText || '').trim();
          const bodyHtmlLen = (document.body && document.body.innerHTML || '').length;
          const root = document.querySelector('#root, #app, [data-reactroot], main');
          const rootLen = root ? root.innerHTML.length : 0;
          const errBoundary = /something went wrong|error boundary|unexpected error|application error|client-side exception/i.test(bodyText);
          return { bodyTextLen: bodyText.length, bodyHtmlLen, rootLen, errBoundary, sample: bodyText.slice(0, 120) };
        });
      } catch {}
      if (crash) {
        if (crash.errBoundary) defects.push(`[CRASH] error-boundary text detected: "${crash.sample}" (${vp.name})`);
        else if (crash.bodyTextLen < 20 && crash.rootLen < 50) defects.push(`[CRASH] blank/near-empty render bodyTextLen=${crash.bodyTextLen} rootLen=${crash.rootLen} (${vp.name})`);
      }

      // [JS-EXCEPTION]
      for (const m of jsExceptions) if (!isNoise(m)) defects.push(`[JS-EXCEPTION] ${m} (${vp.name})`);
      // [CONSOLE]
      for (const c of consoleErrors) defects.push(`[CONSOLE] ${c.slice(0, 300)} (${vp.name})`);
      // [NET-5xx]
      for (const n of net5xx) defects.push(`[NET-5xx] ${n} (${vp.name})`);

      // [BROKEN-IMG]
      let brokenImgs = [];
      try {
        brokenImgs = await page.evaluate(() => {
          const out = [];
          for (const img of Array.from(document.images)) {
            if (img.complete && img.naturalWidth === 0 && img.currentSrc) {
              // ignore tiny tracking pixels / lazy placeholders with no real src
              out.push(img.currentSrc || img.src);
            }
          }
          return out;
        });
      } catch {}
      for (const src of brokenImgs) {
        if (isNoise(src)) continue;
        defects.push(`[BROKEN-IMG] ${src} (${vp.name})`);
      }

      // [OVERFLOW]
      let overflow = null;
      try {
        overflow = await page.evaluate(() => {
          const iw = window.innerWidth;
          const docW = document.documentElement.scrollWidth;
          const res = { iw, docW, docOverflow: docW > iw + 2, offenders: [] };
          if (res.docOverflow) {
            const all = document.body.querySelectorAll('*');
            for (const el of all) {
              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;
              if (r.right > iw + 2) {
                const cs = getComputedStyle(el);
                if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
                // skip if a parent is a scroll container
                let p = el.parentElement, skip = false;
                while (p) { const pc = getComputedStyle(p); if (pc.overflowX === 'auto' || pc.overflowX === 'scroll') { skip = true; break; } p = p.parentElement; }
                if (skip) continue;
                res.offenders.push({ tag: el.tagName.toLowerCase(), cls: (el.className && el.className.toString ? el.className.toString().slice(0, 60) : ''), right: Math.round(r.right) });
                if (res.offenders.length >= 6) break;
              }
            }
          }
          return res;
        });
      } catch {}
      let overflowShot = null;
      if (overflow && overflow.docOverflow) {
        const off = overflow.offenders.map(o => `${o.tag}.${o.cls}@${o.right}`).join(' | ');
        defects.push(`[OVERFLOW] docW=${overflow.docW} > innerW=${overflow.iw} offenders: ${off || '(none past edge - doc-level)'} (${vp.name})`);
      }

      // screenshots for CRASH / OVERFLOW / BROKEN-IMG
      const needShot = defects.some(d => /^\[CRASH\]|^\[OVERFLOW\]|^\[BROKEN-IMG\]/.test(d));
      let shotPath = null;
      if (needShot) {
        shotPath = path.join(OUT, safeName(route, vp.name) + '.png');
        try { await page.screenshot({ path: shotPath, fullPage: false }); } catch {}
      }

      results.push({ route, vp: vp.name, defects, shot: needShot ? shotPath : null });
      console.log(`DONE ${route} [${vp.name}] status=${mainStatus} defects=${defects.length}`);

      await ctx.close();
    }
  }

  await browser.close();

  // Build report
  console.log('\n\n===== REPORT =====\n');
  const byRoute = {};
  for (const r of results) { (byRoute[r.route] = byRoute[r.route] || []).push(r); }
  for (const route of ROUTES) {
    const rs = byRoute[route] || [];
    const all = rs.flatMap(r => r.defects);
    if (all.length === 0) { console.log(`ROUTE ${route}: OK`); continue; }
    console.log(`ROUTE ${route}:`);
    for (const r of rs) for (const d of r.defects) console.log(`  - ${d}`);
    for (const r of rs) if (r.shot) console.log(`  shot: ${r.shot}`);
  }

  // Summary priority
  console.log('\n===== SUMMARY (prioritized) =====');
  const tags = ['[HTTP]', '[NET-5xx]', '[CRASH]', '[BROKEN-IMG]', '[JS-EXCEPTION]', '[CONSOLE]', '[OVERFLOW]'];
  for (const t of tags) {
    const hits = results.flatMap(r => r.defects.filter(d => d.startsWith(t)).map(d => `${r.route} ${d}`));
    console.log(`${t} count=${hits.length}`);
    for (const h of hits) console.log(`   ${h}`);
  }
})();

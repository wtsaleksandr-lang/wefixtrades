import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
const BASE = 'http://localhost:5099';
const AXE = fs.readFileSync('C:\\Users\\Owner\\.codex\\wt-preview\\node_modules\\axe-core\\axe.min.js', 'utf8');

const ROUTES = [
  '/products/quickquotepro/build-with-ai',
  '/products/quickquotepro/build-with-ai/preview',
  '/products/quickquotepro/demo',
  '/sitemap',
  '/sms-consent-disclosure',
  '/solutions/visibility',
  '/templates',
  '/terms',
  '/tools',
  '/tools/build-with-ai',
  '/tools/build-with-ai/preview',
  '/tools/citation-checker',
  '/tools/electrical-ai-content-prompts',
  '/tools/free-audit',
  '/tools/google-review-link-generator',
  '/tools/hvac-ai-content-prompts',
  '/tools/landscaping-ai-content-prompts',
  '/tools/local-rank-grid',
  '/tools/local-rank-tracker',
  '/tools/local-rankflux',
  '/tools/local-search-checker',
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: 'mobile', width: 375, height: 812, isMobile: true, hasTouch: true },
];

// network/fetch noise to exclude from CONSOLE/error reporting
const NET_RE = /(failed to fetch|networkerror|err_|net::|load resource|status of 4|status of 5|xhr|fetch|\/api\/|aborterror|the user aborted|loading chunk|dynamically imported module|429|404|500|502|503)/i;

function isNetNoise(s) { return NET_RE.test(String(s || '')); }

const results = [];

const browser = await chromium.launch();

for (const route of ROUTES) {
  for (const vp of VIEWPORTS) {
    const tag = `${route} [${vp.name}]`;
    const defects = [];
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();

    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message || String(e)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const t = msg.text();
        if (!isNetNoise(t)) consoleErrors.push(t);
      }
    });
    // unhandledrejection capture
    await page.addInitScript(() => {
      window.__unhandled = [];
      window.addEventListener('unhandledrejection', (e) => {
        try { window.__unhandled.push(String(e.reason && e.reason.message ? e.reason.message : e.reason)); } catch {}
      });
      window.__windowErrors = [];
      window.addEventListener('error', (e) => {
        try { window.__windowErrors.push(String(e.message || e)); } catch {}
      });
    });

    let navOk = true;
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (e) {
      // networkidle may never settle w/o backend; fall back to domcontentloaded
      try {
        await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 20000 });
      } catch (e2) {
        navOk = false;
        defects.push(`[NAV-FAIL] ${e2.message}`);
      }
    }
    // settle time for hydration / async render
    await page.waitForTimeout(2500);

    // 1. JS exceptions
    for (const m of pageErrors) {
      if (!isNetNoise(m)) defects.push(`[JS-EXCEPTION] ${m}`);
    }
    const unh = await page.evaluate(() => window.__unhandled || []).catch(() => []);
    for (const m of unh) {
      if (!isNetNoise(m)) defects.push(`[JS-EXCEPTION] unhandledrejection: ${m}`);
    }
    const winErrs = await page.evaluate(() => window.__windowErrors || []).catch(() => []);
    for (const m of winErrs) {
      if (!isNetNoise(m)) defects.push(`[JS-EXCEPTION] window.error: ${m}`);
    }

    // 2. CRASH detection
    const crash = await page.evaluate(() => {
      const bodyText = (document.body && document.body.innerText || '').trim();
      const root = document.querySelector('#root') || document.querySelector('#app') || document.body;
      const rootText = (root && root.innerText || '').trim();
      const errPhrases = [
        'something went wrong',
        'this page isn’t working',
        'application error',
        'unexpected error',
        'an error occurred',
      ];
      const lower = bodyText.toLowerCase();
      const phraseHit = errPhrases.find((p) => lower.includes(p));
      // blank render: root has essentially no content & no child elements
      const childCount = root ? root.querySelectorAll('*').length : 0;
      const blank = rootText.length < 5 && childCount < 3;
      return { phraseHit: phraseHit || null, blank, rootTextLen: rootText.length, childCount };
    }).catch(() => null);

    let crashShot = null;
    if (crash && (crash.phraseHit || crash.blank)) {
      const reason = crash.phraseHit ? `error-boundary text: "${crash.phraseHit}"` : `blank render (rootTextLen=${crash.rootTextLen}, children=${crash.childCount})`;
      const fn = `crash_${route.replace(/[\/]/g, '_')}_${vp.name}.png`;
      await page.screenshot({ path: path.join(OUT, fn), fullPage: false }).catch(() => {});
      crashShot = fn;
      defects.push(`[CRASH] ${reason} | screenshot: ${fn}`);
    }

    // 3. console.error already filtered
    for (const m of consoleErrors) {
      defects.push(`[CONSOLE] ${m}`);
    }

    // 4. Broken images
    const brokenImgs = await page.evaluate(() => {
      const out = [];
      for (const img of Array.from(document.images)) {
        const src = img.currentSrc || img.src || '';
        if (!src) continue;
        if (src.startsWith('data:') && src.length < 64) continue; // empty data uri
        if (img.complete && img.naturalWidth === 0 && img.naturalHeight === 0) {
          // exclude lazy not-yet-loaded
          out.push(src);
        }
      }
      return out;
    }).catch(() => []);
    if (brokenImgs.length) {
      const fn = `brokenimg_${route.replace(/[\/]/g, '_')}_${vp.name}.png`;
      await page.screenshot({ path: path.join(OUT, fn), fullPage: false }).catch(() => {});
      for (const s of brokenImgs.slice(0, 10)) {
        defects.push(`[BROKEN-IMG] ${s} | screenshot: ${fn}`);
      }
    }

    // 5. axe a11y (critical + serious)
    try {
      await page.evaluate(AXE);
      const axeRes = await page.evaluate(async () => {
        const r = await window.axe.run(document, {
          resultTypes: ['violations'],
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
        });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
      });
      for (const v of axeRes) {
        if (v.impact === 'critical' || v.impact === 'serious') {
          defects.push(`[A11Y] ${v.id} (${v.impact}) nodes=${v.nodes}`);
        }
      }
    } catch (e) {
      defects.push(`[A11Y] axe-run-failed: ${e.message}`);
    }

    // 6. Overflow
    const overflow = await page.evaluate(() => {
      const out = [];
      const iw = window.innerWidth;
      const docSW = document.documentElement.scrollWidth;
      if (docSW > iw + 2) {
        out.push({ kind: 'document', amount: docSW - iw });
      }
      // element-level: right edge past viewport
      const all = document.body.querySelectorAll('*');
      let reported = 0;
      for (const el of all) {
        if (reported >= 8) break;
        const style = getComputedStyle(el);
        if (style.position === 'fixed' || style.position === 'sticky') continue;
        const ox = style.overflowX;
        if (ox === 'auto' || ox === 'scroll') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > iw + 2) {
          // build a short selector
          let sel = el.tagName.toLowerCase();
          if (el.id) sel += '#' + el.id;
          else if (el.className && typeof el.className === 'string') {
            const c = el.className.trim().split(/\s+/).slice(0, 2).join('.');
            if (c) sel += '.' + c;
          }
          out.push({ kind: 'element', selector: sel, amount: Math.round(r.right - iw), right: Math.round(r.right) });
          reported++;
        }
      }
      return { iw, docSW, items: out };
    }).catch(() => null);

    if (overflow && overflow.items.length) {
      const docItem = overflow.items.find((i) => i.kind === 'document');
      const elItems = overflow.items.filter((i) => i.kind === 'element');
      const fn = `overflow_${route.replace(/[\/]/g, '_')}_${vp.name}.png`;
      await page.screenshot({ path: path.join(OUT, fn), fullPage: false }).catch(() => {});
      if (docItem) defects.push(`[OVERFLOW] document scrollWidth ${overflow.docSW} > innerWidth ${overflow.iw} (+${docItem.amount}px) | screenshot: ${fn}`);
      for (const it of elItems) {
        defects.push(`[OVERFLOW] ${it.selector} right=${it.right} (+${it.amount}px past ${overflow.iw}) | screenshot: ${fn}`);
      }
    }

    results.push({ tag, route, vp: vp.name, defects });
    await ctx.close();
    console.log(`done ${tag}: ${defects.length} defects`);
  }
}

await browser.close();

// Write report
let report = '';
for (const route of ROUTES) {
  const rows = results.filter((r) => r.route === route);
  const all = rows.flatMap((r) => r.defects.map((d) => ({ vp: r.vp, d })));
  if (all.length === 0) {
    report += `ROUTE ${route}: OK\n`;
  } else {
    report += `ROUTE ${route}:\n`;
    for (const x of all) report += `  - ${x.d} [${x.vp}]\n`;
  }
}
fs.writeFileSync(path.join(OUT, 'report.txt'), report, 'utf8');
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2), 'utf8');
console.log('\n===REPORT===\n' + report);

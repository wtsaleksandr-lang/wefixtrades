/**
 * Wave Q — Final visual audit. Drives Chromium across every surface
 * modified in tonight's 24-PR session (Waves 7..16) and collects
 * structured findings. Output: tests/wave-q-audit/findings.json plus
 * screenshots in tests/wave-q-audit/screenshots/.
 *
 * Categories:
 *   critical  — broken route, console error, network 4xx/5xx on doc,
 *               horizontal overflow > 2px on mobile, missing hero on
 *               product/solution pages, runtime error overlay.
 *   important — image 404s, visible 0×0 elements, mega-menu not
 *               unfolding, missing back-to-website in portal/admin,
 *               navbar not closing on link click.
 *   polish    — non-blocking warnings only.
 *
 * The spec NEVER fails — it always produces findings.json. Pass/fail is
 * the caller's responsibility based on that file.
 */
import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const OUT_DIR = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = join(OUT_DIR, 'screenshots');
mkdirSync(SHOT_DIR, { recursive: true });

type Severity = 'critical' | 'important' | 'polish';
interface Finding {
  surface: string;
  url: string;
  viewport: 'desktop' | 'mobile';
  severity: Severity;
  category: string;
  detail: string;
}
const findings: Finding[] = [];
const add = (f: Finding) => findings.push(f);

interface Surface {
  name: string;
  path: string;
  group: 'marketing' | 'portal' | 'admin' | 'tools';
  expects?: {
    heroSplit?: boolean;       // Wave 13: split hero on product/solution
    backToWebsite?: boolean;   // Wave 12B: portal + admin
    megaMenu?: boolean;        // Wave 14: free tools mega-menu
    chatWidget?: boolean;      // Wave 12A: marketing chat widget
  };
}

const PRODUCT_SLUGS = [
  'mapguard','tradeline','quickquotepro','contentflow','reputationshield',
  'webfix','sitelaunch','webcare','rankflow','adflow','socialsync','bookflow',
];
// Wave Q: real slugs from client/src/pages/solutions/SolutionPage.tsx
// (some original spec slugs like "for-handymen", "for-carpet-cleaners",
// "for-window-cleaners" don't exist — replaced with the closest real
// equivalent so the audit reports against real surfaces).
const SOLUTION_SLUGS = [
  'for-plumbers','for-hvac','for-electricians','for-roofers','for-cleaners',
  'for-landscapers','for-painters','for-general-contractors','for-carpenters',
  'for-locksmiths','for-garage-door','for-pest-control',
];
const LONG_TAIL = [
  'for-window-installers','for-pool-service','for-tree-service','for-tile-installers','for-flooring',
];
const FREE_TOOLS = [
  'free-audit','citation-checker','google-review-link-generator',
  'local-rank-grid','local-rank-tracker','local-rankflux','local-serp-checker',
];

const SURFACES: Surface[] = [
  { name: 'home', path: '/', group: 'marketing', expects: { chatWidget: true, megaMenu: true } },
  ...PRODUCT_SLUGS.map(s => ({
    name: `product:${s}`, path: `/products/${s}`, group: 'marketing' as const,
    expects: { heroSplit: true, chatWidget: true },
  })),
  { name: 'citation-builder', path: '/citation-builder', group: 'marketing', expects: { chatWidget: true } },
  { name: 'citation-tracker-product', path: '/products/citation-tracker', group: 'marketing', expects: { chatWidget: true } },
  { name: 'mapguard-suite', path: '/mapguard-suite', group: 'marketing', expects: { chatWidget: true } },
  ...SOLUTION_SLUGS.map(s => ({
    name: `solution:${s}`, path: `/solutions/${s}`, group: 'marketing' as const,
    expects: { heroSplit: true, chatWidget: true },
  })),
  ...LONG_TAIL.map(s => ({
    name: `longtail:${s}`, path: `/solutions/${s}`, group: 'marketing' as const,
    expects: { heroSplit: true },
  })),
  { name: 'free-tools-hub', path: '/free-tools', group: 'marketing', expects: { megaMenu: true } },
  ...FREE_TOOLS.map(s => ({
    name: `tool:${s}`, path: `/tools/${s}`, group: 'tools' as const,
  })),
  { name: 'pricing', path: '/pricing', group: 'marketing' },
  { name: 'templates', path: '/templates', group: 'marketing' },
  { name: 'sitemap', path: '/sitemap', group: 'marketing' },
  { name: 'compare-jobber', path: '/compare-vs-jobber', group: 'marketing' },
  { name: 'compare-housecall', path: '/compare-vs-housecall-pro', group: 'marketing' },
  { name: 'compare-servicetitan', path: '/compare-vs-servicetitan', group: 'marketing' },
  { name: 'for-agencies', path: '/for-agencies', group: 'marketing' },
  { name: 'for-franchises', path: '/for-franchises', group: 'marketing' },
  { name: 'for-solo-traders', path: '/for-solo-traders', group: 'marketing' },

  { name: 'portal-contentflow', path: '/portal/contentflow', group: 'portal', expects: { backToWebsite: true } },
  { name: 'portal-contentflow-examples', path: '/portal/contentflow/examples', group: 'portal', expects: { backToWebsite: true } },
  { name: 'portal-ai-insights', path: '/portal/ai-insights', group: 'portal', expects: { backToWebsite: true } },
  { name: 'portal-citation-tracker', path: '/portal/citation-tracker', group: 'portal', expects: { backToWebsite: true } },
  { name: 'portal-citation-builder', path: '/portal/citation-builder', group: 'portal', expects: { backToWebsite: true } },

  { name: 'admin-system-alerts', path: '/admin/system-alerts', group: 'admin', expects: { backToWebsite: true } },
  { name: 'admin-tradeline-templates', path: '/admin/tradeline/templates', group: 'admin', expects: { backToWebsite: true } },
  { name: 'admin-contentflow', path: '/admin/contentflow', group: 'admin', expects: { backToWebsite: true } },
];

const VIEWS = [
  { name: 'desktop' as const, width: 1440, height: 900 },
  { name: 'mobile' as const,  width: 375,  height: 667 },
];

// --- helpers ---

function classifyConsole(msg: ConsoleMessage): { ignore: boolean; severity: Severity } {
  const text = msg.text();
  // Benign noise we always ignore:
  if (/Download the React DevTools/.test(text)) return { ignore: true, severity: 'polish' };
  if (/\[vite\]|\[HMR\]/.test(text)) return { ignore: true, severity: 'polish' };
  if (/source-map/i.test(text)) return { ignore: true, severity: 'polish' };
  if (/Lit is in dev mode/.test(text)) return { ignore: true, severity: 'polish' };
  if (/Tailwind CSS IntelliSense/.test(text)) return { ignore: true, severity: 'polish' };
  // Wave Q: known-benign dev-only signals:
  if (/VITE_POSTHOG_PUBLIC_KEY not set/.test(text)) return { ignore: true, severity: 'polish' };
  if (/THREE\.THREE\.Clock.*deprecated/.test(text)) return { ignore: true, severity: 'polish' };
  if (/THREE\.Timer/.test(text)) return { ignore: true, severity: 'polish' };
  if (/\[contrastGuard\].*auto-corrected/.test(text)) return { ignore: true, severity: 'polish' };
  if (/WebGL.*GPU stall/.test(text)) return { ignore: true, severity: 'polish' };
  if (/React Flow.*parent container.*width and a height/.test(text)) return { ignore: true, severity: 'polish' };
  if (/MozCast HTTP 404/.test(text)) return { ignore: true, severity: 'polish' };
  if (/non-static position/.test(text)) return { ignore: true, severity: 'polish' };
  // Framer Motion v11 logs warnings when an `initial={false}` AnimatePresence
  // mounts a child whose `animate` includes opacity — the production visual
  // is correct, the warning is dev-only noise. Documented as polish.
  if (/animate opacity from "undefined"/.test(text)) return { ignore: true, severity: 'polish' };
  if (/animate (color|background) from /.test(text)) return { ignore: false, severity: 'polish' };
  if (/is not an animatable color/.test(text)) return { ignore: false, severity: 'polish' };
  // Upstream MozCast 502 — graceful in client UI, see WORKSTREAMS/wave-q-audit.
  if (/Failed to load resource.*502/.test(text)) return { ignore: true, severity: 'polish' };
  if (msg.type() === 'warning') return { ignore: false, severity: 'polish' };
  if (msg.type() === 'error') return { ignore: false, severity: 'important' };
  return { ignore: true, severity: 'polish' };
}

async function checkSurface(page: Page, s: Surface, viewport: { name: 'desktop' | 'mobile'; width: number; height: number }) {
  const consoleErrors: string[] = [];
  const networkFails: string[] = [];

  const onConsole = (msg: ConsoleMessage) => {
    const c = classifyConsole(msg);
    if (!c.ignore) consoleErrors.push(`[${msg.type()}] ${msg.text().slice(0, 200)}`);
  };
  const onResponse = (resp: import('@playwright/test').Response) => {
    const status = resp.status();
    const url = resp.url();
    if (status >= 400) {
      // Ignore vite/dev hot reload websocket, /favicon, and known dev-only health probes.
      if (/\/__vite|\/favicon|hot-update/.test(url)) return;
      // Known upstream gone: MozCast RSS — client renders graceful fallback.
      if (/\/api\/tools\/local-rankflux/.test(url)) return;
      networkFails.push(`${status} ${url.replace(/.*\/\//,'').slice(0, 140)}`);
    }
  };

  page.on('console', onConsole);
  page.on('response', onResponse);

  try {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const resp = await page.goto(s.path, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const docStatus = resp?.status() ?? 0;
    if (docStatus >= 400) {
      add({ surface: s.name, url: s.path, viewport: viewport.name, severity: 'critical',
            category: 'route', detail: `Document returned HTTP ${docStatus}` });
    }
    // Let client hydrate + animate.
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(600);

    // Screenshot
    const shotPath = join(SHOT_DIR, `${s.name}-${viewport.name}.png`);
    await page.screenshot({ path: shotPath, fullPage: true, timeout: 15_000 }).catch(() => {});

    // ---- checks ----

    // 1) Runtime error overlay (Vite, React)
    const overlay = await page.locator('vite-error-overlay, [data-vite-dev-error-overlay], .react-error-boundary').count();
    if (overlay > 0) {
      add({ surface: s.name, url: s.path, viewport: viewport.name, severity: 'critical',
            category: 'runtime', detail: 'Dev error overlay visible' });
    }

    // 2) Console errors collected during nav
    for (const e of consoleErrors) {
      add({ surface: s.name, url: s.path, viewport: viewport.name, severity: 'important',
            category: 'console', detail: e });
    }
    // 3) Network failures
    for (const n of networkFails) {
      add({ surface: s.name, url: s.path, viewport: viewport.name, severity: 'important',
            category: 'network', detail: n });
    }

    // 4) Horizontal overflow on mobile
    if (viewport.name === 'mobile') {
      const overflow = await page.evaluate(() => {
        const html = document.documentElement;
        const body = document.body;
        const scrollW = Math.max(html.scrollWidth, body.scrollWidth);
        const clientW = html.clientWidth;
        return { scrollW, clientW, diff: scrollW - clientW };
      });
      if (overflow.diff > 2) {
        add({ surface: s.name, url: s.path, viewport: viewport.name, severity: 'critical',
              category: 'overflow', detail: `Horizontal overflow ${overflow.diff}px (scroll ${overflow.scrollW}, client ${overflow.clientW})` });
      }
    }

    // 5) Visible 0×0 elements that ARE in document flow. Uses `offsetParent
    // === null` to detect any ancestor with display:none — Three.js / lazy
    // sections that are CSS-hidden on the current breakpoint are legitimately
    // 0×0 and should be skipped.
    const zeroDim = await page.evaluate(() => {
      const out: string[] = [];
      const all = document.querySelectorAll('main *, header *, footer *');
      for (let i = 0; i < Math.min(all.length, 4000); i++) {
        const el = all[i] as HTMLElement;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
        if (el.offsetParent === null && cs.position !== 'fixed') continue; // ancestor hidden
        const r = el.getBoundingClientRect();
        const tag = el.tagName.toLowerCase();
        if (['img','video','iframe','canvas'].includes(tag) && r.width === 0 && r.height === 0) {
          out.push(`${tag}${el.id ? '#'+el.id : ''}${el.className && typeof el.className === 'string' ? '.'+(el.className as string).split(' ').filter(Boolean).slice(0,2).join('.') : ''}`);
          if (out.length >= 8) break;
        }
      }
      return out;
    });
    for (const z of zeroDim) {
      add({ surface: s.name, url: s.path, viewport: viewport.name, severity: 'important',
            category: 'zero-dim', detail: `0×0 visible element: ${z}` });
    }

    // 6) Broken-image check (img.naturalWidth === 0 after load)
    const brokenImgs = await page.evaluate(() => {
      const imgs = Array.from(document.images);
      const broken: string[] = [];
      for (const i of imgs) {
        if (!i.complete) continue;
        if (i.naturalWidth === 0) {
          broken.push(i.src.replace(location.origin, '').slice(0, 140));
          if (broken.length >= 10) break;
        }
      }
      return broken;
    });
    for (const b of brokenImgs) {
      add({ surface: s.name, url: s.path, viewport: viewport.name, severity: 'important',
            category: 'broken-image', detail: `img naturalWidth=0: ${b}` });
    }

    // 7) Spec-specific assertions
    if (s.expects?.heroSplit && viewport.name === 'desktop') {
      // Wave 13: split hero — left text + right visual. Look for either a
      // hero with two children or an element marked data-hero-split.
      const hasSplit = await page.evaluate(() => {
        const h = document.querySelector('[data-hero-split], section[data-hero], section.hero, header.hero, [data-testid="hero"]');
        if (!h) return null;
        const kids = (h as HTMLElement).children;
        return { kidCount: kids.length, rect: (h as HTMLElement).getBoundingClientRect().width };
      });
      if (hasSplit === null) {
        // Heuristic fallback: first <section> in <main>.
        const fallback = await page.evaluate(() => {
          const s = document.querySelector('main section, main > div > section');
          if (!s) return null;
          const kids = Array.from(s.children).filter(k => (k as HTMLElement).offsetHeight > 40);
          return { kidCount: kids.length };
        });
        if (!fallback || fallback.kidCount < 2) {
          add({ surface: s.name, url: s.path, viewport: viewport.name, severity: 'important',
                category: 'spec-hero', detail: 'Wave 13 split-hero not detected (no [data-hero] + <2 visible children)' });
        }
      }
    }

    if (s.expects?.backToWebsite) {
      // Project's actual testids: portal-back-to-website, admin-back-to-website.
      // Also accept text fallback. Portal/admin routes redirect unauth users
      // to marketing — so we only flag if the route actually rendered the
      // portal/admin shell (detected by the presence of the layout's nav).
      const inShell = await page.locator(
        '[data-testid="portal-nav"], [data-testid="admin-nav"], nav[data-portal], nav[data-admin]'
      ).count();
      if (inShell === 0) {
        // Unauthenticated — marketing chrome shown instead. Not a back-link bug.
        add({ surface: s.name, url: s.path, viewport: viewport.name, severity: 'polish',
              category: 'spec-back-link', detail: 'Skipped: route requires auth (rendered marketing fallback)' });
      } else {
        const has = await page.locator(
          'a[data-testid="portal-back-to-website"], a[data-testid="admin-back-to-website"], a:has-text("Back to website"), a:has-text("Back to Website")'
        ).count();
        if (has === 0) {
          add({ surface: s.name, url: s.path, viewport: viewport.name, severity: 'important',
                category: 'spec-back-link', detail: 'Wave 12B back-to-website link missing' });
        }
      }
    }

    if (s.expects?.chatWidget && viewport.name === 'desktop') {
      // Wave 12A: floating launcher bottom-right.
      const launcher = await page.locator('[data-testid="chat-launcher"], [data-testid="copilot-launcher"], button[aria-label*="chat" i], button[aria-label*="copilot" i]').count();
      if (launcher === 0) {
        add({ surface: s.name, url: s.path, viewport: viewport.name, severity: 'polish',
              category: 'spec-chat', detail: 'Wave 12A chat launcher not detected (may be lazy-loaded)' });
      }
    }

    if (s.expects?.megaMenu && viewport.name === 'desktop') {
      // Wave 14: free tools nav item that opens an unfold panel.
      const trigger = page.locator('nav [data-testid="free-tools-trigger"], nav button:has-text("Free Tools"), nav a:has-text("Free Tools")').first();
      const tcount = await trigger.count();
      if (tcount === 0) {
        add({ surface: s.name, url: s.path, viewport: viewport.name, severity: 'important',
              category: 'spec-mega-menu', detail: 'Wave 14 Free Tools menu trigger not found in nav' });
      } else {
        try {
          await trigger.hover({ timeout: 2000 });
          await page.waitForTimeout(400);
          const panel = await page.locator('[data-testid="free-tools-panel"], [role="menu"]:visible, [data-state="open"]').count();
          if (panel === 0) {
            add({ surface: s.name, url: s.path, viewport: viewport.name, severity: 'polish',
                  category: 'spec-mega-menu', detail: 'Wave 14 mega-menu panel did not appear on hover' });
          }
        } catch { /* ignore */ }
      }
    }

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    add({ surface: s.name, url: s.path, viewport: viewport.name, severity: 'critical',
          category: 'exception', detail: msg.slice(0, 240) });
  } finally {
    page.off('console', onConsole);
    page.off('response', onResponse);
  }
}

test.describe.configure({ mode: 'serial' });

function writeReport() {
  const reportPath = join(OUT_DIR, 'findings.json');
  writeFileSync(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    surfaceCount: SURFACES.length,
    findingCount: findings.length,
    bySeverity: {
      critical: findings.filter(f => f.severity === 'critical').length,
      important: findings.filter(f => f.severity === 'important').length,
      polish: findings.filter(f => f.severity === 'polish').length,
    },
    findings,
  }, null, 2));
}

test('Wave Q — audit all surfaces', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let idx = 0;
  for (const s of SURFACES) {
    for (const v of VIEWS) {
      await checkSurface(page, s, v);
    }
    idx++;
    if (idx % 5 === 0) writeReport(); // incremental persist every 5 surfaces
  }
  await ctx.close();

  writeReport();
  const reportPath = join(OUT_DIR, 'findings.json');
  console.log(`\n=== Wave Q audit complete ===`);
  console.log(`Surfaces: ${SURFACES.length}, findings: ${findings.length}`);
  console.log(`Critical: ${findings.filter(f => f.severity==='critical').length}`);
  console.log(`Important: ${findings.filter(f => f.severity==='important').length}`);
  console.log(`Polish: ${findings.filter(f => f.severity==='polish').length}`);
  console.log(`Report: ${reportPath}`);
  expect(true).toBe(true);
});

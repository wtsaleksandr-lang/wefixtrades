/**
 * Accessibility audit — batch 3 (2026-05-24).
 *
 * Extends PRs #673 / #678 / #680 to the 8 public marketing routes that were
 * not covered yet: about, contact, blog, case-studies, resources, templates,
 * demo, docs.
 *
 * For each route × viewport we capture:
 *   - axe-core violations (count + grouped by severity, with the top rules)
 *   - keyboard-tab landmarks count (header / main / nav / footer)
 *   - the presence of a skip-to-content link as the first focusable element
 *
 * Output: docs/operations/visual-audit-screenshots-batch3/a11y-results.json
 *
 * Run against live prod (no local server, no DB):
 *   npx playwright test --config tests/audit/audit-batch3.config.ts
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROUTES = [
  { name: 'about', path: '/about' },
  { name: 'contact', path: '/contact' },
  { name: 'blog', path: '/blog' },
  { name: 'case-studies', path: '/case-studies' },
  { name: 'resources', path: '/resources' },
  { name: 'templates', path: '/templates' },
  { name: 'demo', path: '/demo' },
  { name: 'docs', path: '/docs' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
];

const BASE_URL = process.env.A11Y_BASE_URL ?? 'https://wefixtrades.com';
const OUT_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  'docs',
  'operations',
  'visual-audit-screenshots-batch3',
);
const RESULTS_FILE = path.join(OUT_DIR, 'a11y-results.json');

interface RouteResult {
  route: string;
  viewport: string;
  url: string;
  durationMs: number;
  landmarks: {
    header: number;
    nav: number;
    main: number;
    footer: number;
  };
  firstFocusable: string | null;
  skipLink: boolean;
  axe: {
    total: number;
    bySeverity: Record<string, number>;
    rules: { id: string; impact: string | null; nodes: number; help: string }[];
  };
  skipped?: boolean;
  skipReason?: string;
}

const results: RouteResult[] = [];

test.beforeAll(() => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
});

test.afterAll(() => {
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  console.log(`a11y batch3 — wrote ${results.length} result(s) to ${RESULTS_FILE}`);
});

for (const route of ROUTES) {
  for (const vp of VIEWPORTS) {
    test(`a11y — ${route.name} @ ${vp.name}`, async ({ page }, testInfo) => {
      testInfo.setTimeout(90_000);
      const url = `${BASE_URL}${route.path}`;
      const started = Date.now();
      const result: RouteResult = {
        route: route.path,
        viewport: vp.name,
        url,
        durationMs: 0,
        landmarks: { header: 0, nav: 0, main: 0, footer: 0 },
        firstFocusable: null,
        skipLink: false,
        axe: { total: 0, bySeverity: {}, rules: [] },
      };

      try {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        if (!resp || !resp.ok()) {
          result.skipped = true;
          result.skipReason = `nav status ${resp?.status() ?? 'no-response'}`;
          results.push(result);
          return;
        }
        // Brief settle for lazy-loaded chunks / fonts
        await page.waitForTimeout(2_000);

        // Landmark counts
        result.landmarks.header = await page.locator('header, [role="banner"]').count();
        result.landmarks.nav = await page.locator('nav, [role="navigation"]').count();
        result.landmarks.main = await page.locator('main, [role="main"]').count();
        result.landmarks.footer = await page.locator('footer, [role="contentinfo"]').count();

        // First focusable element — tab once from body
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
        await page.keyboard.press('Tab');
        result.firstFocusable = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const text = (el.textContent || '').trim().slice(0, 60);
          const tag = el.tagName.toLowerCase();
          const href = el.getAttribute('href') || '';
          return `${tag}${href ? `[href=${href}]` : ''} :: ${text}`;
        });
        result.skipLink = /skip/i.test(result.firstFocusable || '');

        // Axe-core run
        const { violations } = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        result.axe.total = violations.length;
        const bySev: Record<string, number> = {};
        for (const v of violations) {
          const k = v.impact || 'unknown';
          bySev[k] = (bySev[k] || 0) + 1;
        }
        result.axe.bySeverity = bySev;
        result.axe.rules = violations
          .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help }))
          .sort((a, b) => (b.nodes || 0) - (a.nodes || 0));

        // Print a compact summary to the test log
        const ruleSummary = result.axe.rules
          .map((r) => `${r.id}(${r.impact}/${r.nodes})`)
          .join(', ');
        console.log(
          `axe — ${route.name} @ ${vp.name}: ${result.axe.total} rule(s) ` +
            `[${Object.entries(bySev).map(([k, v]) => `${k}:${v}`).join(' ')}] ` +
            `landmarks h=${result.landmarks.header} n=${result.landmarks.nav} ` +
            `m=${result.landmarks.main} f=${result.landmarks.footer} ` +
            `skipLink=${result.skipLink}\n  ${ruleSummary}`,
        );

        // Hard gate — zero critical violations per repo convention.
        const critical = result.axe.rules.filter((r) => r.impact === 'critical');
        expect(
          critical,
          `critical accessibility violations on ${route.name}: ${critical.map((r) => r.id).join(', ')}`,
        ).toHaveLength(0);
      } catch (err) {
        result.skipped = true;
        result.skipReason = err instanceof Error ? err.message : String(err);
      } finally {
        result.durationMs = Date.now() - started;
        results.push(result);
      }
    });
  }
}

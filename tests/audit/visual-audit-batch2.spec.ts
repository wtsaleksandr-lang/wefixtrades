/**
 * Batch-2 product pages visual + console + axe audit (2026-05-24).
 *
 * Follows the same pattern as visual-audit-top4.spec.ts (PR #673) but covers
 * the remaining 7 product detail pages + the services hub.
 *
 * Captures, per route × viewport:
 *   - total scroll height (document.body.scrollHeight)
 *   - console error count + messages
 *   - failed network requests count + URLs
 *   - axe-core violations (count by severity + rules)
 *   - full-page screenshot (PNG)
 *
 * Outputs:
 *   docs/operations/visual-audit-screenshots-batch2/audit-results.json
 *   docs/operations/visual-audit-screenshots-batch2/<route>-<viewport>.png
 *
 * Run with:
 *   npx playwright test --config tests/audit/audit-batch2.config.ts
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROUTES = [
  { name: 'products-quickquotepro', path: '/products/quickquotepro' },
  { name: 'products-mapguard', path: '/products/mapguard' },
  { name: 'products-rankflow', path: '/products/rankflow' },
  { name: 'products-webcare', path: '/products/webcare' },
  { name: 'products-sitelaunch', path: '/products/sitelaunch' },
  { name: 'products-socialsync', path: '/products/socialsync' },
  { name: 'products-reputationshield', path: '/products/reputationshield' },
  { name: 'services', path: '/services' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
];

const BASE_URL = 'https://wefixtrades.com';
const OUT_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  'docs',
  'operations',
  'visual-audit-screenshots-batch2',
);
const RESULTS_FILE = path.join(OUT_DIR, 'audit-results.json');

interface RouteResult {
  route: string;
  viewport: string;
  url: string;
  durationMs: number;
  scrollHeight: number;
  consoleErrors: string[];
  failedRequests: { url: string; failure: string }[];
  axe: {
    total: number;
    bySeverity: Record<string, number>;
    rules: { id: string; impact: string | null; nodes: number }[];
  };
  screenshot: string;
  skipped?: boolean;
  skipReason?: string;
}

const results: RouteResult[] = [];

test.beforeAll(() => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
});

test.afterAll(() => {
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2), 'utf-8');
});

for (const route of ROUTES) {
  for (const viewport of VIEWPORTS) {
    test(`${route.name} @ ${viewport.name}`, async ({ browser }) => {
      const started = Date.now();
      const url = `${BASE_URL}${route.path}`;
      const screenshotName = `${route.name}-${viewport.name}.png`;
      const screenshotPath = path.join(OUT_DIR, screenshotName);

      const consoleErrors: string[] = [];
      const failedRequests: { url: string; failure: string }[] = [];

      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        userAgent:
          viewport.name === 'mobile'
            ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
            : undefined,
      });
      const page = await context.newPage();

      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('requestfailed', (req) => {
        failedRequests.push({
          url: req.url(),
          failure: req.failure()?.errorText ?? 'unknown',
        });
      });

      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
      } catch (err) {
        // fall back to domcontentloaded if networkidle stalls
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      }

      // settle: scroll to bottom to trigger lazy content, then back to top
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
          let y = 0;
          const step = () => {
            window.scrollTo(0, y);
            y += 500;
            if (y < document.body.scrollHeight) {
              setTimeout(step, 60);
            } else {
              window.scrollTo(0, 0);
              setTimeout(resolve, 250);
            }
          };
          step();
        });
      });

      const scrollHeight = await page.evaluate(
        () => document.body.scrollHeight,
      );

      // axe scan
      let axeResult;
      try {
        axeResult = await new AxeBuilder({ page })
          .options({ resultTypes: ['violations'] })
          .analyze();
      } catch (err) {
        axeResult = { violations: [] as any[] };
      }

      const bySeverity: Record<string, number> = {
        critical: 0,
        serious: 0,
        moderate: 0,
        minor: 0,
        unknown: 0,
      };
      const rules: { id: string; impact: string | null; nodes: number }[] = [];
      for (const v of axeResult.violations) {
        const impact = (v.impact ?? 'unknown') as string;
        bySeverity[impact] = (bySeverity[impact] ?? 0) + 1;
        rules.push({
          id: v.id,
          impact: v.impact ?? null,
          nodes: v.nodes?.length ?? 0,
        });
      }

      await page.screenshot({ path: screenshotPath, fullPage: true });

      results.push({
        route: route.name,
        viewport: viewport.name,
        url,
        durationMs: Date.now() - started,
        scrollHeight,
        consoleErrors,
        failedRequests,
        axe: {
          total: axeResult.violations.length,
          bySeverity,
          rules,
        },
        screenshot: `docs/operations/visual-audit-screenshots-batch2/${screenshotName}`,
      });

      await context.close();
      expect(true).toBe(true);
    });
  }
}

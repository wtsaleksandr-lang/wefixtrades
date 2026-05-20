/**
 * W-PRICING — Wave R pricing audit screenshots.
 *
 * Captures two reference screenshots for the W-PRICING audit:
 *   1. Public QuoteQuick pricing page → confirms Wave Q ladder (Free / Pro $29 / Business $79)
 *   2. Admin services index → confirms tier rows (including quotequick-install $75) render
 *
 * NOT a pass/fail regression spec — writes PNGs to tests/audit/_screenshots/
 * for human review. The admin page requires auth, so we capture whatever the
 * route renders (likely a login redirect) and let the reviewer see that.
 *
 * Run:
 *   npx playwright test tests/audit/_w-pricing-screenshot.spec.ts \
 *     --config audit.config.ts --reporter=line
 */
import { test } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const OUT_DIR = path.join(process.cwd(), 'tests/audit/_screenshots');

test.beforeAll(() => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
});

test('marketing quotequick pricing page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/pricing/quotequick', { waitUntil: 'domcontentloaded' });
  // Let pricing cards finish rendering animations
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(OUT_DIR, 'w-pricing-marketing-quotequick.png'),
    fullPage: true,
  });
});

test('admin product list', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // /admin/crm/services is auth-gated. In vite preview (no server), the
  // requireAdmin guard will redirect to /login. We capture whatever loads so
  // the reviewer can see how the admin entry point behaves end-to-end.
  await page.goto('/admin/crm/services', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(OUT_DIR, 'w-pricing-admin-products.png'),
    fullPage: true,
  });
});

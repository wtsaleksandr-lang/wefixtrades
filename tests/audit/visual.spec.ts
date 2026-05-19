/**
 * Visual-regression audit — pins the wizard's appearance at desktop and
 * mobile. A diff beyond the tolerance in audit.config.ts fails the build,
 * flagging any unintended visual change.
 *
 * Baselines live in tests/audit/visual.spec.ts-snapshots/ and are generated
 * by the Audit CI workflow (so they match CI's rendering). Refresh them with
 * `npm run audit:update` or the workflow's "update_snapshots" run.
 */
import { test, expect } from '@playwright/test';

const VIEWS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

for (const v of VIEWS) {
  test(`visual — wizard (${v.name})`, async ({ page }) => {
    await page.setViewportSize({ width: v.width, height: v.height });
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    // Let the step-1 content + live preview settle.
    await page.waitForTimeout(3000);
    await expect(page).toHaveScreenshot(`wizard-${v.name}.png`, { fullPage: true });
  });
}

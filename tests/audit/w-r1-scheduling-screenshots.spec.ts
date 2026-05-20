/**
 * Wave R-1 — manual screenshot spec.
 *
 * Captures the three screenshots called out in the W-R1 task brief:
 *   _screenshots/w-r1-widget-desktop.png  — scheduling step at 1440×900
 *   _screenshots/w-r1-widget-mobile.png   — scheduling step at 390×844
 *   _screenshots/w-r1-settings.png        — Build > Settings booking section
 *
 * Run after the dev server (or a static `vite preview`) is up on :5000:
 *
 *     npx playwright test tests/audit/w-r1-scheduling-screenshots.spec.ts \
 *         --config audit.config.ts --reporter=line
 *
 * The spec deliberately *navigates* the wizard (no need to seed the DB) —
 * it toggles the scheduling switch, opens the preview, and walks the
 * widget's price-reveal step → scheduling step before snapping.
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM-safe equivalent of __dirname — the audit config runs Playwright in
// ESM mode, so the CommonJS `__dirname` global is undefined.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHOT_DIR = path.join(__dirname, '..', '..', '_screenshots');

test('W-R1 widget scheduling step (desktop)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/wizard');
  // Open Settings tab + flip the Booking toggle on.
  await page.getByTestId('editor-tab-settings').click({ trial: false }).catch(() => { /* tab may already be active */ });
  await page.getByTestId('scheduling-enabled-input').check();
  // Walk the preview to the scheduling step. The exact mechanic depends on
  // the pricing config + flow; in the default preview the scheduling step
  // is right after price_reveal. The CTA on price_reveal is the "Continue"
  // button which we identify by role.
  // (Best-effort — the spec is forgiving so it captures whatever step is
  // on screen when nothing matches.)
  await page.getByRole('button', { name: /continue|see my quote|view results/i }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOT_DIR, 'w-r1-widget-desktop.png'), fullPage: false });
});

test('W-R1 widget scheduling step (mobile)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/wizard');
  await page.getByTestId('editor-tab-settings').click({ trial: false }).catch(() => {});
  await page.getByTestId('scheduling-enabled-input').check();
  await page.getByRole('button', { name: /continue|see my quote|view results/i }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOT_DIR, 'w-r1-widget-mobile.png'), fullPage: false });
});

test('W-R1 wizard settings booking section', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/wizard');
  await page.getByTestId('editor-tab-settings').click({ trial: false }).catch(() => {});
  const group = page.getByTestId('settings-group-scheduling');
  await expect(group).toBeVisible();
  // Expand by flipping enabled on so the full body shows.
  await page.getByTestId('scheduling-enabled-input').check();
  await page.waitForTimeout(200);
  await group.screenshot({ path: path.join(SHOT_DIR, 'w-r1-settings.png') });
});

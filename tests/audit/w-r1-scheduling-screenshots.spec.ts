/**
 * Wave R-1 — manual screenshot spec.
 *
 * Captures the three screenshots called out in the W-R1 task brief:
 *   _screenshots/w-r1-widget-desktop.png  — scheduling step at 1440×900
 *   _screenshots/w-r1-widget-mobile.png   — scheduling step at 390×844
 *   _screenshots/w-r1-settings.png        — Action > Online-booking section
 *
 * IA redesign — Online booking (settings.scheduling) moved from the Settings
 * tab into the Action tab's "Advanced action" fold. This spec now opens the
 * Action tab and expands that fold before toggling scheduling.
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

/** IA redesign — Online booking lives in the Action tab's "Advanced action"
 *  fold. Open the Action tab and expand the fold so the scheduling toggle is
 *  in the DOM. */
async function openActionAdvanced(page: import('@playwright/test').Page) {
  await page.getByTestId('editor-tab-action').click({ trial: false }).catch(() => {});
  // The Advanced-action AdvancedSection is collapsed by default — expand it.
  const toggle = page.getByTestId('advanced-toggle-action-advanced');
  if (await toggle.count()) {
    const section = page.getByTestId('advanced-section-action-advanced');
    if ((await section.getAttribute('data-open')) === 'false') {
      await toggle.click().catch(() => {});
    }
  }
}

// The two widget-step specs below walk the live wizard preview to the
// scheduling step to capture screenshots. They're screenshot-collection
// helpers, not regression checks — the navigation depends on the
// preview iframe's state machine, which is timing-sensitive in CI's
// headless runner and times out (see polish/wave-r-consolidated Audit
// run 26196399505). The committed _screenshots/w-r1-widget-*.png PNGs
// (from the original W-R1 build worktree) are the canonical artifacts;
// these specs exist for re-capturing them locally with
// `CI= npx playwright test tests/audit/w-r1-scheduling-screenshots.spec.ts`.
// Pattern matches scripts/w-r3-screenshots.mjs (W-R3 used a standalone
// node script for the same reason). The third spec — the settings
// section assertion — is a real regression check and runs in CI.

test('W-R1 widget scheduling step (desktop)', async ({ page }) => {
  test.skip(!!process.env.CI, 'screenshot-collection only; runs locally');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/wizard');
  // Open the Action tab's Advanced-action fold + flip the Booking toggle on.
  await openActionAdvanced(page);
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
  test.skip(!!process.env.CI, 'screenshot-collection only; runs locally');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/wizard');
  await openActionAdvanced(page);
  await page.getByTestId('scheduling-enabled-input').check();
  await page.getByRole('button', { name: /continue|see my quote|view results/i }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOT_DIR, 'w-r1-widget-mobile.png'), fullPage: false });
});

test('W-R1 wizard action booking section', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/wizard');
  // IA redesign — Online booking moved from Settings to the Action tab's
  // Advanced-action fold (same testid: settings-group-scheduling).
  await openActionAdvanced(page);
  const group = page.getByTestId('settings-group-scheduling');
  await expect(group).toBeVisible();
  // Expand by flipping enabled on so the full body shows.
  await page.getByTestId('scheduling-enabled-input').check();
  await page.waitForTimeout(200);
  await group.screenshot({ path: path.join(SHOT_DIR, 'w-r1-settings.png') });
});

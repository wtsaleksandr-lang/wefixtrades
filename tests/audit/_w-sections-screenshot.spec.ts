/**
 * Wave R-pre W-SECTIONS — visual screenshot spec.
 *
 * NOT a regression-pass-fail spec. Captures the Build tab after applying
 * the `car_towing` template so Alex (or the orchestrator) can confirm
 * that the section titles now read as small, all-caps, subtle labels
 * sitting RIGHT above their first input row.
 *
 * Outputs:
 *   tests/audit/_screenshots/w-sections-build-desktop.png  (1440x900)
 *   tests/audit/_screenshots/w-sections-build-mobile.png   (390x844)
 *
 * Run with:
 *   npx playwright test tests/audit/_w-sections-screenshot.spec.ts \
 *     --config audit.config.ts --reporter=line
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const OUT_DIR = path.join(process.cwd(), 'tests/audit/_screenshots');

test.beforeAll(() => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
});

async function clearShellState(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('qq_wizard');
      localStorage.removeItem('qq_step');
      localStorage.removeItem('qq_result');
      localStorage.removeItem('qq_elfsight_shell');
      localStorage.removeItem('qq_editor_pane_width');
      localStorage.removeItem('qq_editor_preview_collapsed');
      localStorage.removeItem('qq_dnd_hint_seen');
    } catch {}
  });
}

async function openWizardAndApplyTemplate(page: Page) {
  await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  await expect(page.getByTestId('quotequick-editor-shell')).toBeVisible();
  // Apply the car_towing template so the Build tab has fields, calcs,
  // and headline calc populated — gives Alex a realistic view of the
  // section headers in context.
  const card = page.getByTestId('template-strip-card-car_towing');
  if (await card.count()) {
    await card.click().catch(() => {});
  }
  await page.waitForTimeout(500);
}

async function shoot(page: Page, name: string) {
  const filepath = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: false });
  // eslint-disable-next-line no-console
  console.log(`[w-sections-screenshot] ${filepath}`);
}

test.describe('Wave R-pre W-SECTIONS — desktop 1440x900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('Build tab with subtle section titles (desktop)', async ({ page }) => {
    await openWizardAndApplyTemplate(page);
    await shoot(page, 'w-sections-build-desktop');
  });
});

test.describe('Wave R-pre W-SECTIONS — mobile 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('Build tab with subtle section titles (mobile)', async ({ page }) => {
    await openWizardAndApplyTemplate(page);
    await shoot(page, 'w-sections-build-mobile');
  });
});

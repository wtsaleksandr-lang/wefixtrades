/**
 * W-LABELS — floating-label-inside-the-input screenshot spec.
 *
 * Captures the rendered customer-facing widget AFTER converting FieldInput
 * (text / number / select) to a floating-label pattern, per Alex's global
 * rule "all titles INSIDE the input field, no labels above inputs".
 *
 * NOT a regression-pass-fail spec — it writes images into
 * `tests/audit/_screenshots/` for human review.
 *
 * Coverage:
 *  - Desktop 1440 + mobile 390.
 *  - Car Towing template applied so the widget renders a mix of
 *    select (Vehicle Type / Condition), slider (Towing Distance),
 *    multi_select (Additional Services), etc.
 *
 * Run with:
 *   npx playwright test tests/audit/_w-labels-screenshot.spec.ts \
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
    } catch {}
  });
}

async function openWizardWithCarTowing(page: Page) {
  await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  await expect(page.getByTestId('quotequick-editor-shell')).toBeVisible();

  // Apply the Car Towing template so the widget renders a representative
  // mix of field types (select / slider / multi_select etc.).
  await page.getByTestId('template-strip-card-car_towing').click().catch(() => {});
  await page.waitForTimeout(500);

  // Confirm the calculator preview is on screen.
  await expect(page.getByTestId('advanced-calculator')).toBeVisible({ timeout: 3000 });
  await page.waitForTimeout(400);
}

async function shoot(page: Page, name: string) {
  const filepath = path.join(OUT_DIR, `${name}.png`);
  // Capture the calculator preview region as well as the full viewport so
  // Alex can see the conversion in context.
  await page.screenshot({ path: filepath, fullPage: false });
  // eslint-disable-next-line no-console
  console.log(`[w-labels-screenshot] ${filepath}`);
}

async function shootCalculator(page: Page, name: string) {
  const filepath = path.join(OUT_DIR, `${name}.png`);
  const calc = page.getByTestId('advanced-calculator');
  await calc.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await calc.screenshot({ path: filepath });
  // eslint-disable-next-line no-console
  console.log(`[w-labels-screenshot] ${filepath}`);
}

/* ─────────────────────────────────────────────────────────── */

test.describe('W-LABELS — desktop 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('Car Towing widget — desktop floating labels', async ({ page }) => {
    await openWizardWithCarTowing(page);
    await shoot(page, 'w-labels-widget-desktop');
    await shootCalculator(page, 'w-labels-widget-desktop-calc');
  });
});

test.describe('W-LABELS — mobile 390', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('Car Towing widget — mobile floating labels', async ({ page }) => {
    await openWizardWithCarTowing(page);
    await shoot(page, 'w-labels-widget-mobile');
    await shootCalculator(page, 'w-labels-widget-mobile-calc');
  });
});

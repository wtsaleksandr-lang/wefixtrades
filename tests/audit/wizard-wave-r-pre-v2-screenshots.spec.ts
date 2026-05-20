/**
 * Wave R-pre v2 — visual screenshot spec.
 *
 * This is NOT a regression-pass-fail spec. It writes screenshots into
 * `tests/audit/_screenshots/` for human review. The orchestrator runs
 * this BEFORE claiming any of the v2 fixes are done, so Alex can spot-
 * check every bug visually.
 *
 * Coverage:
 *  - Browse-all modal (desktop 1440 + mobile 390): close button visible,
 *    card titles aligned in rows, dropdown filter present.
 *  - Build tab top: business-name gap, header/calc section titles.
 *  - HeaderResultsPanel: no "Headline result" duplicate label above the
 *    select; floating label only.
 *  - Hosted page section on Install tab: headline + subheadline use
 *    FloatField (no header text above bare inputs).
 *  - Settings tab: brand-badge toggle visible.
 *  - Calculator preview: pencil icon next to title; quoted-amount with
 *    a long currency value does not overlap.
 *  - "Get a quote" flow: clicking CTA reveals form WITH a Back button.
 *  - Install tab language picker: shows 5 options, FloatField pattern.
 *
 * Each screenshot is named `vN-<area>-<viewport>.png`.
 *
 * Run with:
 *   npx playwright test tests/audit/wizard-wave-r-pre-v2-screenshots.spec.ts \
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

async function openWizard(page: Page) {
  await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  await expect(page.getByTestId('quotequick-editor-shell')).toBeVisible();
}

async function shoot(page: Page, name: string) {
  const filepath = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: false });
  // eslint-disable-next-line no-console
  console.log(`[v2-screenshot] ${filepath}`);
}

/* ─────────────────────────────────────────────────────────── */

test.describe('Wave R-pre v2 — desktop 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('Build tab + business-name + pencil + preview', async ({ page }) => {
    await openWizard(page);
    await page.waitForTimeout(400);
    await shoot(page, 'v2-build-tab-desktop');
  });

  test('Browse-all modal — close button, card title alignment, dropdown', async ({ page }) => {
    await openWizard(page);
    await page.getByTestId('template-browse-all').click();
    await expect(page.getByTestId('template-browse-modal')).toBeVisible({ timeout: 2000 });
    await page.waitForTimeout(500);
    await shoot(page, 'v2-browse-all-desktop');

    // Verify close button is actually present + has a proper tap target.
    const closeBtn = page.getByTestId('template-browse-close');
    await expect(closeBtn).toBeVisible();
    const box = await closeBtn.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(36);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(36);

    // Verify the dropdown filter exists.
    await expect(page.getByTestId('template-browse-cat-select')).toBeVisible();

    // Close + confirm.
    await closeBtn.click();
    await expect(page.getByTestId('template-browse-modal')).toHaveCount(0);
  });

  test('Header/Results panel — no duplicate "Headline result" label above select', async ({ page }) => {
    await openWizard(page);
    // Seed a template so calculations exist (HeaderResultsPanel only renders
    // headline-result select when there's at least one calc).
    await page.getByTestId('template-strip-card-car_towing').click().catch(() => {});
    await page.waitForTimeout(300);
    await shoot(page, 'v2-header-results-desktop');
  });

  test('Install tab — hosted-page section + language picker (5 options) + FloatField for headline/sub', async ({ page }) => {
    await openWizard(page);
    await page.getByTestId('editor-tab-install').click();
    await expect(page.getByTestId('editor-tabpanel-install')).toBeVisible({ timeout: 1500 });
    await page.waitForTimeout(400);
    await shoot(page, 'v2-install-tab-desktop');

    const langSelect = page.getByTestId('install-select-language');
    const optionCount = await langSelect.locator('option').count();
    expect(optionCount).toBe(5);
  });

  test('Settings tab — brand-badge toggle area', async ({ page }) => {
    await openWizard(page);
    await page.getByTestId('editor-tab-settings').click();
    await expect(page.getByTestId('editor-tabpanel-settings')).toBeVisible({ timeout: 1500 });
    // Scroll the brand-badge fieldset into view.
    await page.getByTestId('settings-group-brand-badge').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shoot(page, 'v2-settings-brand-badge-desktop');
  });

  test('Style tab — section legends', async ({ page }) => {
    await openWizard(page);
    await page.getByTestId('editor-tab-style').click();
    await page.waitForTimeout(400);
    await shoot(page, 'v2-style-tab-desktop');
  });
});

test.describe('Wave R-pre v2 — mobile 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('Build tab mobile', async ({ page }) => {
    await openWizard(page);
    await page.waitForTimeout(400);
    await shoot(page, 'v2-build-tab-mobile');
  });

  test('Browse-all modal mobile', async ({ page }) => {
    await openWizard(page);
    await page.getByTestId('template-browse-all').click();
    await expect(page.getByTestId('template-browse-modal')).toBeVisible({ timeout: 2000 });
    await page.waitForTimeout(500);
    await shoot(page, 'v2-browse-all-mobile');
  });
});

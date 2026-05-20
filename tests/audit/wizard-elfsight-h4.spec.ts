/**
 * QuoteQuick wizard — Wave H4 Build > Header & Results panel + display-field
 * controls on the Calculations panel.
 *
 * Asserts:
 *  1. Header & Results panel renders below Calculations panel.
 *  2. Header > Title input updates the preview header in real time.
 *  3. Header > Subtitle input renders a subtitle paragraph in the preview
 *     (and removing it removes the paragraph).
 *  4. Results > Heading input updates the result panel's heading.
 *  5. Selecting a calc in the headline dropdown promotes it to primary in
 *     the preview's result panel (it becomes the big number).
 *  6. Toggling "Show in results" off hides that calc from the preview's
 *     result panel.
 *  7. Toggling "Divider above" adds a visible divider in the preview.
 *  8. Caption input renders below the calc's value in the preview.
 *
 * Runs under audit.config.ts (vite preview on :5000, no API).
 */
import { test, expect, type Page } from '@playwright/test';

async function clearShellState(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('qq_wizard');
      localStorage.removeItem('qq_step');
      localStorage.removeItem('qq_result');
      localStorage.removeItem('qq_elfsight_shell');
    } catch {}
  });
}

/** All visible calc-row testids in DOM order. */
async function calcRowIds(page: Page): Promise<string[]> {
  const tids = await page.locator('[data-calc-row]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-testid') || '').filter(Boolean),
  );
  return tids;
}

/** Add a fresh calc row and return its `data-testid` suffix (the calc id). */
async function addCalcRow(page: Page): Promise<string> {
  const beforeIds = await calcRowIds(page);
  await page.getByTestId('add-calculation-trigger').click();
  // Wait until a new row appears.
  await expect.poll(async () => (await calcRowIds(page)).length).toBeGreaterThan(beforeIds.length);
  const ids = await calcRowIds(page);
  const newest = ids.find((id) => !beforeIds.includes(id))!;
  return newest.replace(/^calc-row-/, '');
}

test.describe('wizard H4 — Build > Header & Results + display controls', () => {
  test.beforeEach(async ({ page }) => {
    await clearShellState(page);
  });

  test('Header & Results panel renders BELOW the Calculations panel', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    const calcsPanel = page.getByTestId('editor-calculations-panel');
    const headResPanel = page.getByTestId('editor-headerresults-panel');
    await expect(calcsPanel).toBeVisible();
    await expect(headResPanel).toBeVisible();

    // DOM order: header & results comes after calculations.
    const yCalcs = (await calcsPanel.boundingBox())!.y;
    const yHeadRes = (await headResPanel.boundingBox())!.y;
    expect(yHeadRes).toBeGreaterThan(yCalcs);
  });

  test('Header > Title updates the preview header in real time', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    await expect(page.getByTestId('advanced-calculator')).toBeVisible({ timeout: 4000 });

    const distinctTitle = `QA_Title_${Date.now()}`;
    await page.getByTestId('input-header-title').fill(distinctTitle);

    await expect(page.getByTestId('advanced-title')).toHaveText(distinctTitle, { timeout: 1500 });
  });

  test('Header > Subtitle renders + clears in the preview', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    // Wave G removed the auto-subtitle from the placeholder — confirm.
    await expect(page.getByTestId('advanced-subtitle')).toHaveCount(0);

    const distinctSub = `QA_Sub_${Date.now()}`;
    await page.getByTestId('input-header-subtitle').fill(distinctSub);

    const sub = page.getByTestId('advanced-subtitle');
    await expect(sub).toHaveText(distinctSub, { timeout: 1500 });

    // Clearing the input removes the subtitle paragraph.
    await page.getByTestId('input-header-subtitle').fill('');
    await expect(page.getByTestId('advanced-subtitle')).toHaveCount(0, { timeout: 1500 });
  });

  test('Results > Heading updates the result panel heading', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    await expect(page.getByTestId('advanced-result-heading')).toBeVisible({ timeout: 2000 });

    const distinctHeading = `QA_Heading_${Date.now()}`;
    await page.getByTestId('input-results-heading').fill(distinctHeading);

    // The heading is uppercased via CSS but `text` reflects the raw input.
    await expect(page.getByTestId('advanced-result-heading')).toHaveText(distinctHeading, {
      timeout: 1500,
    });
  });

  test('Headline dropdown promotes a calc to primary in the preview', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    await expect(page.getByTestId('advanced-calculator')).toBeVisible({ timeout: 4000 });

    // Add a second calc with a distinctive name + value so we can confirm
    // it becomes the headline once we pick it.
    const newCalcId = await addCalcRow(page);
    const distinctName = `QA_Headline_${Date.now()}`;
    await page.getByTestId(`calc-row-input-name-${newCalcId}`).fill(distinctName);
    await page.getByTestId(`calc-row-formula-input-${newCalcId}`).fill('1234');

    // Pick the new calc as the headline. The dropdown lists calcs by name.
    const dd = page.getByTestId('select-headline-calc');
    await dd.selectOption({ label: distinctName });

    // The result panel's headline value reads "1,234" (formatted as currency
    // → $1,234.00). Asserting on the digits is enough — and the heading
    // ALSO falls back to the calc's name (we didn't override Results.heading).
    const result = page.getByTestId('advanced-result');
    await expect(result).toContainText('1,234', { timeout: 1500 });

    // Cross-check: the calc-row's segmented control reflects 'primary'.
    const primaryBtn = page.getByTestId(`calc-row-resultmode-primary-${newCalcId}`);
    await expect(primaryBtn).toHaveAttribute('aria-checked', 'true', { timeout: 1500 });
  });

  test('"Show in results" toggle hides a calc from the preview', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    // Add a calc with a distinctive name we can search the preview for.
    const newCalcId = await addCalcRow(page);
    const distinctName = `QA_Visible_${Date.now()}`;
    await page.getByTestId(`calc-row-input-name-${newCalcId}`).fill(distinctName);
    await page.getByTestId(`calc-row-formula-input-${newCalcId}`).fill('42');

    // Preview's result panel shows the name (as a breakdown row, since
    // it's not the headline).
    const calc = page.getByTestId('advanced-calculator');
    await expect(calc).toContainText(distinctName, { timeout: 1500 });

    // Toggle "Show in results" OFF.
    await page.getByTestId(`calc-row-toggle-showinresults-${newCalcId}`).click();

    // The breakdown row is gone from the preview.
    await expect(calc).not.toContainText(distinctName, { timeout: 1500 });
  });

  test('"Divider above" toggle adds a visible divider in the preview', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    const newCalcId = await addCalcRow(page);
    await page.getByTestId(`calc-row-input-name-${newCalcId}`).fill(`QA_Divider_${Date.now()}`);
    await page.getByTestId(`calc-row-formula-input-${newCalcId}`).fill('7');

    // The breakdown row exists in the preview, by the row's id.
    const row = page.getByTestId(`advanced-breakdown-${newCalcId}`);
    await expect(row).toBeVisible({ timeout: 1500 });
    // Baseline: no divider.
    await expect(row).toHaveAttribute('data-divider', 'false');

    // Toggle "Divider above" ON.
    await page.getByTestId(`calc-row-toggle-divider-${newCalcId}`).click();

    await expect(row).toHaveAttribute('data-divider', 'true', { timeout: 1500 });
    // And the CSS border-top is now applied (non-zero width).
    const borderTopWidth = await row.evaluate(
      (el) => (window.getComputedStyle(el).borderTopWidth || '0px'),
    );
    expect(parseFloat(borderTopWidth)).toBeGreaterThan(0);
  });

  test('Caption input renders below the calc value in the preview', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    const newCalcId = await addCalcRow(page);
    await page.getByTestId(`calc-row-input-name-${newCalcId}`).fill(`QA_Cap_Row_${Date.now()}`);
    await page.getByTestId(`calc-row-formula-input-${newCalcId}`).fill('5');

    const distinctCaption = `QA_Caption_${Date.now()}`;
    await page.getByTestId(`calc-row-input-caption-${newCalcId}`).fill(distinctCaption);

    // The caption appears in the breakdown row's caption span.
    const cap = page.getByTestId(`advanced-breakdown-caption-${newCalcId}`);
    await expect(cap).toHaveText(distinctCaption, { timeout: 1500 });
  });
});

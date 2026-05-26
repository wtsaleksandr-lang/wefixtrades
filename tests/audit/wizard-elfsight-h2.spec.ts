/**
 * QuoteQuick wizard — Wave H2 Build > Fields panel UX-QA.
 *
 * Asserts:
 *  1. The Build tab renders the Fields panel (`editor-fields-panel`).
 *  2. The Add-field menu opens with all 6 type buttons present.
 *  3. Picking "slider" appends a row AND the live preview rerenders with a
 *     new range input (the seed has zero sliders).
 *  4. Editing a field's label updates the preview within ~500ms.
 *  5. Removing a field removes the row AND its preview label.
 *  6. Up/Down arrows reorder the list AND the preview reflects the new order.
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
      // Wave 10 — wizard preview now defaults to stepper mode which
      // hides fields not on the current step. The reorder test inspects
      // ALL preview labels via `[data-testid="advanced-calculator"] label`,
      // so we seed single-page layout to keep every label rendered.
      localStorage.setItem('qq_elfsight_shell', JSON.stringify({
        stepLayout: 'single',
      }));
    } catch {}
  });
}

test.describe('wizard H2 — Build > Fields panel', () => {
  test.beforeEach(async ({ page }) => {
    await clearShellState(page);
  });

  test('Build tab renders the Fields panel', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    await expect(page.getByTestId('editor-tab-build')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('editor-fields-panel')).toBeVisible();

    // The seeded placeholder gives us 3 field rows on first mount.
    const rows = page.locator('[data-testid^="field-row-"][data-field-type]');
    await expect(rows).not.toHaveCount(0);
  });

  test('"Add field" menu opens with all 6 type buttons', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    // There may be two AddFieldMenus mounted (header + empty-state) — pick
    // the first trigger, which is always the header one when there are rows.
    await page.getByTestId('add-field-trigger').first().click();
    const menu = page.getByTestId('add-field-menu').first();
    await expect(menu).toBeVisible();

    for (const t of ['slider', 'number', 'dropdown', 'choice', 'imageChoice', 'heading'] as const) {
      await expect(page.getByTestId(`add-field-${t}`).first()).toBeVisible();
    }
  });

  test('picking "slider" appends a row AND the live preview rerenders', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    await expect(page.getByTestId('advanced-calculator')).toBeVisible({ timeout: 4000 });

    // Baseline: seed has no slider/range inputs.
    const rangeInputs = page.locator('[data-testid="advanced-calculator"] input[type="range"]');
    await expect(rangeInputs).toHaveCount(0);

    const rowsBefore = await page.locator('[data-testid^="field-row-"][data-field-type]').count();

    await page.getByTestId('add-field-trigger').first().click();
    await page.getByTestId('add-field-slider').first().click();

    // A new row of type=slider exists in the list.
    const sliderRow = page.locator('[data-testid^="field-row-"][data-field-type="slider"]');
    await expect(sliderRow).toHaveCount(1, { timeout: 1500 });

    const rowsAfter = await page.locator('[data-testid^="field-row-"][data-field-type]').count();
    expect(rowsAfter).toBe(rowsBefore + 1);

    // Live preview rerendered with the new range input.
    await expect(rangeInputs).toHaveCount(1, { timeout: 1500 });
  });

  test('editing a field label updates the preview within ~500ms', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    // Add a slider so we have a distinctive row to edit (the seed has none).
    await page.getByTestId('add-field-trigger').first().click();
    await page.getByTestId('add-field-slider').first().click();
    const sliderRow = page.locator('[data-testid^="field-row-"][data-field-type="slider"]').first();
    await expect(sliderRow).toBeVisible({ timeout: 1500 });

    // Find its dynamic id and open the editor.
    const sliderRowId = await sliderRow.getAttribute('data-testid');
    const id = sliderRowId!.replace(/^field-row-/, '');

    await page.getByTestId(`field-row-toggle-${id}`).click();
    const labelInput = page.getByTestId(`field-row-input-label-${id}`);
    await expect(labelInput).toBeVisible();

    const newLabel = `QA_Label_${Date.now()}`;
    await labelInput.fill(newLabel);

    // Preview rerenders with the new label.
    await expect(page.getByTestId('advanced-calculator')).toContainText(newLabel, { timeout: 1500 });
  });

  test('remove button removes the field from list AND preview', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    // Add an isolated slider field with a distinctive label so we can verify
    // removal in both the list and the preview without ambiguity.
    await page.getByTestId('add-field-trigger').first().click();
    await page.getByTestId('add-field-slider').first().click();
    const sliderRow = page.locator('[data-testid^="field-row-"][data-field-type="slider"]').first();
    await expect(sliderRow).toBeVisible({ timeout: 1500 });
    const id = (await sliderRow.getAttribute('data-testid'))!.replace(/^field-row-/, '');

    await page.getByTestId(`field-row-toggle-${id}`).click();
    const distinct = `QA_Remove_${Date.now()}`;
    await page.getByTestId(`field-row-input-label-${id}`).fill(distinct);
    await expect(page.getByTestId('advanced-calculator')).toContainText(distinct, { timeout: 1500 });

    // Remove (two-step confirm).
    await page.getByTestId(`field-row-remove-${id}`).click();
    await page.getByTestId(`field-row-remove-confirm-${id}`).click();

    await expect(page.locator(`[data-testid="field-row-${id}"]`)).toHaveCount(0);
    // Preview no longer carries the distinct label.
    await expect(page.getByTestId('advanced-calculator')).not.toContainText(distinct, { timeout: 1500 });
  });

  test('Up/Down arrows reorder fields AND preview reflects new order', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    // Capture the current ordered list of label texts from the rows.
    const labelsOf = async () => {
      const rows = page.locator('[data-testid^="field-row-"][data-field-type]');
      const n = await rows.count();
      const out: string[] = [];
      for (let i = 0; i < n; i++) {
        const id = (await rows.nth(i).getAttribute('data-testid'))!.replace(/^field-row-/, '');
        out.push((await page.getByTestId(`field-row-label-${id}`).innerText()).trim());
      }
      return out;
    };

    const beforeLabels = await labelsOf();
    expect(beforeLabels.length).toBeGreaterThanOrEqual(2);

    // Move the SECOND row up — swaps positions 0 and 1.
    const secondId = (await page.locator('[data-testid^="field-row-"][data-field-type]').nth(1).getAttribute('data-testid'))!.replace(/^field-row-/, '');
    await page.getByTestId(`field-row-up-${secondId}`).click();
    await page.waitForTimeout(150);

    const afterLabels = await labelsOf();
    expect(afterLabels[0]).toBe(beforeLabels[1]);
    expect(afterLabels[1]).toBe(beforeLabels[0]);

    // Preview labels match the row order (read all <label> texts inside
    // advanced-calculator, filter to those whose text matches a row label).
    const previewLabels = await page
      .locator('[data-testid="advanced-calculator"] label')
      .allInnerTexts();
    const trimmed = previewLabels.map((s) => s.trim()).filter(Boolean);
    const idxNew0 = trimmed.indexOf(afterLabels[0]);
    const idxNew1 = trimmed.indexOf(afterLabels[1]);
    // Both labels are present in the preview in the new order.
    expect(idxNew0).toBeGreaterThanOrEqual(0);
    expect(idxNew1).toBeGreaterThan(idxNew0);
  });
});

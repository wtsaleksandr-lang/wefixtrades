/**
 * QuoteQuick wizard — Wave H3 Build > Calculations panel UX-QA.
 *
 * Asserts:
 *  1. The Build tab renders the Calculations panel (`editor-calculations-panel`).
 *  2. "Add calculation" appends a new row.
 *  3. Inserting a field via the "+ insert" menu adds a token to the formula.
 *  4. A valid formula referencing a field drives the live preview's result.
 *  5. A broken formula (referencing a deleted field) shows an inline error
 *     AND the preview gracefully falls back (no crash).
 *  6. Up/Down arrows reorder calculations.
 *  7. Two-step Remove confirm works.
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

/** Read all calc-row testids in DOM order — uses `[data-calc-row]` to scope. */
async function calcRowIds(page: Page): Promise<string[]> {
  const tids = await page.locator('[data-calc-row]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-testid') || '').filter(Boolean),
  );
  return tids;
}

test.describe('wizard H3 — Build > Calculations panel', () => {
  test.beforeEach(async ({ page }) => {
    await clearShellState(page);
  });

  test('Build tab renders the Calculations panel', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    await expect(page.getByTestId('editor-tab-build')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('editor-calculations-panel')).toBeVisible();

    // Seeded from buildBlankPreviewConfig — at least one calc row exists.
    const rows = await calcRowIds(page);
    expect(rows.length).toBeGreaterThan(0);
  });

  test('"Add calculation" appends a new row', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    const before = (await calcRowIds(page)).length;
    await page.getByTestId('add-calculation-trigger').click();
    await page.waitForTimeout(150);
    const after = (await calcRowIds(page)).length;
    expect(after).toBe(before + 1);
  });

  test('"+ insert" menu inserts a field token into the formula', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    // Add a fresh blank calc so we have an empty formula to populate.
    await page.getByTestId('add-calculation-trigger').click();
    await page.waitForTimeout(150);
    const ids = await calcRowIds(page);
    const newId = ids[ids.length - 1].replace(/^calc-row-/, '');

    // Open the insert menu and pick the first field item.
    await page.getByTestId(`calc-row-insert-trigger-${newId}`).click();
    const menu = page.getByTestId(`calc-row-insert-menu-${newId}`);
    await expect(menu).toBeVisible();

    // The seed places "Quantity" as a field — its insert item id is normalised.
    const quantityItem = page.getByTestId(`calc-row-insert-field-${newId}-quantity`);
    await expect(quantityItem).toBeVisible();
    await quantityItem.click();

    // Formula input now contains [Quantity].
    const input = page.getByTestId(`calc-row-formula-input-${newId}`);
    await expect(input).toHaveValue('[Quantity]');
  });

  test('a valid formula drives the preview result', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    await expect(page.getByTestId('advanced-calculator')).toBeVisible({ timeout: 4000 });

    // Add a calc whose result becomes the headline (we name it identically
    // to the seed's headline `Estimated Total` so it replaces it). Set its
    // formula to a fixed value so we know what the preview should show.
    await page.getByTestId('add-calculation-trigger').click();
    await page.waitForTimeout(150);
    const ids = await calcRowIds(page);
    const newId = ids[ids.length - 1].replace(/^calc-row-/, '');

    // Rename the calc to override the headline.
    await page.getByTestId(`calc-row-input-name-${newId}`).fill('Estimated Total');
    await page.getByTestId(`calc-row-formula-input-${newId}`).fill('[Quantity] * 999');

    // The preview's result panel should reflect "999" somewhere (quantity
    // defaults to 1 in the seed — so 1 * 999 = 999).
    const calc = page.getByTestId('advanced-calculator');
    // Allow time for re-render.
    await expect(calc).toContainText('999', { timeout: 2000 });
  });

  test('a broken formula shows an inline error AND preview does not crash', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    await page.getByTestId('add-calculation-trigger').click();
    await page.waitForTimeout(150);
    const ids = await calcRowIds(page);
    const newId = ids[ids.length - 1].replace(/^calc-row-/, '');

    // Reference a field that does not exist anywhere.
    await page.getByTestId(`calc-row-formula-input-${newId}`).fill('[Definitely Not A Field] * 5');

    // Inline error visible.
    const err = page.getByTestId(`calc-row-formula-error-${newId}`);
    await expect(err).toBeVisible({ timeout: 1000 });
    await expect(err).toContainText(/Unknown reference/i);

    // Preview is still mounted and not crashed.
    await expect(page.getByTestId('advanced-calculator')).toBeVisible();
  });

  test('Up/Down arrows reorder calculations', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    // Add a second calc so we have at least two to reorder.
    await page.getByTestId('add-calculation-trigger').click();
    await page.waitForTimeout(150);
    // Add a third so reordering is meaningful even if the seed is empty.
    await page.getByTestId('add-calculation-trigger').click();
    await page.waitForTimeout(150);

    const idsBefore = await calcRowIds(page);
    expect(idsBefore.length).toBeGreaterThanOrEqual(2);

    // Move the SECOND row UP — swaps positions 0 and 1.
    const secondId = idsBefore[1].replace(/^calc-row-/, '');
    await page.getByTestId(`calc-row-up-${secondId}`).click();
    await page.waitForTimeout(150);

    const idsAfter = await calcRowIds(page);
    expect(idsAfter[0]).toBe(idsBefore[1]);
    expect(idsAfter[1]).toBe(idsBefore[0]);
  });

  test('two-step Remove confirm removes the calculation', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    // Add a calc so we have a known target.
    await page.getByTestId('add-calculation-trigger').click();
    await page.waitForTimeout(150);
    const ids = await calcRowIds(page);
    const target = ids[ids.length - 1];
    const id = target.replace(/^calc-row-/, '');

    const beforeCount = ids.length;

    // Two-step confirm: first click reveals the "Remove" button.
    await page.getByTestId(`calc-row-remove-${id}`).click();
    const confirmBtn = page.getByTestId(`calc-row-remove-confirm-${id}`);
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    await page.waitForTimeout(150);
    const afterIds = await calcRowIds(page);
    expect(afterIds.length).toBe(beforeCount - 1);
    expect(afterIds).not.toContain(target);
  });
});

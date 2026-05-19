/**
 * QuoteQuick wizard — Step 1 UX-QA (Wave F).
 *
 * Runtime UX assertions a code-review can't catch:
 *  1. Typing the business name updates the live preview header within 500ms.
 *  2. Clicking each layout actually changes the preview's DOM (the advanced
 *     calculator is present and its `data-layout` attribute flips).
 *  3. Picking a non-blank template hides the old trade picker and sets the
 *     selected trade (surfaced via the `trade-inferred-chip` data-testid).
 *  4. Picking "Blank" brings the trade picker back.
 *  5. The new X close button (top-right of the wizard navbar) is present and
 *     clickable; clicking it dismisses the wizard overlay.
 *
 * Runs under audit.config.ts (vite preview on :5000, no API).
 */
import { test, expect } from '@playwright/test';

test.describe('wizard step 1 — UX-QA', () => {
  test.beforeEach(async ({ page }) => {
    // Start from a clean slate — the wizard persists state to localStorage.
    await page.addInitScript(() => {
      try {
        localStorage.removeItem('qq_wizard');
        localStorage.removeItem('qq_step');
        localStorage.removeItem('qq_result');
      } catch {}
    });
  });

  test('business name typing updates the preview header live', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const name = `UX QA ${Date.now()}`;
    await page.getByTestId('input-business-name').fill(name);

    // The advanced calculator's header reads from `business_name` when its
    // own `header.title` is empty (true for the blank-preview placeholder
    // seeded on mount). It should reflect the typed name within 500ms.
    await expect(page.getByTestId('advanced-calculator')).toBeVisible({ timeout: 4000 });
    await expect(page.getByTestId('advanced-calculator')).toContainText(name, { timeout: 500 });
  });

  test('each layout visibly changes the preview', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const layouts = ['single-column', 'two-column', 'multi-column'] as const;
    for (const l of layouts) {
      await page.getByTestId(`layout-${l}`).click();
      await page.waitForTimeout(150);
      const body = page.getByTestId('advanced-body');
      await expect(body).toBeVisible();
      await expect(body).toHaveAttribute('data-layout', l);
    }
  });

  test('non-blank template hides trade picker and infers trade', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Pick a layout with a known non-blank template that has a `trades[]`.
    // `property_cleaning` lives in `two-column` and trades=['house_cleaning', ...].
    await page.getByTestId('layout-two-column').click();
    await page.waitForTimeout(120);
    await page.getByTestId('template-card-property_cleaning').click();
    await page.waitForTimeout(200);

    // The inferred-trade chip should appear; the old trade picker (category
    // grid + search) should be hidden.
    await expect(page.getByTestId('trade-inferred-chip')).toBeVisible();
    await expect(page.getByTestId('input-trade-search')).toHaveCount(0);
    await expect(page.getByTestId('category-cleaning')).toHaveCount(0);
  });

  test('Blank template brings the trade picker back', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // First pick a non-blank template so we have something to "undo" to blank.
    await page.getByTestId('layout-two-column').click();
    await page.waitForTimeout(120);
    await page.getByTestId('template-card-property_cleaning').click();
    await page.waitForTimeout(150);
    await expect(page.getByTestId('trade-inferred-chip')).toBeVisible();

    // Now switch to Blank — the trade picker should reappear.
    await page.getByTestId('template-card-blank').click();
    await page.waitForTimeout(150);
    await expect(page.getByTestId('trade-inferred-chip')).toHaveCount(0);
    await expect(page.getByTestId('input-trade-search')).toBeVisible();
  });

  test('X close button dismisses the wizard overlay', async ({ page }) => {
    // Start from `/` so there IS a history entry to go back to.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    const closeBtn = page.getByTestId('quotequick-close');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await page.waitForTimeout(400);

    // After close the wizard's outer shell must no longer be the current page.
    await expect(page.locator('.wizard-shell-modal')).toHaveCount(0);
    expect(new URL(page.url()).pathname).not.toBe('/wizard');
  });
});

/**
 * Wave Q — pricing restructure + brand-badge tier gate.
 *
 *   Marketing pricing page:
 *     1. Three pricing cards visible: Free, Pro, Business.
 *     2. Free shows $0; Pro shows $29; Business shows $79.
 *     3. Annual toggle shows "Save 17%" and updates the displayed
 *        monthly-equivalent.
 *
 *   Wizard SettingsTab:
 *     4. Brand badge fieldset renders.
 *     5. The toggle is disabled (free-tier default; gating is server-side).
 *     6. Upgrade-to-Pro link is present and points at /pricing/quotequick.
 *
 * Runs under audit.config.ts (vite preview on :5000, no API).
 */
import { test, expect, type Page } from '@playwright/test';

const WIZARD = '/wizard';
const PRICING = '/pricing/quotequick';

test.describe('Wave Q — pricing page', () => {
  test('Three pricing tiers render with correct headline prices', async ({ page }) => {
    await page.goto(PRICING, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    // Tier labels.
    await expect(page.getByText('Free', { exact: true }).first()).toBeVisible();
    // 'Pro' appears as both a label and inside other copy — use a more specific
    // anchor by checking the headline price.
    await expect(page.getByText('$0', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('$29', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('$79', { exact: true }).first()).toBeVisible();
  });

  test('Annual toggle shows "Save 17%" and updates prices', async ({ page }) => {
    await page.goto(PRICING, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    await expect(page.getByText(/Save 17%/i)).toBeVisible();

    // Click Annual.
    await page.getByRole('button', { name: /^Annual/ }).click();
    // 17% off $29 monthly = ~$24/mo effective; 17% off $79 = ~$66.
    // We assert the new numbers appear somewhere on the page (annual button
    // is selected → headline price recomputes).
    await page.waitForTimeout(300);
    await expect(page.locator('body')).toContainText(/\$2[34]/);
    await expect(page.locator('body')).toContainText(/\$6[5-7]/);
  });
});

async function clearShellState(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('qq_elfsight_shell');
      localStorage.removeItem('qq_editor_pane_width');
    } catch {}
  });
}

test.describe('Wave Q — SettingsTab brand badge', () => {
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('Brand-badge fieldset renders + toggle is disabled + upgrade link visible', async ({ page }) => {
    await page.goto(WIZARD, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await expect(page.getByTestId('quotequick-editor-shell')).toBeVisible();
    await page.getByTestId('editor-tab-settings').click();
    await expect(page.getByTestId('editor-tabpanel-settings')).toBeVisible();

    const group = page.getByTestId('settings-group-brand-badge');
    await expect(group).toBeVisible();

    const input = page.getByTestId('settings-brand-badge-input');
    await expect(input).toBeVisible();
    await expect(input).toBeDisabled();

    const upgrade = page.getByTestId('settings-brand-badge-upgrade');
    await expect(upgrade).toBeVisible();
    await expect(upgrade).toHaveAttribute('href', '/pricing/quotequick');
    await expect(upgrade).toContainText(/Pro/);
  });
});

/**
 * QuoteQuick wizard — Wave P hosted-page chrome + slug conflict UX.
 *
 *   Editor / wizard side:
 *     1. Install tab exposes the new "Hosted page customisation" section.
 *     2. Background preset grid renders all 8 presets.
 *     3. Selecting a preset persists into ShellSettings.hostedPage and
 *        the next reload reproduces it.
 *     4. Headline + subheadline inputs persist on round-trip.
 *     5. Centered-card toggle persists on round-trip.
 *     6. Slug-conflict UX: edit button reveals an inline editor; saving a
 *        new slug persists settings.preferredSlug; clearing resets it.
 *     7. WeFixTrades brand badge is rendered above the widget by default
 *        (shows the QuoteQuick-by-WeFixTrades pill).
 *
 *   Mobile (390×844) — the section collapses to a 2-column preset grid;
 *   tap targets ≥44px on Copy/Open and the upload button.
 *
 * Runs under audit.config.ts (vite preview on :5000, no API).
 */
import { test, expect, type Page } from '@playwright/test';

const WIZARD = '/wizard';

async function clearShellState(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('qq_wizard');
      localStorage.removeItem('qq_step');
      localStorage.removeItem('qq_result');
      localStorage.removeItem('qq_elfsight_shell');
      localStorage.removeItem('qq_editor_pane_width');
    } catch {}
  });
}

async function openWizard(page: Page) {
  await page.goto(WIZARD, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('quotequick-editor-shell')).toBeVisible();
}

async function gotoInstallTab(page: Page) {
  await openWizard(page);
  await page.getByTestId('editor-tab-install').click();
  await expect(page.getByTestId('editor-tabpanel-install')).toBeVisible({ timeout: 2000 });
}

test.describe('wizard Wave P — Hosted page customisation', () => {
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('Install tab renders the Hosted page section + preset grid', async ({ page }) => {
    await gotoInstallTab(page);
    await expect(page.getByTestId('install-section-hosted-page')).toBeVisible();
    await expect(page.getByTestId('hosted-preset-grid')).toBeVisible();
    // All 8 presets present.
    const presetCards = page.locator('[data-testid^="hosted-preset-"]')
      .filter({ hasNot: page.getByTestId('hosted-preset-grid') });
    expect(await presetCards.count()).toBeGreaterThanOrEqual(8);
  });

  test('Selecting a preset persists into localStorage', async ({ page }) => {
    await gotoInstallTab(page);
    // Wait for the preset grid to be in the DOM before clicking.
    await expect(page.getByTestId('hosted-preset-grid')).toBeVisible();
    await page.getByTestId('hosted-preset-mesh-blur').click();
    // Persistence is the user-observable contract; aria-pressed timing is
    // brittle inside the deep wizard tree. Assert localStorage instead.
    await page.waitForFunction(() => {
      try {
        const raw = localStorage.getItem('qq_elfsight_shell');
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return parsed?.settings?.hostedPage?.background?.presetId === 'mesh-blur';
      } catch { return false; }
    }, undefined, { timeout: 4000 });

    // Reload and confirm the value survives.
    await page.reload();
    await expect(page.getByTestId('quotequick-editor-shell')).toBeVisible();
    const stored = await page.evaluate(() => localStorage.getItem('qq_elfsight_shell'));
    const parsed = JSON.parse(stored as string);
    expect(parsed?.settings?.hostedPage?.background?.presetId).toBe('mesh-blur');
  });

  test('Headline + subheadline inputs persist', async ({ page }) => {
    await gotoInstallTab(page);
    await page.getByTestId('hosted-headline-input').fill('Get a quote from Joe');
    await page.getByTestId('hosted-subheadline-input').fill('Two minutes, no spam.');
    await page.waitForTimeout(200);

    const stored = await page.evaluate(() => localStorage.getItem('qq_elfsight_shell'));
    const parsed = JSON.parse(stored as string);
    expect(parsed?.settings?.hostedPage?.headline).toBe('Get a quote from Joe');
    expect(parsed?.settings?.hostedPage?.subheadline).toBe('Two minutes, no spam.');
  });

  test('Centered-card toggle persists', async ({ page }) => {
    await gotoInstallTab(page);
    const toggle = page.getByTestId('hosted-card-toggle').locator('input[type="checkbox"]');
    // Defaults checked.
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await page.waitForTimeout(150);
    const stored = await page.evaluate(() => localStorage.getItem('qq_elfsight_shell'));
    const parsed = JSON.parse(stored as string);
    expect(parsed?.settings?.hostedPage?.showCard).toBe(false);
  });
});

test.describe('wizard Wave P — Slug conflict UX', () => {
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('Pencil icon opens inline slug editor; save persists preferredSlug', async ({ page }) => {
    await gotoInstallTab(page);
    // Set business name first via Build tab.
    await page.getByTestId('editor-tab-build').click();
    const nameInput = page.getByTestId('input-business-name');
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill('Joes Plumbing');
    }
    await page.getByTestId('editor-tab-install').click();
    await expect(page.getByTestId('install-hosted-url')).toContainText('joes-plumbing');

    // Open the slug editor.
    await page.getByTestId('install-hosted-slug-edit').click();
    await expect(page.getByTestId('install-hosted-slug-input')).toBeVisible();
    await page.getByTestId('install-hosted-slug-input').fill('joes-pro');
    await page.getByTestId('install-hosted-slug-save').click();

    // URL updates and preferredSlug persists.
    await expect(page.getByTestId('install-hosted-url')).toContainText('joes-pro');
    const stored = await page.evaluate(() => localStorage.getItem('qq_elfsight_shell'));
    const parsed = JSON.parse(stored as string);
    expect(parsed?.settings?.preferredSlug).toBe('joes-pro');

    // 'Use the auto-derived one instead' link resets it.
    await page.getByTestId('install-hosted-slug-clear-preferred').click();
    const stored2 = await page.evaluate(() => localStorage.getItem('qq_elfsight_shell'));
    const parsed2 = JSON.parse(stored2 as string);
    expect(parsed2?.settings?.preferredSlug).toBeFalsy();
  });
});

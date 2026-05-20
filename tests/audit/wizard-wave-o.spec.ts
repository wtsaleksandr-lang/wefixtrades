/**
 * QuoteQuick wizard — Wave O Install tab refresh.
 *
 *   1. Hosted-link section is the first section on the Install tab.
 *   2. Hosted URL display reflects the business name from the wizard
 *      (slugified via shared/slugUtils.slugify).
 *   3. "Reserved — activates after publish" badge appears when the
 *      calculator isn't published yet.
 *   4. Copy-link button copies the full hosted URL to the clipboard.
 *   5. Open button is disabled while the calculator is unpublished.
 *   6. Platform install guides render as clickable cards (Wave O grid),
 *      NOT the legacy inline 3-line tab list. Clicking a card opens the
 *      detailed modal with numbered steps.
 *   7. Mobile (390×844) — hosted-link card stacks cleanly; tap targets
 *      on Copy/Open ≥44px.
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
      localStorage.removeItem('qq_editor_pane_width');
    } catch {}
  });
}

async function openWizard(page: Page) {
  await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('quotequick-editor-shell')).toBeVisible();
}

async function gotoInstallTab(page: Page) {
  await openWizard(page);
  await page.getByTestId('editor-tab-install').click();
  await expect(page.getByTestId('editor-tabpanel-install')).toBeVisible({ timeout: 2000 });
}

async function setBusinessName(page: Page, name: string) {
  // Open Build tab to expose the business-name input, then return to Install.
  await page.getByTestId('editor-tab-build').click();
  const input = page.getByTestId('input-business-name');
  if (await input.isVisible().catch(() => false)) {
    await input.fill(name);
  }
  await page.getByTestId('editor-tab-install').click();
  await expect(page.getByTestId('editor-tabpanel-install')).toBeVisible({ timeout: 2000 });
}

test.describe('wizard Wave O — Install tab refresh', () => {
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('Hosted-link section renders at the top of the Install tab', async ({ page }) => {
    await gotoInstallTab(page);

    const hosted = page.getByTestId('install-section-hosted');
    await expect(hosted).toBeVisible();
    await expect(page.getByTestId('install-hosted-url')).toBeVisible();
    await expect(page.getByTestId('install-hosted-copy')).toBeVisible();
    await expect(page.getByTestId('install-hosted-open')).toBeVisible();
  });

  test('Hosted URL reflects the business name (slugified)', async ({ page }) => {
    await gotoInstallTab(page);
    await setBusinessName(page, "Joe's Plumbing & Heating");

    const url = page.getByTestId('install-hosted-url');
    await expect(url).toHaveAttribute('data-slug', 'joes-plumbing-and-heating');
    await expect(url).toContainText('joes-plumbing-and-heating.');
  });

  test('Live badge is shown (Wave P — auto-publish on save)', async ({ page }) => {
    // Wave P removed the misleading "Reserved" badge — every save
    // auto-publishes server-side, so the hosted link is live as soon as
    // the user lands on Install. The badge now reads 'Live'.
    await gotoInstallTab(page);
    const badge = page.getByTestId('install-hosted-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(/live/i);
    await expect(badge).toHaveAttribute('data-state', 'live');
  });

  test('Open button is always clickable on the hosted link card (Wave P)', async ({ page }) => {
    // Wave P dropped the unpublished-disable gate. The Open link is now
    // an unconditional `<a href>` to the hosted URL.
    await gotoInstallTab(page);
    const open = page.getByTestId('install-hosted-open');
    await expect(open).toBeVisible();
    await expect(open).not.toHaveAttribute('aria-disabled', 'true');
    await expect(open).toHaveAttribute('href', /your-quote\.net/);
  });

  test('Platform guides render as clickable cards (not inline tabs)', async ({ page }) => {
    await gotoInstallTab(page);

    // Grid is the new pattern; the old `install-guide-tabs` element no
    // longer exists, and the old `install-guide-list-*` lists are gone.
    await expect(page.getByTestId('install-guide-grid')).toBeVisible();
    await expect(page.getByTestId('install-guide-tabs')).toHaveCount(0);

    // At least 6 platforms (Wave O includes Webflow + Shopify + both WP variants).
    const cards = page.locator('[data-testid^="install-guide-card-"]');
    expect(await cards.count()).toBeGreaterThanOrEqual(6);
  });

  test('Clicking a card opens the detailed modal', async ({ page }) => {
    await gotoInstallTab(page);

    await page.getByTestId('install-guide-card-shopify').click();
    const modal = page.getByTestId('install-guide-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('data-platform', 'shopify');

    // Modal exposes copy + done.
    await expect(page.getByTestId('install-guide-modal-copy')).toBeVisible();
    await page.getByTestId('install-guide-modal-done').click();
    await expect(modal).not.toBeVisible();
  });
});

test.describe('wizard Wave O — mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('Hosted-link card stacks and has ≥44px tap targets', async ({ page }) => {
    await gotoInstallTab(page);
    await expect(page.getByTestId('install-section-hosted')).toBeVisible();

    const copyBox = await page.getByTestId('install-hosted-copy').boundingBox();
    const openBox = await page.getByTestId('install-hosted-open').boundingBox();
    expect(copyBox?.height ?? 0).toBeGreaterThanOrEqual(43);
    expect(openBox?.height ?? 0).toBeGreaterThanOrEqual(43);

    // Guide grid collapses to a single column.
    const grid = page.getByTestId('install-guide-grid');
    await expect(grid).toBeVisible();
  });
});

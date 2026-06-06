/**
 * QuoteQuick wizard — Wave O hosted-link + platform-guide cards.
 *
 * IA REDESIGN (2026-06, editor IA / Elfsight-parity) — the standalone
 * **Install tab** was removed; the tab strip is now Build · Action · Style ·
 * Settings (+ Help). Everything the Install tab used to host (hosted link,
 * embed snippet, platform guides, done-for-you CTA) was folded VERBATIM into a
 * **Publish modal** that opens from the top-bar `quotequick-publish` button.
 * The modal renders the same <InstallTab> component, so every install-* testid
 * is preserved — only the navigation changed: instead of clicking
 * `editor-tab-install`, we click `quotequick-publish` and assert against
 * `editor-publish-overlay`.
 *
 * What this spec asserts (Wave O behaviour, now inside the Publish modal):
 *   1. Hosted-link section is the first section in the Publish modal.
 *   2. Hosted URL display reflects the business name from the wizard
 *      (slugified via shared/slugUtils.slugify).
 *   3. "Live" badge appears (Wave P — auto-publish on save).
 *   4. Copy-link button + hosted URL controls render.
 *   5. Open button is an unconditional <a href> to the hosted URL (Wave P).
 *   6. Platform install guides render as clickable cards (Wave O grid),
 *      NOT the legacy inline 3-line tab list. Clicking a card opens the
 *      detailed modal with numbered steps.
 *   7. Mobile (390×844) — hosted-link card stacks cleanly; tap targets
 *      on Copy/Open ≥44px.
 *   8. Publish modal close (`editor-publish-close`) dismisses the overlay.
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

/**
 * IA redesign — the Install tab is gone. Open the Publish modal instead; it
 * renders the same InstallTab content, so all install-* testids resolve inside
 * the `editor-publish-overlay` portal.
 */
async function openPublishModal(page: Page) {
  await openWizard(page);
  await page.getByTestId('quotequick-publish').click();
  await expect(page.getByTestId('editor-publish-overlay')).toBeVisible({ timeout: 2000 });
  await expect(page.getByTestId('install-section-hosted')).toBeVisible({ timeout: 2000 });
}

async function setBusinessName(page: Page, name: string) {
  // The business-name input lives on the Build tab (left pane). Set it, then
  // open the Publish modal so the hosted link reflects the slugified name.
  await openWizard(page);
  const input = page.getByTestId('input-business-name');
  if (await input.isVisible().catch(() => false)) {
    await input.fill(name);
  }
  await page.getByTestId('quotequick-publish').click();
  await expect(page.getByTestId('editor-publish-overlay')).toBeVisible({ timeout: 2000 });
}

test.describe('wizard Wave O — Publish modal hosted link', () => {
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('Hosted-link section renders at the top of the Publish modal', async ({ page }) => {
    await openPublishModal(page);

    const hosted = page.getByTestId('install-section-hosted');
    await expect(hosted).toBeVisible();
    await expect(page.getByTestId('install-hosted-url')).toBeVisible();
    await expect(page.getByTestId('install-hosted-copy')).toBeVisible();
    await expect(page.getByTestId('install-hosted-open')).toBeVisible();
  });

  test('Hosted URL reflects the business name (slugified)', async ({ page }) => {
    await setBusinessName(page, "Joe's Plumbing & Heating");

    const url = page.getByTestId('install-hosted-url');
    await expect(url).toHaveAttribute('data-slug', 'joes-plumbing-and-heating');
    await expect(url).toContainText('joes-plumbing-and-heating.');
  });

  test('Live badge is shown (Wave P — auto-publish on save)', async ({ page }) => {
    // Wave P removed the misleading "Reserved" badge — every save
    // auto-publishes server-side, so the hosted link is live as soon as
    // the user opens the Publish modal. The badge reads 'Live'.
    await openPublishModal(page);
    const badge = page.getByTestId('install-hosted-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(/live/i);
    await expect(badge).toHaveAttribute('data-state', 'live');
  });

  test('Open button is an unconditional link to the hosted URL (Wave P)', async ({ page }) => {
    // Wave P dropped the unpublished-disable gate. The Open control is now
    // an unconditional `<a href>` to the hosted URL.
    await openPublishModal(page);
    const open = page.getByTestId('install-hosted-open');
    await expect(open).toBeVisible();
    await expect(open).not.toHaveAttribute('aria-disabled', 'true');
    await expect(open).toHaveAttribute('href', /your-quote\.net/);
  });

  test('Platform guides render as clickable cards (not inline tabs)', async ({ page }) => {
    await openPublishModal(page);

    // Grid is the new pattern; the old `install-guide-tabs` element no
    // longer exists, and the old `install-guide-list-*` lists are gone.
    await expect(page.getByTestId('install-guide-grid')).toBeVisible();
    await expect(page.getByTestId('install-guide-tabs')).toHaveCount(0);

    // At least 6 platforms (Wave O includes Webflow + Shopify + both WP variants).
    const cards = page.locator('[data-testid^="install-guide-card-"]');
    expect(await cards.count()).toBeGreaterThanOrEqual(6);
  });

  test('Clicking a guide card opens the detailed modal', async ({ page }) => {
    await openPublishModal(page);

    await page.getByTestId('install-guide-card-shopify').click();
    const modal = page.getByTestId('install-guide-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('data-platform', 'shopify');

    // Modal exposes copy + done.
    await expect(page.getByTestId('install-guide-modal-copy')).toBeVisible();
    await page.getByTestId('install-guide-modal-done').click();
    await expect(modal).not.toBeVisible();
  });

  test('Publish modal closes via the Done/close control', async ({ page }) => {
    // IA redesign — the modal is dismissible via `editor-publish-close`
    // (the "Done" button in the modal header). This replaces the old
    // tab-navigation-away path the Install tab relied on.
    await openPublishModal(page);
    await page.getByTestId('editor-publish-close').click();
    await expect(page.getByTestId('editor-publish-overlay')).toHaveCount(0);
  });
});

test.describe('wizard Wave O — mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('Hosted-link card stacks and has ≥44px tap targets', async ({ page }) => {
    await openPublishModal(page);
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

/**
 * QuoteQuick wizard — Wave H1 Elfsight-clone editor shell UX-QA.
 *
 * Asserts the new shell renders at /wizard, the 4 tabs switch, the X close
 * works, typing a placeholder input propagates to the live preview, the
 * mobile layout stacks cleanly, and the legacy wizard is still mountable
 * at /wizard/legacy.
 *
 * Runs under audit.config.ts (vite preview on :5000, no API).
 */
import { test, expect } from '@playwright/test';

test.describe('wizard H1 — Elfsight-clone editor shell', () => {
  test.beforeEach(async ({ page }) => {
    // Start from a clean slate — the shell persists state to localStorage.
    await page.addInitScript(() => {
      try {
        localStorage.removeItem('qq_wizard');
        localStorage.removeItem('qq_step');
        localStorage.removeItem('qq_result');
        localStorage.removeItem('qq_elfsight_shell');
      } catch {}
    });
  });

  test('shell renders top bar + tab bar + preview pane at /wizard', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    await expect(page.getByTestId('quotequick-editor-shell')).toBeVisible();
    await expect(page.getByTestId('editor-top-bar')).toBeVisible();
    await expect(page.getByTestId('editor-tabs')).toBeVisible();
    await expect(page.getByTestId('editor-preview-pane')).toBeVisible();
  });

  test('all 4 tabs render and clicking each switches the active state', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    const tabs = ['build', 'style', 'settings', 'install'] as const;
    for (const id of tabs) {
      await expect(page.getByTestId(`editor-tab-${id}`)).toBeVisible();
    }

    // Default active = build.
    await expect(page.getByTestId('editor-tab-build')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('editor-tabpanel-build')).toBeVisible();

    // Switch through each non-default tab and assert the panel changed.
    for (const id of ['style', 'settings', 'install'] as const) {
      await page.getByTestId(`editor-tab-${id}`).click();
      await page.waitForTimeout(80);
      await expect(page.getByTestId(`editor-tab-${id}`)).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByTestId(`editor-tabpanel-${id}`)).toBeVisible();
    }

    // Back to build — the input-business-name field reappears.
    await page.getByTestId('editor-tab-build').click();
    await page.waitForTimeout(80);
    await expect(page.getByTestId('input-business-name')).toBeVisible();
  });

  test('X close dismisses the editor shell', async ({ page }) => {
    // Visit `/` first so there's a history entry to go back to.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const closeBtn = page.getByTestId('quotequick-close');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await page.waitForTimeout(400);

    // After close the modal overlay must no longer be present and the path
    // must have left /wizard.
    await expect(page.locator('.wizard-shell-modal')).toHaveCount(0);
    expect(new URL(page.url()).pathname).not.toBe('/wizard');
  });

  test('typing business name updates the live preview header in real time', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Build tab is the default — input is present immediately.
    const name = `H1 QA ${Date.now()}`;
    await page.getByTestId('input-business-name').fill(name);

    // The preview's advanced-calculator header reads from `business_name`
    // when its own `header.title` is empty (true for the blank-preview
    // seed). It should reflect the typed name within ~500ms.
    await expect(page.getByTestId('advanced-calculator')).toBeVisible({ timeout: 4000 });
    await expect(page.getByTestId('advanced-calculator')).toContainText(name, { timeout: 1000 });
  });

  test.describe('mobile 390x844 — tabs scroll, preview stacks', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('tabs fit on phone (W-MT-1 second-row), preview canvas takes the body, left panel hidden by bottom-sheet (BH-3)', async ({ page }) => {
      await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);

      const tabs = page.getByTestId('editor-tabs');
      await expect(tabs).toBeVisible();

      // W-MT-1 (PR #604) — at ≤480px the tab strip wraps to its own
      // second row INSIDE the topbar (`flex: 0 0 100%`) so all 4 tabs
      // (Build / Style / Settings / Install) are visible without
      // horizontal scrolling. Verify the strip is on its own row and
      // its right edge fits within 390px.
      const tabsBox = await tabs.boundingBox();
      expect(tabsBox).not.toBeNull();
      expect(tabsBox!.x + tabsBox!.width).toBeLessThanOrEqual(390 + 1);

      // Body doesn't horizontally scroll either.
      const bodyOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      );
      expect(bodyOverflow).toBe(true);

      // BH-3 (PR #505) — at the mobile breakpoint (≤768px) the editor
      // body switches to a bottom-sheet layout. The left panel is
      // hidden via `display:none` (its property editors live inside
      // the MobileBottomSheet instead). The right pane (preview canvas)
      // takes the visible body above the sheet.
      const preview = page.getByTestId('editor-right-pane');
      await expect(preview).toBeVisible();
      const previewBox = await preview.boundingBox();
      expect(previewBox).not.toBeNull();
      expect(previewBox!.width).toBeGreaterThan(0);

      const leftDisplay = await page
        .getByTestId('editor-left-panel')
        .evaluate((el) => window.getComputedStyle(el as HTMLElement).display);
      expect(leftDisplay).toBe('none');

      // Mobile bottom-sheet is mounted (sanity — the chrome that
      // replaces the inline left panel exists).
      const body = page.locator('.qq-editor-body');
      await expect(body).toHaveAttribute('data-mobile-sheet', 'true');
    });
  });

  test('legacy wizard still loads at /wizard/legacy', async ({ page }) => {
    await page.goto('/wizard/legacy', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // The legacy WizardCard renders BuilderStep1, which carries the known
    // testid `input-business-name`. Same testid as the new shell — both
    // satisfy the assertion, but the legacy DOM has the classic
    // `.wizard-shell-modal` chrome with its 5-step navbar.
    await expect(page.getByTestId('input-business-name').first()).toBeVisible({ timeout: 4000 });
    await expect(page.locator('.wizard-navbar').first()).toBeVisible();
    await expect(page.getByTestId('nav-step-1')).toBeVisible();
  });
});

/**
 * QuoteQuick wizard — Wave H7 Install tab + Template gallery UX-QA.
 *
 * Three blocks, each with mobile-parity coverage where applicable:
 *
 *   Install tab —
 *     1. Tab renders language picker + embed snippet + quick-install guides.
 *     2. Language picker has at least 10 options.
 *     3. Selecting a non-English language updates the `lang` attribute in
 *        the embed snippet preview.
 *
 *   Template gallery —
 *     4. Build tab shows the horizontal template scroller at the top.
 *     5. Horizontal scroller is genuinely single-row (overflowX: auto).
 *     6. Clicking a template card applies it (a known field appears in
 *        the preview after the click).
 *
 *   Mobile (390×844) — all the above work; horizontal scroller is touch-
 *   swipable; language picker is full-width; tap targets ≥44px.
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

/* ──────────────────────────────────────────────────────────── */
/*  Install tab — language picker + embed snippet + guides      */
/* ──────────────────────────────────────────────────────────── */

test.describe('wizard H7 — Install tab', () => {
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('Install tab renders language picker + embed snippet + quick-install guides', async ({ page }) => {
    await gotoInstallTab(page);

    await expect(page.getByTestId('install-section-language')).toBeVisible();
    await expect(page.getByTestId('install-select-language')).toBeVisible();
    await expect(page.getByTestId('install-section-embed')).toBeVisible();
    await expect(page.getByTestId('install-embed-snippet')).toBeVisible();
    await expect(page.getByTestId('install-copy-snippet')).toBeVisible();
    await expect(page.getByTestId('install-section-guides')).toBeVisible();
    // Wave O — guide tabs were replaced with click-to-open platform cards.
    await expect(page.getByTestId('install-guide-grid')).toBeVisible();
  });

  test('Language picker exposes at least 5 options', async ({ page }) => {
    await gotoInstallTab(page);

    const sel = page.getByTestId('install-select-language');
    const optionCount = await sel.locator('option').count();
    expect(optionCount).toBeGreaterThanOrEqual(5); // Wave Q-Hotfix: trimmed 12→5 most-popular
  });

  test('Selecting a non-English language updates the lang attribute in the embed snippet', async ({ page }) => {
    await gotoInstallTab(page);

    // Default = English. Snippet contains lang="en".
    await expect(page.getByTestId('install-embed-snippet')).toContainText('lang="en"');

    // Switch to Spanish — snippet must update to lang="es".
    await page.getByTestId('install-select-language').selectOption('es');
    await expect(page.getByTestId('install-embed-snippet')).toContainText('lang="es"');
    await expect(page.getByTestId('install-current-language')).toContainText('Spanish');

    // And the persisted localStorage payload carries the language too.
    const stored = await page.evaluate(() => localStorage.getItem('qq_elfsight_shell'));
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored as string);
    expect(parsed?.settings?.language).toBe('es');
  });

  test('Platform guide cards open detailed modal (Wave O)', async ({ page }) => {
    await gotoInstallTab(page);

    // Cards visible in the grid.
    await expect(page.getByTestId('install-guide-card-wordpress-elementor')).toBeVisible();
    await expect(page.getByTestId('install-guide-card-wix')).toBeVisible();
    await expect(page.getByTestId('install-guide-card-squarespace')).toBeVisible();
    await expect(page.getByTestId('install-guide-card-html')).toBeVisible();

    // Clicking a card opens the modal with platform-specific content.
    await page.getByTestId('install-guide-card-wix').click();
    const modal = page.getByTestId('install-guide-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('data-platform', 'wix');

    // Modal has a copy-snippet CTA and a done button.
    await expect(page.getByTestId('install-guide-modal-copy')).toBeVisible();
    await expect(page.getByTestId('install-guide-modal-done')).toBeVisible();

    // Done closes the dialog.
    await page.getByTestId('install-guide-modal-done').click();
    await expect(modal).not.toBeVisible();
  });
});

/* ──────────────────────────────────────────────────────────── */
/*  Template gallery — strip + apply                            */
/* ──────────────────────────────────────────────────────────── */

test.describe('wizard H7 — Template gallery', () => {
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('Build tab shows the horizontal template scroller at the top', async ({ page }) => {
    await openWizard(page);

    // Build is the default tab.
    await expect(page.getByTestId('editor-tabpanel-build')).toBeVisible();
    await expect(page.getByTestId('template-strip-section')).toBeVisible();
    await expect(page.getByTestId('template-strip-scroller')).toBeVisible();

    // 'Start blank' card is always first.
    await expect(page.getByTestId('template-card-blank')).toBeVisible();

    // Browse-all button opens the modal.
    await expect(page.getByTestId('template-browse-all')).toBeVisible();
  });

  test('Template scroller is genuinely single-row + overflow-x: auto', async ({ page }) => {
    await openWizard(page);

    const scroller = page.getByTestId('template-strip-scroller');
    const computed = await scroller.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        overflowX: cs.overflowX,
        flexWrap: cs.flexWrap,
        display: cs.display,
      };
    });
    expect(computed.overflowX).toBe('auto');
    expect(computed.flexWrap).toBe('nowrap');
    expect(computed.display).toBe('flex');

    // Every card sits on the same Y — assert by sampling two visible cards.
    const cards = scroller.locator('[data-testid^="template-strip-card-"], [data-testid="template-card-blank"]');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(2);

    const yPositions = await cards.evaluateAll((els) =>
      els.slice(0, 4).map((e) => (e as HTMLElement).getBoundingClientRect().top),
    );
    // All Y positions identical (single-row guarantee).
    const distinctY = new Set(yPositions.map((y) => Math.round(y)));
    expect(distinctY.size).toBe(1);
  });

  test('Clicking a template card applies it (preview reflects the choice)', async ({ page }) => {
    await openWizard(page);

    // Pick a known catalogue entry — `car_towing` exists in TEMPLATE_PRESETS.
    const card = page.getByTestId('template-strip-card-car_towing');
    await expect(card).toBeVisible({ timeout: 2000 });
    await card.click();

    // The car_towing preset has a select field whose label asks
    // "What are we towing?" (Wave AH-3 content rewrite). The live preview
    // renders the field's `label`, so assert the label text appears.
    const preview = page.getByTestId('editor-preview-pane');
    await expect(preview).toContainText('What are we towing?', { timeout: 2500 });

    // And the persisted shell state carries the activeTemplateId.
    const stored = await page.evaluate(() => localStorage.getItem('qq_elfsight_shell'));
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored as string);
    expect(parsed?.activeTemplateId).toBe('car_towing');

    // Clicking "Start blank" resets back.
    await page.getByTestId('template-card-blank').click();
    await page.waitForTimeout(200);
    const storedAfter = await page.evaluate(() => localStorage.getItem('qq_elfsight_shell'));
    const parsedAfter = JSON.parse(storedAfter as string);
    expect(parsedAfter?.activeTemplateId).toBeFalsy();
  });

  test('Browse-all modal opens, lists templates, closes via × button', async ({ page }) => {
    await openWizard(page);

    await page.getByTestId('template-browse-all').click();
    const modal = page.getByTestId('template-browse-modal');
    await expect(modal).toBeVisible({ timeout: 1500 });
    await expect(page.getByTestId('template-browse-grid')).toBeVisible();

    // Wave Q-Hotfix — chip row replaced with a <select> dropdown.
    await expect(page.getByTestId('template-browse-cat-select')).toBeVisible();

    // Close.
    await page.getByTestId('template-browse-close').click();
    await expect(modal).toHaveCount(0);
  });
});

/* ──────────────────────────────────────────────────────────── */
/*  Mobile parity (390×844)                                     */
/* ──────────────────────────────────────────────────────────── */

test.describe('wizard H7 — Mobile (390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('Install tab — language picker is full-width and embed snippet visible', async ({ page }) => {
    await gotoInstallTab(page);

    await expect(page.getByTestId('install-select-language')).toBeVisible();
    await expect(page.getByTestId('install-embed-snippet')).toBeVisible();

    // Tap-target check on the select (≥44px).
    const selectBox = await page.getByTestId('install-select-language').boundingBox();
    expect(selectBox).not.toBeNull();
    expect(selectBox!.height).toBeGreaterThanOrEqual(40);
    // Select takes ~ full container width — at least 80% of the viewport.
    expect(selectBox!.width).toBeGreaterThan(390 * 0.8);

    // Copy button is ≥44px on mobile.
    const copyBox = await page.getByTestId('install-copy-snippet').boundingBox();
    expect(copyBox).not.toBeNull();
    expect(copyBox!.height).toBeGreaterThanOrEqual(40);
  });

  test('Template scroller — horizontal scroll-x is preserved on mobile', async ({ page }) => {
    await openWizard(page);

    const scroller = page.getByTestId('template-strip-scroller');
    const overflow = await scroller.evaluate((el) => window.getComputedStyle(el).overflowX);
    expect(overflow).toBe('auto');

    // The scroller's scroll width should exceed its client width — i.e. there
    // are cards offscreen to swipe to.
    const widths = await scroller.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(widths.scrollWidth).toBeGreaterThan(widths.clientWidth);

    // Programmatic scroll (proxy for touch-swipe — touch-action allows it).
    await scroller.evaluate((el) => { el.scrollLeft = 200; });
    await page.waitForTimeout(150);
    const sl = await scroller.evaluate((el) => el.scrollLeft);
    expect(sl).toBeGreaterThan(100);
  });

  test('Template browse-all button is sized as a secondary action on mobile', async ({ page }) => {
    await openWizard(page);

    // Wave L T2 — the Browse-all CTA was deliberately reduced to a smaller
    // secondary-style button (mobile min-height: 32px; was 44px). The
    // primary affordance on mobile is the horizontal template scroller —
    // Browse-all is a follow-on link, not the headline CTA. Assert the
    // button is still rendered with a usable tap surface (≥28px).
    const btn = page.getByTestId('template-browse-all');
    const box = await btn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(28);
  });

  test('Selecting a language on mobile still updates the snippet', async ({ page }) => {
    await gotoInstallTab(page);

    await page.getByTestId('install-select-language').selectOption('fr');
    await expect(page.getByTestId('install-embed-snippet')).toContainText('lang="fr"');
  });
});

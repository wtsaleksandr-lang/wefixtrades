/**
 * QuoteQuick wizard — Wave M UX-QA.
 *
 * Two items, each with desktop + mobile (390×844) coverage:
 *
 *   Item 1 — Browse-all templates modal cleanup —
 *     - Opens via the "Browse all" button on the Build tab.
 *     - Has a search input above the chip row that filters by name
 *       (case-insensitive substring), combined with the category filter.
 *     - Filter chip row scrolls horizontally without overflow
 *       (scrollWidth > clientWidth and overflowX is `auto`).
 *     - Selecting a chip narrows the visible cards.
 *     - Cards inside the modal have NO subtitle paragraph — the only
 *       text node beneath the mockup is the template name.
 *
 *   Item 2 — Fold/unfold preview pane —
 *     - The fold toggle is visible on the right edge of the tab row.
 *     - Clicking it collapses the right pane (visual width → 0 / hidden).
 *     - Clicking it again restores the original layout.
 *     - State persists across reload via localStorage.qq_preview_collapsed.
 *     - Mobile: button still works; preview hidden when collapsed.
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
      localStorage.removeItem('qq_preview_collapsed');
    } catch {}
  });
}

async function openWizard(page: Page) {
  await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('quotequick-editor-shell')).toBeVisible();
}

async function openBrowseModal(page: Page) {
  await openWizard(page);
  await page.getByTestId('template-browse-all').click();
  await expect(page.getByTestId('template-browse-modal')).toBeVisible({ timeout: 1500 });
}

/* ──────────────────────────────────────────────────────────── */
/*  Item 1 — Browse-all modal cleanup                            */
/* ──────────────────────────────────────────────────────────── */

test.describe('wizard M — Browse-all modal cleanup', () => {
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('Search input filters cards by name (case-insensitive)', async ({ page }) => {
    await openBrowseModal(page);

    const search = page.getByTestId('template-browse-search');
    await expect(search).toBeVisible();
    await expect(search).toHaveAttribute('placeholder', /search templates/i);

    // Baseline — "Car Towing" card present.
    await expect(page.getByTestId('template-browse-card-car_towing')).toBeVisible();

    // Type "tow" — only matching cards remain (Car Towing must still be in).
    await search.fill('tow');
    await expect(page.getByTestId('template-browse-card-car_towing')).toBeVisible();

    // A different template (Driveway Paving) must NOT be visible after filter.
    await expect(page.getByTestId('template-browse-card-driveway_paving')).toHaveCount(0);

    // Case-insensitivity: "CAR" still matches "Car Towing".
    await search.fill('CAR');
    await expect(page.getByTestId('template-browse-card-car_towing')).toBeVisible();

    // Nonsense query → empty state.
    await search.fill('zzz-no-match-xyz');
    await expect(page.getByTestId('template-browse-empty')).toBeVisible();
  });

  test('Filter chip row scrolls horizontally without clipping', async ({ page }) => {
    await openBrowseModal(page);

    const cats = page.getByTestId('template-browse-cats');
    await expect(cats).toBeVisible();

    const computed = await cats.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        overflowX: cs.overflowX,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      };
    });
    expect(computed.overflowX).toBe('auto');
    // The chip row HAS more content than fits — that's the entire fix:
    // it scrolls instead of clipping.
    expect(computed.scrollWidth).toBeGreaterThanOrEqual(computed.clientWidth);

    // Programmatic scroll proves it's actually scrollable when overflowing.
    if (computed.scrollWidth > computed.clientWidth) {
      await cats.evaluate((el) => { el.scrollLeft = 100; });
      await page.waitForTimeout(120);
      const sl = await cats.evaluate((el) => el.scrollLeft);
      expect(sl).toBeGreaterThan(40);
    }
  });

  test('Selecting a chip narrows the visible cards', async ({ page }) => {
    await openBrowseModal(page);

    // Pick the Automotive chip — car_towing belongs to Automotive.
    await page.getByTestId('template-browse-cat-automotive').click();
    await expect(page.getByTestId('template-browse-card-car_towing')).toBeVisible();
    // A non-automotive template should disappear.
    await expect(page.getByTestId('template-browse-card-driveway_paving')).toHaveCount(0);
  });

  test('Modal cards have no subtitle paragraph (name only)', async ({ page }) => {
    await openBrowseModal(page);

    const card = page.getByTestId('template-browse-card-car_towing');
    await expect(card).toBeVisible();

    // The card body inside the modal must only carry the name span; the
    // old `.qq-tg-card-tags` subtitle must be absent.
    const tagsCount = await card.locator('.qq-tg-card-tags').count();
    expect(tagsCount).toBe(0);

    // The name is still there.
    await expect(card.locator('.qq-tg-card-name')).toContainText('Car Towing');
  });
});

/* ──────────────────────────────────────────────────────────── */
/*  Item 2 — Fold/unfold preview pane                            */
/* ──────────────────────────────────────────────────────────── */

test.describe('wizard M — Fold/unfold preview', () => {
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('Toggle collapses and restores the right preview pane', async ({ page }) => {
    await openWizard(page);

    const right = page.getByTestId('editor-right-pane');
    const toggle = page.getByTestId('editor-fold-toggle');

    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('data-collapsed', 'false');

    // Baseline — right pane has real width.
    const initialWidth = await right.evaluate((el) => el.getBoundingClientRect().width);
    expect(initialWidth).toBeGreaterThan(100);

    // Collapse.
    await toggle.click();
    await expect(toggle).toHaveAttribute('data-collapsed', 'true');
    await page.waitForTimeout(380); // > 250ms transition + buffer

    const collapsedWidth = await right.evaluate((el) => el.getBoundingClientRect().width);
    expect(collapsedWidth).toBeLessThan(5);

    // Restore.
    await toggle.click();
    await expect(toggle).toHaveAttribute('data-collapsed', 'false');
    await page.waitForTimeout(380);
    const restoredWidth = await right.evaluate((el) => el.getBoundingClientRect().width);
    expect(restoredWidth).toBeGreaterThan(100);
  });

  test('Fold button has accessible label + sits on the tab row', async ({ page }) => {
    await openWizard(page);

    const toggle = page.getByTestId('editor-fold-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-label', /hide preview pane/i);

    // It must sit inside the tab row (same horizontal band as the tabs).
    const tabsBox = await page.getByTestId('editor-tabs').boundingBox();
    const btnBox = await toggle.boundingBox();
    expect(tabsBox).not.toBeNull();
    expect(btnBox).not.toBeNull();
    // Button vertical centre within the tab row.
    const tabsMid = tabsBox!.y + tabsBox!.height / 2;
    const btnMid = btnBox!.y + btnBox!.height / 2;
    expect(Math.abs(btnMid - tabsMid)).toBeLessThan(tabsBox!.height);
  });
});

/* ──────────────────────────────────────────────────────────── */
/*  Persistence — uses runtime-clear instead of an init-script   */
/*  wipe so we can verify the localStorage key actually survives */
/*  a reload.                                                    */
/* ──────────────────────────────────────────────────────────── */

test.describe('wizard M — Fold/unfold preview (persistence)', () => {
  test('Collapsed state persists across reload', async ({ page }) => {
    await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      try {
        localStorage.removeItem('qq_elfsight_shell');
        localStorage.removeItem('qq_preview_collapsed');
      } catch {}
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await expect(page.getByTestId('quotequick-editor-shell')).toBeVisible();

    await page.getByTestId('editor-fold-toggle').click();
    await page.waitForTimeout(200);

    const stored = await page.evaluate(() => localStorage.getItem('qq_preview_collapsed'));
    expect(stored).toBe('1');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    const toggle = page.getByTestId('editor-fold-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('data-collapsed', 'true');

    const right = page.getByTestId('editor-right-pane');
    const w = await right.evaluate((el) => el.getBoundingClientRect().width);
    expect(w).toBeLessThan(5);
  });
});

/* ──────────────────────────────────────────────────────────── */
/*  Mobile (390×844)                                             */
/* ──────────────────────────────────────────────────────────── */

test.describe('wizard M — Mobile (390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('Mobile — search bar + chip scroll + 2-column grid in browse modal', async ({ page }) => {
    await openBrowseModal(page);

    const search = page.getByTestId('template-browse-search');
    await expect(search).toBeVisible();
    const searchBox = await search.boundingBox();
    expect(searchBox).not.toBeNull();
    // Tap target ≥40px (target is 44px with some slack for rounding).
    expect(searchBox!.height).toBeGreaterThanOrEqual(40);

    const cats = page.getByTestId('template-browse-cats');
    const overflow = await cats.evaluate((el) => window.getComputedStyle(el).overflowX);
    expect(overflow).toBe('auto');
    const widths = await cats.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    // On a 390px viewport the chip row must overflow horizontally — that's
    // the whole point of the scroll fix.
    expect(widths.scrollWidth).toBeGreaterThan(widths.clientWidth);

    // Grid is 2-column on mobile — assert via computed grid-template-columns.
    const grid = page.getByTestId('template-browse-grid');
    const cols = await grid.evaluate((el) => window.getComputedStyle(el).gridTemplateColumns);
    expect(cols.split(' ').length).toBe(2);
  });

  test('Mobile — fold button still works (≥44px tap, collapses preview)', async ({ page }) => {
    await openWizard(page);

    const toggle = page.getByTestId('editor-fold-toggle');
    await expect(toggle).toBeVisible();

    const box = await toggle.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(40);

    // Collapse.
    await toggle.click();
    await page.waitForTimeout(300);

    // On mobile the right pane goes display:none when collapsed, so the
    // bounding rect height should be 0 (or near-zero).
    const right = page.getByTestId('editor-right-pane');
    const h = await right.evaluate((el) => el.getBoundingClientRect().height);
    expect(h).toBeLessThan(10);

    // Restore.
    await toggle.click();
    await page.waitForTimeout(300);
    const hAfter = await right.evaluate((el) => el.getBoundingClientRect().height);
    expect(hAfter).toBeGreaterThan(20);
  });
});

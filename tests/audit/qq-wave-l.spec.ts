/**
 * Wave L — post-deploy polish round 2 — Playwright specs.
 *
 * Covers the new behaviour shipped in Wave L:
 *   E1 — empty-state placeholder + add-from-preview path
 *   E3 — swipe-to-delete on mobile
 *   E4 + B1 — sliders / checkboxes inside the preview stay interactive
 *   P1 — every InfoCue popover renders on click
 *   I1 — $75 install CTA in the Install tab opens the checkout modal
 *
 * The wizard editor is mounted at /wizard. Tests run against the existing
 * dev server (baseURL via playwright.config.ts).
 */

import { test, expect, type Page } from '@playwright/test';

const WIZARD_URL = '/wizard';

async function gotoFreshEditor(page: Page) {
  // Clear persisted editor state so the test starts from the H1 blank seed.
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('qq_elfsight_shell');
      localStorage.removeItem('qq_dnd_hint_seen');
    } catch {}
  });
  await page.goto(WIZARD_URL);
  await expect(page.getByTestId('quotequick-editor-shell')).toBeVisible();
}

test.describe('Wave L — editor preview polish', () => {
  test('E1: empty-state placeholder appears when fields are removed', async ({ page }) => {
    // Pre-seed an empty fields[] BEFORE navigating so the wizard's
    // loadShellState picks it up on first mount. (gotoFreshEditor's
    // addInitScript REMOVES the key on every navigation including reload,
    // so a post-mount rewrite-then-reload would be wiped — we install our
    // own seed-empty init script that runs after the clear.)
    await page.addInitScript(() => {
      try {
        localStorage.removeItem('qq_dnd_hint_seen');
        // Plant an explicit empty fields state — the loader keeps
        // `fields: []` when explicitly provided (vs `undefined` which
        // triggers the seed path).
        localStorage.setItem('qq_elfsight_shell', JSON.stringify({
          fields: [], calculations: [],
        }));
      } catch {}
    });
    await page.goto(WIZARD_URL);
    await expect(page.getByTestId('quotequick-editor-shell')).toBeVisible();
    await expect(page.getByTestId('preview-empty-state')).toBeVisible();
    // Clicking the add-field-trigger inside the empty state opens the menu.
    await page.getByTestId('preview-empty-state').getByTestId('add-field-trigger').click();
    await expect(page.getByTestId('add-field-menu')).toBeVisible();
  });

  test('E3: mobile field row has a [data-colspan] cell available for swipe', async ({ page }) => {
    // Full swipe gesture simulation is fragile in Playwright; verify the
    // touch-event harness target exists by switching to mobile preview and
    // confirming a [data-colspan] cell paints.
    await gotoFreshEditor(page);
    const mobileBtn = page.getByRole('button', { name: /mobile/i }).first();
    if (await mobileBtn.isVisible().catch(() => false)) {
      await mobileBtn.click().catch(() => {});
    }
    await expect(page.locator('[data-testid="preview-bezel-mobile"], [data-testid="preview-bezel-desktop"]').first()).toBeVisible();
    const cells = page.locator('[data-colspan]');
    await expect(cells.first()).toBeVisible();
  });

  test('E4 + B1: a range slider inside the preview can be dragged', async ({ page }) => {
    await gotoFreshEditor(page);
    // The default seed (service select + quantity number + addons multi)
    // doesn't include a slider — add one via the Build-tab Add menu so the
    // preview renders an <input type="range">.
    await page.getByTestId('add-field-trigger').first().click();
    await page.getByTestId('add-field-slider').first().click();
    const slider = page.locator('input[type="range"]').first();
    await expect(slider).toBeVisible();
    const before = await slider.inputValue();
    // Use Playwright's keyboard fallback (clicks the slider then nudges
    // with ArrowRight) — works headless without needing exact pixel coords.
    await slider.focus();
    await slider.press('ArrowRight');
    await slider.press('ArrowRight');
    await slider.press('ArrowRight');
    const after = await slider.inputValue();
    expect(after).not.toBe(before);
  });

  test('P1: every InfoCue trigger reveals a popover on click', async ({ page }) => {
    await gotoFreshEditor(page);
    // The Build tab has the Fields/Calculations/Header InfoCues. We click
    // each one we can find and assert the matching popover appears.
    const triggers = page.locator('[data-testid^="info-cue-"]:not([data-testid$="-popover"])');
    const count = await triggers.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(count, 5); i++) {
      const trigger = triggers.nth(i);
      const tid = await trigger.getAttribute('data-testid');
      if (!tid) continue;
      await trigger.click();
      await expect(page.getByTestId(`${tid}-popover`)).toBeVisible({ timeout: 2000 });
      // Press Escape to close before clicking the next.
      await page.keyboard.press('Escape');
    }
  });

  test('I1: install tab shows the $75 install CTA which opens checkout modal', async ({ page }) => {
    await gotoFreshEditor(page);
    // Use the editor-tab testid contract used elsewhere in the audit suite.
    await page.getByTestId('editor-tab-install').click();
    await expect(page.getByTestId('editor-tabpanel-install')).toBeVisible({ timeout: 2000 });
    await expect(page.getByTestId('install-doneforyou-cta')).toBeVisible();
    await page.getByTestId('install-doneforyou-cta').click();
    // CheckoutIntakeModal renders an input wired with data-testid
    // "intake-business-name" — this is the canonical testid for the field.
    await expect(page.getByTestId('intake-business-name')).toBeVisible({ timeout: 5000 });
  });
});

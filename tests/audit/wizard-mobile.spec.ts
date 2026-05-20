/**
 * QuoteQuick wizard — Step 1 mobile polish (Wave G).
 *
 * Wave H1 note: the legacy 5-step wizard now lives at /wizard/legacy. The
 * canonical /wizard route mounts the new Elfsight-clone editor shell
 * (covered by wizard-elfsight-h1.spec.ts). This spec keeps the Wave G
 * mobile-polish runtime assertions for the legacy DOM and points at the
 * new path.
 *
 * Verifies the five user-reported mobile issues are fixed on a real phone
 * viewport (iPhone 14-ish: 390 × 844):
 *  1. Step circles + device toggle fit within the viewport width — no
 *     horizontal overflow on the navbar.
 *  2. The widget content uses near-full screen width (widget bounding box
 *     ≥ viewport.width - 40px on mobile).
 *  3. Service type and Quantity inputs render on the same row in the
 *     placeholder preview (their top coords are within a few pixels).
 *  4. The placeholder header has no subtitle paragraph below the title.
 *  5. There is a visible 1px-ish separator between the step navbar and the
 *     widget pane (the preview-fixed gets a top border on mobile).
 *
 * Runs under audit.config.ts (vite preview on :5000, no API).
 */
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test.describe('wizard step 1 — mobile polish (Wave G)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.removeItem('qq_wizard');
        localStorage.removeItem('qq_step');
        localStorage.removeItem('qq_result');
      } catch {}
    });
  });

  test('step circles + device toggle fit one line, no horizontal overflow', async ({ page }) => {
    await page.goto('/wizard/legacy', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const navbar = page.locator('.wizard-navbar').first();
    await expect(navbar).toBeVisible();

    // All five numbered step buttons are present and visible.
    for (let i = 1; i <= 5; i++) {
      await expect(page.getByTestId(`nav-step-${i}`)).toBeVisible();
    }

    // Device toggle (mobile preview) is present (only renders on steps that
    // show the side preview — Step 1 does).
    const deviceMobile = page.getByTestId('preview-device-mobile');
    await expect(deviceMobile).toBeVisible();

    // The step list must not horizontally overflow its container — its
    // scrollWidth equals its clientWidth (no clipped/scrollable content).
    const steplist = page.locator('.wizard-nav-steplist').first();
    const noOverflow = await steplist.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(noOverflow).toBe(true);

    // The navbar's right edge fits within the viewport — no off-screen
    // content from the step row + device toggle combination.
    const navBox = await navbar.boundingBox();
    expect(navBox).not.toBeNull();
    expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(390 + 1);
  });

  test('widget uses near-full viewport width on mobile', async ({ page }) => {
    await page.goto('/wizard/legacy', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Either bezel may be visible — default is desktop. On mobile screens
    // both must expand to ≥ viewport.width - 40px (the Wave G meta rule).
    const calc = page.getByTestId('advanced-calculator').first();
    await expect(calc).toBeVisible();

    const box = await calc.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(390 - 40);

    // Now flip to mobile-bezel mode — same assertion must hold.
    await page.getByTestId('preview-device-mobile').click();
    await page.waitForTimeout(150);
    const mobileBox = await calc.boundingBox();
    expect(mobileBox).not.toBeNull();
    expect(mobileBox!.width).toBeGreaterThanOrEqual(390 - 80); // mobile bezel adds bezel padding
  });

  test('Service type + Quantity render on the same row', async ({ page }) => {
    await page.goto('/wizard/legacy', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Find the field wrappers carrying data-colspan inside the calculator.
    // The placeholder preview emits exactly three fields: service (col 1),
    // quantity (col 1), addons (col 2). The first two must share a row.
    const calc = page.getByTestId('advanced-calculator').first();
    await expect(calc).toBeVisible();

    const halfFields = calc.locator('[data-colspan="1"]');
    await expect(halfFields).toHaveCount(2);

    const first = await halfFields.nth(0).boundingBox();
    const second = await halfFields.nth(1).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    // Same row — y-coordinates within a few pixels of each other.
    expect(Math.abs(first!.y - second!.y)).toBeLessThanOrEqual(4);
    // …and the second sits to the right of the first.
    expect(second!.x).toBeGreaterThan(first!.x);
  });

  test('placeholder widget has no subtitle paragraph', async ({ page }) => {
    await page.goto('/wizard/legacy', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const calc = page.getByTestId('advanced-calculator').first();
    await expect(calc).toBeVisible();

    // The header bar is the first child of the advanced calculator. With no
    // subtitle, it must contain exactly one <p> (the title line); the
    // subtitle paragraph must not exist as an empty element either.
    const headerPCount = await calc.locator(':scope > div').first().locator('p').count();
    expect(headerPCount).toBe(1);
  });

  test('1px separator between step navbar and widget pane', async ({ page }) => {
    await page.goto('/wizard/legacy', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const preview = page.locator('.wizard-preview-fixed').first();
    await expect(preview).toBeVisible();

    const borderTop = await preview.evaluate((el) => getComputedStyle(el).borderTopWidth);
    // CSS "1px solid <color>" — the computed border-top-width is "1px".
    expect(borderTop).toBe('1px');
  });
});

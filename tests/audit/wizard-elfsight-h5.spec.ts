/**
 * QuoteQuick wizard — Wave H5 Style tab UX-QA.
 *
 * Asserts the Style tab renders the four control groups (Colours / Typography
 * / Shape / Layout) and that each control class updates the preview live:
 *
 *  1. Style tab renders the 4 control groups.
 *  2. Changing the accent colour updates a visible element in the preview
 *     (CTA button background) within ~500ms.
 *  3. Changing the field style segmented control changes the preview's
 *     input rendering (filled vs outline — detectable via the renderer's
 *     `data-field-style` data attribute).
 *  4. Changing border radius updates the preview's card / input radius.
 *  5. Changing widget width changes the preview's outer container width
 *     (via the renderer's `data-widget-width` attribute + max-width style).
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
    } catch {}
  });
}

/** Open the wizard and switch to the Style tab. */
async function gotoStyleTab(page: Page) {
  await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.getByTestId('editor-tab-style').click();
  await expect(page.getByTestId('editor-tabpanel-style')).toBeVisible({ timeout: 2000 });
}

/**
 * Convert an `rgb(r, g, b)` string from getComputedStyle to a #rrggbb hex
 * (lowercase). Returns the input unchanged if it doesn't match the rgb
 * shape (e.g. transparent / rgba — caller handles).
 */
function rgbToHex(rgb: string): string {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return rgb;
  const toHex = (n: string) => Number(n).toString(16).padStart(2, '0');
  return ('#' + toHex(m[1]) + toHex(m[2]) + toHex(m[3])).toLowerCase();
}

test.describe('wizard H5 — Style tab', () => {
  test.beforeEach(async ({ page }) => {
    await clearShellState(page);
  });

  test('Style tab renders the 4 control groups', async ({ page }) => {
    await gotoStyleTab(page);

    await expect(page.getByTestId('style-group-colours')).toBeVisible();
    await expect(page.getByTestId('style-group-typography')).toBeVisible();
    await expect(page.getByTestId('style-group-shape')).toBeVisible();
    await expect(page.getByTestId('style-group-layout')).toBeVisible();
  });

  test('Accent colour change updates the CTA button background', async ({ page }) => {
    await gotoStyleTab(page);

    // Preview is live — the CTA button exists by default.
    const cta = page.getByTestId('advanced-cta');
    await expect(cta).toBeVisible({ timeout: 3000 });

    // Baseline: read whatever colour the brand default produces (#0d3cfc).
    const before = rgbToHex(await cta.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor,
    ));
    expect(before).toBe('#0d3cfc');

    // A high-contrast, unambiguous test colour.
    const target = '#ff5500';
    // The hex text input — driving the same `style.accent` state as the
    // swatch — is the most stable way to set a known value in the test.
    const hex = page.getByTestId('style-input-accent');
    await hex.fill(target);
    // Move focus so any blur-driven commit fires (none here, but defensive).
    await hex.press('Tab');

    // The CTA background should reflect the new accent within ~500ms.
    await expect.poll(
      async () => rgbToHex(await cta.evaluate(
        (el) => window.getComputedStyle(el).backgroundColor,
      )),
      { timeout: 1500, intervals: [100, 200, 300] },
    ).toBe(target);
  });

  test('Field style segmented control toggles filled / outline', async ({ page }) => {
    await gotoStyleTab(page);

    const calc = page.getByTestId('advanced-calculator');
    await expect(calc).toBeVisible({ timeout: 3000 });

    // Baseline = filled (the brand default).
    await expect(calc).toHaveAttribute('data-field-style', 'filled');

    await page.getByTestId('style-segmented-fieldstyle-outline').click();
    await expect(calc).toHaveAttribute('data-field-style', 'outline', { timeout: 1500 });

    // Switch back too — both directions should be reactive.
    await page.getByTestId('style-segmented-fieldstyle-filled').click();
    await expect(calc).toHaveAttribute('data-field-style', 'filled', { timeout: 1500 });
  });

  test('Border radius slider updates the preview card radius', async ({ page }) => {
    await gotoStyleTab(page);

    const calc = page.getByTestId('advanced-calculator');
    await expect(calc).toBeVisible({ timeout: 3000 });

    // Baseline = 12px (brand default).
    await expect(calc).toHaveAttribute('data-style-radius', '12');

    // Drive the range input. React's synthetic event system only sees a
    // value change when it's set via the native HTMLInputElement value
    // setter — so use the well-known React DevTools trick to wire it.
    const radius = page.getByTestId('style-input-radius');
    await radius.evaluate((el) => {
      const input = el as HTMLInputElement;
      const proto = Object.getPrototypeOf(input);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter?.call(input, '24');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await expect(calc).toHaveAttribute('data-style-radius', '24', { timeout: 1500 });
    // And the renderer's inline border-radius reflects the new value.
    const computed = await calc.evaluate((el) => window.getComputedStyle(el).borderRadius);
    expect(parseFloat(computed)).toBe(24);
  });

  test('Font family change to Manrope flows to the preview calculator root', async ({ page }) => {
    await gotoStyleTab(page);

    const calc = page.getByTestId('advanced-calculator');
    await expect(calc).toBeVisible({ timeout: 3000 });

    // Drive the font select to Manrope. The dropdown value is the curated
    // enum key (`manrope`); the renderer maps it to a `"Manrope", ...` stack.
    await page.getByTestId('style-select-font').selectOption('manrope');

    // The calculator root's computed font-family must include Manrope.
    // Manrope is loaded via the index.html Google Fonts link — without
    // that load, the font name is still present in the computed style
    // string (browsers report the declared stack), but the assertion
    // also doubles as a guard against the stack being misconfigured.
    await expect.poll(
      async () => (await calc.evaluate(
        (el) => window.getComputedStyle(el).fontFamily,
      )).toLowerCase(),
      { timeout: 1500, intervals: [100, 200, 300] },
    ).toContain('manrope');
  });

  test('Widget width segmented control changes the preview container width', async ({ page }) => {
    await gotoStyleTab(page);

    const calc = page.getByTestId('advanced-calculator');
    await expect(calc).toBeVisible({ timeout: 3000 });

    // Baseline = wide (the brand default).
    await expect(calc).toHaveAttribute('data-widget-width', 'wide');
    const wideMax = await calc.evaluate((el) => window.getComputedStyle(el).maxWidth);

    // Switch to narrow — the data attribute flips and the inline max-width
    // narrows (520px vs 820px).
    await page.getByTestId('style-segmented-width-narrow').click();
    await expect(calc).toHaveAttribute('data-widget-width', 'narrow', { timeout: 1500 });
    const narrowMax = await calc.evaluate((el) => window.getComputedStyle(el).maxWidth);
    expect(parseFloat(narrowMax)).toBeLessThan(parseFloat(wideMax));

    // Full → no fixed pixel cap (computed reads "none" or "100%").
    await page.getByTestId('style-segmented-width-full').click();
    await expect(calc).toHaveAttribute('data-widget-width', 'full', { timeout: 1500 });
  });
});

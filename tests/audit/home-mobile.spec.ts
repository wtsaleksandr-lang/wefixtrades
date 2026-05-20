/**
 * Home page — mobile hero CTA polish.
 *
 * The two header/hero CTA buttons ("Start free — no card" + "See 2-min demo")
 * must render inline (same row) on a 390 × 844 phone viewport rather than
 * stacking vertically. Also asserts no horizontal overflow on the document
 * at that viewport (so the inline layout doesn't push content off-screen).
 *
 * Runs under audit.config.ts (vite preview on :5000, no API).
 */
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test.describe('home page — hero CTA inline on mobile', () => {
  test('hero CTA buttons sit on the same row at 390px', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Give entrance animation a moment to settle.
    await page.waitForTimeout(800);

    const primary = page.getByTestId('hero-cta-primary');
    const secondary = page.getByTestId('hero-cta-secondary');

    await expect(primary).toBeVisible();
    await expect(secondary).toBeVisible();

    const primaryBox = await primary.boundingBox();
    const secondaryBox = await secondary.boundingBox();
    expect(primaryBox).not.toBeNull();
    expect(secondaryBox).not.toBeNull();

    // Same row — top deltas within ~6px tolerance for sub-pixel rendering.
    const topDelta = Math.abs(primaryBox!.y - secondaryBox!.y);
    expect(topDelta).toBeLessThanOrEqual(6);

    // Generous tap targets — both buttons ≥ 44px tall.
    expect(primaryBox!.height).toBeGreaterThanOrEqual(44);
    expect(secondaryBox!.height).toBeGreaterThanOrEqual(44);

    // Secondary sits to the right of the primary (true row, not overlap).
    expect(secondaryBox!.x).toBeGreaterThan(primaryBox!.x);

    // Capture evidence for the polish PR / cycle log.
    await page.screenshot({
      path: 'audit-evidence/home-hero-mobile-390.png',
      fullPage: false,
    });
  });

  test('document has no horizontal overflow at 390px', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      return {
        docScroll: doc.scrollWidth,
        bodyScroll: body.scrollWidth,
        clientWidth: doc.clientWidth,
      };
    });

    // Allow 1px slack for sub-pixel rounding.
    expect(overflow.docScroll).toBeLessThanOrEqual(overflow.clientWidth + 1);
    expect(overflow.bodyScroll).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });
});

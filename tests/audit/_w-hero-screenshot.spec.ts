/**
 * W-HERO — visual screenshot spec for the warm-canvas hero repaint
 * (Alex variant 04). Captures three frames: desktop above-the-fold,
 * mobile above-the-fold, and the cream→dark transition boundary.
 *
 * Writes to `tests/audit/_screenshots/` for human review. Does not
 * assert beyond confirming the hero renders.
 *
 * Run with:
 *   npx playwright test tests/audit/_w-hero-screenshot.spec.ts \
 *     --config audit.config.ts --reporter=line
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const OUT_DIR = path.join(process.cwd(), 'tests/audit/_screenshots');

test.beforeAll(() => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
});

test.describe('W-HERO — warm-canvas hero screenshots', () => {
  test('desktop 1440x900 — above the fold', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Let the hero entrance stagger + GSAP settle.
    await page.waitForTimeout(1600);
    await expect(page.getByTestId('hero-section')).toBeVisible();
    const filepath = path.join(OUT_DIR, 'w-hero-desktop.png');
    await page.screenshot({ path: filepath, fullPage: false });
    // eslint-disable-next-line no-console
    console.log(`[w-hero] ${filepath}`);
  });

  test('mobile 390x844 — above the fold', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
    await expect(page.getByTestId('hero-section')).toBeVisible();
    const filepath = path.join(OUT_DIR, 'w-hero-mobile.png');
    await page.screenshot({ path: filepath, fullPage: false });
    // eslint-disable-next-line no-console
    console.log(`[w-hero] ${filepath}`);
  });

  test('desktop transition — scroll to hero→next-section boundary', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);

    // Scroll so the bottom of the cream hero + top of the dark section
    // below sit roughly mid-viewport.
    const targetY = await page.evaluate(() => {
      const hero = document.querySelector('[data-testid="hero-section"]') as HTMLElement | null;
      const audit = document.querySelector('[data-testid="hero-audit-section"]') as HTMLElement | null;
      if (!hero) return 0;
      const heroBottom = hero.offsetTop + hero.offsetHeight;
      const auditTop = audit ? audit.offsetTop : heroBottom + 120;
      // Centre the join in the viewport.
      return Math.max(0, Math.round((heroBottom + auditTop) / 2 - 450));
    });
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior }), targetY);
    await page.waitForTimeout(600);

    const filepath = path.join(OUT_DIR, 'w-hero-transition.png');
    await page.screenshot({ path: filepath, fullPage: false });
    // eslint-disable-next-line no-console
    console.log(`[w-hero] ${filepath}`);
  });
});

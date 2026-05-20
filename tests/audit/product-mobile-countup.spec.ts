/**
 * Product page — mobile count-up animation regression (B1, 2026-05-20).
 *
 * Post-deploy QA on 2026-05-20 found that on EVERY product page at mobile
 * viewport (390×844), the section-3 stat tiles never animated — they stayed
 * pinned at the Ticker's initial "0%/<0s/0+" state because the
 * IntersectionObserver `margin: "-40px"` shrink was too aggressive on small
 * viewports. Fix changes the rootMargin to be more permissive
 * (see `client/src/components/effortel-blocks/index.tsx Ticker`).
 *
 * This regression test asserts that, after scrolling each product page's
 * numbered-cards into view on a 390px viewport, at least one stat tile
 * contains a non-zero number — i.e. the Ticker animation has fired.
 *
 * We check a representative subset of product slugs (one per visual pattern)
 * to keep the test fast; the fix is in the shared Ticker component so a
 * sample is sufficient to catch a future regression.
 *
 * Runs under audit.config.ts (vite preview on :5000, no API).
 */
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

const PRODUCT_SLUGS = [
  'tradeline',
  'mapguard',
  'rankflow',
  'contentflow',
];

test.describe('product pages — mobile count-up fires (B1)', () => {
  for (const slug of PRODUCT_SLUGS) {
    test(`stat tiles animate past zero on /products/${slug}`, async ({ page }) => {
      await page.goto(`/products/${slug}`, { waitUntil: 'domcontentloaded' });
      // Wait for any initial entrance animations to settle.
      await page.waitForTimeout(400);

      // Scroll to the numbered-cards block. Each NumberedCard is a top-level
      // descendant under [data-component="numbered-card"]. We scroll the
      // first one into view to trigger the IntersectionObserver chain.
      const firstCard = page.locator('[data-component="numbered-card"]').first();
      await expect(firstCard).toBeVisible();
      await firstCard.scrollIntoViewIfNeeded();

      // The Ticker animation has a default duration of 1.6s. Give it 2.5s to
      // run to completion on the first card, then keep scrolling through the
      // rest of the numbered cards so each one's tickers fire too.
      await page.waitForTimeout(2500);

      const cardCount = await page.locator('[data-component="numbered-card"]').count();
      for (let i = 1; i < cardCount; i++) {
        const card = page.locator('[data-component="numbered-card"]').nth(i);
        await card.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
      }
      // Final settle.
      await page.waitForTimeout(1500);

      // Read every stat tile value on the page. The Ticker is the *value*
      // text inside a StatTile — a chunky number above a small uppercase
      // label. We assert at least one non-zero numeric value appears
      // somewhere in the numbered cards, indicating the count-up fired.
      const valueTexts: string[] = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('[data-component="numbered-card"]'));
        const all: string[] = [];
        for (const card of cards) {
          // StatTile value is a div with fontSize 22-38 + tabular nums; rather
          // than depend on inline styles, walk all spans/divs and grab the
          // ones that look like numeric tickers (start with optional prefix,
          // contain a digit).
          const els = card.querySelectorAll('span, div');
          for (const el of Array.from(els)) {
            const t = (el.textContent || '').trim();
            // Skip elements with child elements (we want only leaf text).
            if (el.children.length === 0 && t.length > 0 && t.length < 24 && /\d/.test(t)) {
              all.push(t);
            }
          }
        }
        return all;
      });

      // Initial Ticker state for any value containing a digit is
      // "<prefix>0<suffix>" — e.g. "0%", "0+", "<0s", "$0", "0/wk", etc.
      // A successfully fired count-up produces a non-zero digit.
      const hasNonZero = valueTexts.some((t) => /[1-9]/.test(t));
      expect(
        hasNonZero,
        `Expected at least one stat tile on /products/${slug} to show a non-zero value after scroll; got: ${JSON.stringify(valueTexts.slice(0, 12))}`,
      ).toBe(true);
    });
  }
});

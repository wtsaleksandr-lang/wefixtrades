/**
 * W-AP-3 — Side-by-side visual audit of our QuoteQuick template gallery vs
 * Elfsight's calculator-widget template gallery.
 *
 * This is a CAPTURE spec, not a pass/fail spec. It produces a set of PNGs
 * under `tests/audit/_screenshots/` that Alex (and a reviewer) can compare
 * to decide whether the W-AP-1 per-category visual differentiation is
 * "loud enough" or whether we still look generic compared to Elfsight.
 *
 * Outputs:
 *   ap3-our-gallery-full.png            full grid, 1440x900
 *   ap3-our-gallery-full-mobile.png     full grid, 390x844
 *   ap3-our-card-<id>.png               per-card desktop crop
 *   ap3-our-card-<id>-mobile.png        per-card mobile crop
 *   ap3-elfsight-gallery-full.png       Elfsight grid (or capture-failure note)
 *   ap3-elfsight-card-<N>.png           first 8-10 Elfsight cards
 *
 * Run with:
 *   npx playwright test tests/audit/wave-ap3-template-gallery.spec.ts \
 *     --config audit.config.ts --reporter=line --project=chromium
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const OUT_DIR = path.join(process.cwd(), 'tests/audit/_screenshots');
const ELFSIGHT_NOTE = path.join(OUT_DIR, 'ap3-elfsight-capture-notes.txt');

test.beforeAll(() => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
});

async function clearShellState(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('qq_wizard');
      localStorage.removeItem('qq_step');
      localStorage.removeItem('qq_result');
      localStorage.removeItem('qq_elfsight_shell');
      localStorage.removeItem('qq_editor_pane_width');
      localStorage.removeItem('qq_editor_preview_collapsed');
    } catch {}
  });
}

async function openWizardAndBrowseAll(page: Page) {
  await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  await expect(page.getByTestId('quotequick-editor-shell')).toBeVisible();
  // BD-2a-sticky — sticky-shell can intercept clicks on browse-all.
  const browseAll = page.getByTestId('template-browse-all');
  await browseAll.scrollIntoViewIfNeeded();
  await browseAll.click({ force: true });
  const modal = page.getByTestId('template-browse-modal');
  await expect(modal).toBeVisible({ timeout: 3000 });
  // Let layout + entrance animations settle.
  await page.waitForTimeout(1500);
  return modal;
}

async function captureOurGallery(page: Page, suffix: '' | '-mobile') {
  const modal = await openWizardAndBrowseAll(page);

  // Full grid screenshot — capture the modal element so we get the whole
  // visible viewport of cards without backdrop bleed.
  const grid = page.getByTestId('template-browse-grid');
  await expect(grid).toBeVisible();
  const fullPath = path.join(OUT_DIR, `ap3-our-gallery-full${suffix}.png`);
  await modal.screenshot({ path: fullPath });
  // eslint-disable-next-line no-console
  console.log(`[ap3] ${fullPath}`);

  // Per-card screenshots — iterate every card and shoot the element.
  const cards = page.locator('[data-testid^="template-browse-card-"]');
  const count = await cards.count();
  // eslint-disable-next-line no-console
  console.log(`[ap3] found ${count} cards (suffix='${suffix}')`);
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const testId = await card.getAttribute('data-testid');
    if (!testId) continue;
    const id = testId.replace('template-browse-card-', '');
    // Scroll into view so the per-element screenshot includes the full card.
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(80);
    const cardPath = path.join(OUT_DIR, `ap3-our-card-${id}${suffix}.png`);
    try {
      await card.screenshot({ path: cardPath });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(`[ap3] card ${id} failed: ${(err as Error).message}`);
    }
  }
}

test.describe('W-AP-3 — our gallery capture', () => {
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('desktop 1440x900 — full grid + per-card', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await captureOurGallery(page, '');
  });

  test('mobile 390x844 — full grid + per-card', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await captureOurGallery(page, '-mobile');
  });
});

/* ---------------------------------------------------------------------- */
/* Elfsight reference capture                                              */
/* ---------------------------------------------------------------------- */

test.describe('W-AP-3 — Elfsight reference capture', () => {
  test('elfsight calculator-widget templates page', async ({ page }) => {
    // No baseURL — go absolute, and use a longer nav budget since elfsight.com
    // sometimes does multi-stage redirects.
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    const notes: string[] = [];
    const CANDIDATE_URLS = [
      'https://elfsight.com/calculator-widget/templates/',
      'https://elfsight.com/calculator-widget/',
    ];

    let loaded = false;
    for (const url of CANDIDATE_URLS) {
      try {
        const resp = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30_000,
        });
        const status = resp?.status() ?? 0;
        notes.push(`GET ${url} → HTTP ${status}`);
        if (status >= 200 && status < 400) {
          loaded = true;
          break;
        }
      } catch (err) {
        notes.push(`GET ${url} → ${(err as Error).message}`);
      }
    }

    if (!loaded) {
      notes.push('Elfsight: could not load any candidate URL. Skipping captures.');
      fs.writeFileSync(ELFSIGHT_NOTE, notes.join('\n'));
      // eslint-disable-next-line no-console
      console.log(`[ap3] Elfsight load failed; notes at ${ELFSIGHT_NOTE}`);
      return;
    }

    // Dismiss cookie banner if any — common Elfsight pattern.
    try {
      await page.waitForTimeout(2000);
      const cookieBtn = page.locator('button:has-text("Accept"), button:has-text("Got it"), button:has-text("Agree")');
      if (await cookieBtn.first().isVisible({ timeout: 1500 }).catch(() => false)) {
        await cookieBtn.first().click().catch(() => {});
        notes.push('Elfsight: dismissed cookie banner');
      }
    } catch {}

    // Wait for template-ish content. Elfsight uses various card containers;
    // try a few generic selectors.
    await page.waitForTimeout(3500);

    // Full-page screenshot of the gallery region (or the whole page if we
    // can't find a discrete gallery container).
    const fullPath = path.join(OUT_DIR, 'ap3-elfsight-gallery-full.png');
    try {
      await page.screenshot({ path: fullPath, fullPage: false });
      notes.push(`Elfsight: full-grid screenshot → ${path.basename(fullPath)}`);
    } catch (err) {
      notes.push(`Elfsight: full-grid screenshot failed → ${(err as Error).message}`);
    }

    // Try to find individual cards. Elfsight's marketing pages typically use
    // anchor tags wrapping img+title under a gallery grid. We probe several
    // candidate selectors and pick the one that returns the most matches.
    const candidateCardSelectors = [
      'a[href*="/calculator-widget/templates/"]',
      'a[class*="Card"]',
      'a[class*="card"]',
      'div[class*="TemplateCard"]',
      'div[class*="template-card"]',
      'article',
      'a:has(img)',
    ];

    let bestSelector = '';
    let bestCount = 0;
    for (const sel of candidateCardSelectors) {
      try {
        const c = await page.locator(sel).count();
        if (c > bestCount) {
          bestCount = c;
          bestSelector = sel;
        }
      } catch {}
    }
    notes.push(`Elfsight: best card selector="${bestSelector}" matches=${bestCount}`);

    if (bestSelector && bestCount > 0) {
      const cards = page.locator(bestSelector);
      const take = Math.min(10, bestCount);
      let saved = 0;
      for (let i = 0; i < take; i++) {
        const card = cards.nth(i);
        try {
          await card.scrollIntoViewIfNeeded({ timeout: 2000 });
          await page.waitForTimeout(120);
          // Skip cards with zero size (hidden / off-screen wrappers).
          const box = await card.boundingBox();
          if (!box || box.width < 60 || box.height < 60) continue;
          const p = path.join(OUT_DIR, `ap3-elfsight-card-${String(i + 1).padStart(2, '0')}.png`);
          await card.screenshot({ path: p });
          saved += 1;
        } catch (err) {
          notes.push(`Elfsight: card[${i}] failed → ${(err as Error).message}`);
        }
      }
      notes.push(`Elfsight: saved ${saved} card screenshots`);
    } else {
      notes.push('Elfsight: no usable card selector found');
    }

    fs.writeFileSync(ELFSIGHT_NOTE, notes.join('\n'));
    // eslint-disable-next-line no-console
    console.log(`[ap3] Elfsight notes:\n${notes.join('\n')}`);
  });
});

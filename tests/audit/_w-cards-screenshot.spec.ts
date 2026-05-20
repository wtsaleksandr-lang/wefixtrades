/**
 * W-CARDS — visual screenshot spec for equal-height template cards.
 *
 * Verifies the Browse-all modal in TemplateGallery now renders every card
 * in a row at the same height (was: 1-line vs 2-line titles produced
 * uneven cards). Writes screenshots to `tests/audit/_screenshots/` for
 * human review; does NOT pass/fail beyond confirming the modal opens.
 *
 * Run with:
 *   npx playwright test tests/audit/_w-cards-screenshot.spec.ts \
 *     --config audit.config.ts --reporter=line
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const OUT_DIR = path.join(process.cwd(), 'tests/audit/_screenshots');

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

async function openWizard(page: Page) {
  await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  await expect(page.getByTestId('quotequick-editor-shell')).toBeVisible();
}

async function openBrowseAllAndShoot(page: Page, name: string) {
  await page.getByTestId('template-browse-all').click();
  const modal = page.getByTestId('template-browse-modal');
  await expect(modal).toBeVisible({ timeout: 2000 });
  // Let the grid layout settle so card heights stabilise.
  await page.waitForTimeout(700);

  // Make sure a card known to have a 2-line title is in view so the
  // screenshot captures a row that exercises the row-equal-height fix.
  // "Wedding Photography" is the canonical 2-line example from the task.
  await page.evaluate(() => {
    const grid = document.querySelector('.qq-tg-modal-grid') as HTMLElement | null;
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll('.qq-tg-card-name')) as HTMLElement[];
    const target = cards.find((el) => /wedding photography/i.test(el.textContent ?? ''));
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    }
  });
  await page.waitForTimeout(300);

  // Capture the modal element itself so the bottom-sheet on mobile and
  // the centered dialog on desktop both render every visible card row.
  const filepath = path.join(OUT_DIR, `${name}.png`);
  await modal.screenshot({ path: filepath });
  // eslint-disable-next-line no-console
  console.log(`[w-cards-screenshot] ${filepath}`);
}

test.describe('W-CARDS — desktop 1440x900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('Browse-all modal — equal-height cards per row', async ({ page }) => {
    await openWizard(page);
    await openBrowseAllAndShoot(page, 'w-cards-modal-desktop');
  });
});

test.describe('W-CARDS — mobile 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('Browse-all modal mobile — equal-height cards per row', async ({ page }) => {
    await openWizard(page);
    await openBrowseAllAndShoot(page, 'w-cards-modal-mobile');
  });
});

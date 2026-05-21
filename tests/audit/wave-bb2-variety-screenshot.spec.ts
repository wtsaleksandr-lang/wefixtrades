/**
 * W-BB-2 — Visual variety verification.
 *
 * Captures 10 templates spanning all 7 derived-style categories so we can
 * confirm the category-driven `deriveStyleFromCategory()` helper produces
 * cards that look distinctly different from one another.
 *
 * Outputs (under `tests/audit/_screenshots/`):
 *   bb2-{templateId}-rendered.png    — preview pane crop
 *   bb2-{templateId}-widget.png      — bare widget crop
 *
 * Run:
 *   npx vite build
 *   npx playwright test tests/audit/wave-bb2-variety-screenshot.spec.ts \
 *     --config audit.bb2.config.ts --reporter=line
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const OUT_DIR = path.join(process.cwd(), 'tests/audit/_screenshots');

const TEMPLATES = [
  { id: 'car_towing',                 category: 'Automotive' },
  { id: 'mobile_car_detail',          category: 'Automotive' },
  { id: 'roof_repair',                category: 'Construction' },
  { id: 'property_cleaning',          category: 'Cleaning' },
  { id: 'gutter_cleaning',            category: 'Cleaning' },
  { id: 'interior_painting',          category: 'Home Improvement' },
  { id: 'locksmith_service',          category: 'Emergency' },
  { id: 'water_damage_restoration',   category: 'Emergency' },
  { id: 'landscaping',                category: 'Outdoor' },
  { id: 'web_design_quote',           category: 'Professional' },
] as const;

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

async function openWizardAndApply(page: Page, templateId: string) {
  await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('quotequick-editor-shell')).toBeVisible();

  await page.getByTestId('template-browse-all').click();
  const modal = page.getByTestId('template-browse-modal');
  await expect(modal).toBeVisible({ timeout: 3000 });
  await page.waitForTimeout(500);

  const card = page.getByTestId(`template-browse-card-${templateId}`);
  await card.scrollIntoViewIfNeeded();
  await card.click();

  await expect(modal).toBeHidden({ timeout: 4000 });
  await expect(
    page.locator('[data-testid="advanced-calculator"][data-bg-mode="gradient"]')
  ).toBeVisible({ timeout: 6000 });
  await page.waitForTimeout(700);
}

test.describe('W-BB-2 — per-category derived identity', () => {
  test.beforeEach(async ({ page }) => {
    await clearShellState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  for (const t of TEMPLATES) {
    test(`renders derived identity — ${t.id} (${t.category})`, async ({ page }) => {
      await openWizardAndApply(page, t.id);

      const pane = page.getByTestId('editor-preview-pane');
      await expect(pane).toBeVisible();
      await pane.screenshot({ path: path.join(OUT_DIR, `bb2-${t.id}-rendered.png`) });

      const calc = page.locator('[data-testid="advanced-calculator"]').first();
      if (await calc.isVisible().catch(() => false)) {
        await calc.screenshot({ path: path.join(OUT_DIR, `bb2-${t.id}-widget.png`) });
      }
    });
  }
});

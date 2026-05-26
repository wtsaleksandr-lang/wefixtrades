/**
 * W-AS-1c — Visual verification of the post-polish per-template Brand Studio
 * identity. AS-1b proved the 3 sample templates rendered distinct identities
 * but flagged 3 schema mismatches (gradient direction clamping, missing
 * `'accent-tinted'` border, missing `animations`). AS-1c (this wave) extends
 * the schema and updates the 3 templates accordingly. This spec re-shoots the
 * same 3 templates so the post-polish identity can be compared against the
 * AS-1b baseline.
 *
 * Outputs (under `tests/audit/_screenshots/`):
 *   as1c-junk_removal_quote-rendered.png
 *   as1c-window_replacement_quote-rendered.png
 *   as1c-mold_remediation_quote-rendered.png
 *   plus -widget.png variants without surrounding chrome.
 *
 * Run:
 *   npx vite build
 *   npx playwright test tests/audit/wave-as1c-template-polish.spec.ts \
 *     --config audit.as1c.config.ts --reporter=line
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const OUT_DIR = path.join(process.cwd(), 'tests/audit/_screenshots');

// Per-template expected bgMode — derived from each template's own AS-1c
// style block in shared/templatePresets.ts. junk/mold use a gradient outer
// canvas; window_replacement intentionally uses a solid slate canvas with
// the vivid colour reserved for the inner result panel.
const TEMPLATES = [
  { id: 'junk_removal_quote', bgMode: 'gradient' },
  { id: 'window_replacement_quote', bgMode: 'solid' },
  { id: 'mold_remediation_quote', bgMode: 'gradient' },
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

async function openWizardAndApply(page: Page, templateId: string, expectedBgMode: string) {
  await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  await expect(page.getByTestId('quotequick-editor-shell')).toBeVisible();

  await page.getByTestId('template-browse-all').click();
  const modal = page.getByTestId('template-browse-modal');
  await expect(modal).toBeVisible({ timeout: 3000 });
  await page.waitForTimeout(600);

  const card = page.getByTestId(`template-browse-card-${templateId}`);
  await card.scrollIntoViewIfNeeded();
  await card.click();

  await expect(modal).toBeHidden({ timeout: 4000 });
  await expect(
    page.locator(`[data-testid="advanced-calculator"][data-bg-mode="${expectedBgMode}"]`)
  ).toBeVisible({ timeout: 6000 });
  await page.waitForTimeout(900);
}

test.describe('W-AS-1c — post-polish per-template identity', () => {
  test.beforeEach(async ({ page }) => {
    await clearShellState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  for (const { id, bgMode } of TEMPLATES) {
    test(`renders post-polish widget identity — ${id}`, async ({ page }) => {
      await openWizardAndApply(page, id, bgMode);

      const pane = page.getByTestId('editor-preview-pane');
      await expect(pane).toBeVisible();
      const out = path.join(OUT_DIR, `as1c-${id}-rendered.png`);
      await pane.screenshot({ path: out });
      // eslint-disable-next-line no-console
      console.log(`[as1c] ${out}`);

      const calc = page.locator('[data-testid="advanced-calculator"]').first();
      if (await calc.isVisible().catch(() => false)) {
        const calcOut = path.join(OUT_DIR, `as1c-${id}-widget.png`);
        await calc.screenshot({ path: calcOut });
        // eslint-disable-next-line no-console
        console.log(`[as1c] ${calcOut}`);
      }
    });
  }
});

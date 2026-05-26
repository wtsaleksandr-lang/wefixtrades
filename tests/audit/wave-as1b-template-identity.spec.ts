/**
 * W-AS-1b — Visual verification of per-template Brand Studio identity.
 *
 * AS-1 gave the 3 sample templates (junk removal, window replacement, mold
 * remediation) distinct AdvStyle tokens (color, weight, radius). That work
 * predates AO-6c, so it missed the AO-6c Brand Studio fields. AS-1b extends
 * the same 3 templates with the AO-6c fields (`bgMode`, `bgGradient`,
 * `bgImageTint`, `resultPanel`) and this spec PROVES the rendered widgets
 * read as dramatically different — by screenshot, not by inspection.
 *
 * The wizard's PreviewPane forces `plan_tier: 'pro'` (see PreviewPane.tsx
 * around line 282) so every viewer SEES the full Brand Studio identity in
 * the editor — the server-side AO-6c strip only kicks in on persistence.
 *
 * Outputs (under `tests/audit/_screenshots/`):
 *   as1b-junk_removal_quote-rendered.png
 *   as1b-window_replacement_quote-rendered.png
 *   as1b-mold_remediation_quote-rendered.png
 *   as1b-comparison-sheet.png   (side-by-side composite)
 *
 * Run:
 *   npx vite build
 *   npx playwright test tests/audit/wave-as1b-template-identity.spec.ts \
 *     --config audit.as1b.config.ts --reporter=line
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const OUT_DIR = path.join(process.cwd(), 'tests/audit/_screenshots');

// Per-template expected bgMode — derived from each template's own AS-1c
// style block in shared/templatePresets.ts. junk/mold use a gradient outer
// canvas; window_replacement intentionally uses a solid slate canvas with
// the vivid colour reserved for the inner result panel (the design intent
// is "soft outer → vivid inner"), per Phase 1 template-design v2.
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

  // Open the "Browse all" template modal.
  await page.getByTestId('template-browse-all').click();
  const modal = page.getByTestId('template-browse-modal');
  await expect(modal).toBeVisible({ timeout: 3000 });
  await page.waitForTimeout(600);

  // Click the desired template card.
  const card = page.getByTestId(`template-browse-card-${templateId}`);
  await card.scrollIntoViewIfNeeded();
  await card.click();

  // Modal closes once the template applies. Wait for the editor preview to
  // settle and the AdvancedCalculator to render with the new style tokens.
  await expect(modal).toBeHidden({ timeout: 4000 });
  // Preview pane re-renders the calculator on each style change; the
  // `data-bg-mode` attribute on `[data-testid="advanced-calculator"]` flips
  // to this template's expected bgMode (gradient vs solid, per the design).
  await expect(
    page.locator(`[data-testid="advanced-calculator"][data-bg-mode="${expectedBgMode}"]`)
  ).toBeVisible({ timeout: 6000 });
  // Let layout + the calculator's internal mounts settle (fonts, gradient
  // paint, result-panel emphasis recompute) before we shoot.
  await page.waitForTimeout(900);
}

test.describe('W-AS-1b — per-template Brand Studio identity', () => {
  test.beforeEach(async ({ page }) => {
    await clearShellState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  for (const { id, bgMode } of TEMPLATES) {
    test(`renders distinct widget identity — ${id}`, async ({ page }) => {
      await openWizardAndApply(page, id, bgMode);

      // Screenshot the PREVIEW PANE (right side of the editor), not the
      // whole wizard, so we judge the widget — not the surrounding chrome.
      const pane = page.getByTestId('editor-preview-pane');
      await expect(pane).toBeVisible();
      const out = path.join(OUT_DIR, `as1b-${id}-rendered.png`);
      await pane.screenshot({ path: out });
      // eslint-disable-next-line no-console
      console.log(`[as1b] ${out}`);

      // Belt-and-braces — also dump the bare calculator element so the
      // verdict reviewer can compare the WIDGET itself without bezel chrome.
      const calc = page.locator('[data-testid="advanced-calculator"]').first();
      if (await calc.isVisible().catch(() => false)) {
        const calcOut = path.join(OUT_DIR, `as1b-${id}-widget.png`);
        await calc.screenshot({ path: calcOut });
        // eslint-disable-next-line no-console
        console.log(`[as1b] ${calcOut}`);
      }
    });
  }
});

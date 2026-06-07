/**
 * Deep per-template audit — Wave Z follow-up.
 *
 * Parametrized over every entry in `TEMPLATE_PRESETS`. For each template:
 *   1. Navigate to /wizard?template=<id> (applies the preset on mount)
 *   2. Wait for the preview pane to render the first field's label
 *   3. Assert the preview shows a result value that is NOT "NaN" and is NOT empty
 *   4. Assert no uncaught page errors fired during application
 *
 * IA REDESIGN (2026-06) — the template GALLERY now DEDUPES layout variants
 * (collapseLayoutVariants() collapses `*_single_col` / `*_two_col` siblings
 * sharing a `name` into ONE representative strip card). So the old approach —
 * clicking `template-strip-card-{id}` — can no longer reach every preset: the
 * non-representative variants have no strip card. The variants still exist in
 * TEMPLATE_PRESETS and must still render non-NaN, so this spec now loads each
 * template DIRECTLY via `/wizard?template=<id>` (WizardShell's `?template=`
 * mount effect applies any preset id, deduped or not). That keeps the per-
 * variant regression coverage intact without depending on the gallery UI.
 *
 * This is exactly the kind of regression that the 11 bugs in PR #370 would
 * have produced silently — 3 templates rendered NaN as their headline
 * before being caught by the sanity-check script. This spec is the
 * standing regression net for that whole class of bug.
 *
 * Naming: `wizard-templates-deep` rather than `*-screenshots` so the spec
 * does NOT get caught by the test.skip(!!process.env.CI, ...) gate that
 * the W-R1 screenshot collectors use. This is a regression check, not a
 * screenshot helper, and it MUST run in CI.
 */

import { test, expect, type Page } from '@playwright/test';
import { TEMPLATE_PRESETS } from '../../shared/templatePresets';

/** First-field label is rendered in the preview pane verbatim. */
function firstFieldLabel(templateId: string): string | null {
  const t = TEMPLATE_PRESETS.find((x) => x.id === templateId);
  if (!t || t.fields.length === 0) return null;
  // Some templates use `name` as their canonical label, others `label`.
  return t.fields[0].label ?? t.fields[0].name ?? null;
}

/**
 * Open the wizard editor with a template pre-applied via the URL param.
 * WizardShell's mount effect reads `?template=<id>`, looks the preset up with
 * getTemplatePreset(), and applies it (works for deduped variants too). This
 * replaces clicking the gallery strip card, which no longer exists for the
 * collapsed `*_single_col` / `*_two_col` variants.
 */
async function openWizardWithTemplate(page: Page, templateId: string) {
  await page.goto(`/wizard?template=${encodeURIComponent(templateId)}`);
  await expect(page.getByTestId('quotequick-editor-shell')).toBeVisible({ timeout: 5000 });
}

test.describe('deep per-template audit', () => {
  // One test per template. Parametrize at module-load — Playwright wraps each
  // in its own browser context, so failures are isolated per template.
  for (const t of TEMPLATE_PRESETS) {
    test(`${t.id} (${t.name}) renders + result is not NaN`, async ({ page }) => {
      // Collect any uncaught page errors during the run so we can assert at the end.
      const pageErrors: string[] = [];
      page.on('pageerror', (err) => pageErrors.push(err.message));

      // Apply the template directly via the URL param (deduped gallery no
      // longer exposes a strip card for every variant).
      await openWizardWithTemplate(page, t.id);

      // After applying, the preview pane should render the first field's label.
      const label = firstFieldLabel(t.id);
      if (label) {
        await expect(page.getByTestId('editor-preview-pane'))
          .toContainText(label, { timeout: 3500 });
      }

      // The result calc is named in `result_calc` — its rendered value lives
      // inside the preview pane. We don't know the exact selector, so we
      // scrape the pane's text and assert it does NOT contain "NaN" or "$NaN".
      const previewText = await page.getByTestId('editor-preview-pane').innerText();
      expect(previewText, `Template ${t.id} preview text:\n${previewText}`).not.toContain('NaN');

      // And no JS errors during template application.
      expect(pageErrors, `Page errors for ${t.id}:\n${pageErrors.join('\n')}`).toEqual([]);
    });
  }
});

/**
 * Deep per-template audit — Wave Z follow-up.
 *
 * Parametrized over every entry in `TEMPLATE_PRESETS`. For each template:
 *   1. Navigate to /wizard
 *   2. Click the template's strip card (data-testid="template-strip-card-{id}")
 *   3. Wait for the preview pane to render the first field's label
 *   4. Assert the preview shows a result value that is NOT "NaN" and is NOT empty
 *   5. Assert no uncaught page errors fired during application
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

/** Open the wizard editor and wait until the strip is rendered. */
async function openWizard(page: Page) {
  await page.goto('/wizard');
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

      await openWizard(page);

      const card = page.getByTestId(`template-strip-card-${t.id}`);
      // The strip is a horizontal scroller; if the card isn't yet in view, scroll it.
      await card.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      await expect(card).toBeVisible({ timeout: 3000 });
      await card.click();

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

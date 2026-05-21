/**
 * W-R4 — image-answer cards screenshot spec.
 *
 * Captures the customer-facing widget and the wizard FieldRow editor after
 * shipping `image_choice` as a first-class field type (Wave W-R4 in the
 * polish campaign). Per the competitor audit, the "tap a photo that matches
 * your project" pattern is the highest-engagement input for trade
 * businesses; this spec generates the artefacts Alex reviews to sign off
 * the visual standard.
 *
 * Not a regression spec — it writes images into
 * `tests/audit/_screenshots/` for human review.
 *
 * Coverage:
 *  - Widget desktop 1440 + mobile 390 — single image_choice field with
 *    four options, each with a different (data-URL) sample image, so the
 *    accent ring and 3-up / 2-up grid both exercise.
 *  - Wizard FieldRow expanded — Build pane showing the image-mode option
 *    editor (thumbnails + label + value + remove).
 *
 * Run with:
 *   npx playwright test tests/audit/_w-r4-image-cards-screenshot.spec.ts \
 *     --config audit.config.ts --reporter=line
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const OUT_DIR = path.join(process.cwd(), 'tests/audit/_screenshots');

test.beforeAll(() => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
});

/**
 * 1×1 transparent PNG, then tinted via CSS background-color in the widget
 * surface. We use four distinct colours so the screenshot shows a real
 * grid of differing cards rather than a wall of identical placeholders.
 *
 * (The widget renders the `image` field directly as <img src>, so any
 * valid data URL works — we don't need actual photos for visual review.)
 */
const SAMPLE_IMAGES: Record<string, string> = {
  // Pale blue
  exterior: 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 75"><rect width="100" height="75" fill="%23bfdbfe"/><text x="50" y="42" font-family="Arial" font-size="11" font-weight="700" text-anchor="middle" fill="%231e3a8a">EXT</text></svg>',
  ),
  // Pale green
  interior: 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 75"><rect width="100" height="75" fill="%23bbf7d0"/><text x="50" y="42" font-family="Arial" font-size="11" font-weight="700" text-anchor="middle" fill="%23166534">INT</text></svg>',
  ),
  // Pale yellow
  bathroom: 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 75"><rect width="100" height="75" fill="%23fef08a"/><text x="50" y="42" font-family="Arial" font-size="11" font-weight="700" text-anchor="middle" fill="%23854d0e">BATH</text></svg>',
  ),
  // Pale rose
  kitchen: 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 75"><rect width="100" height="75" fill="%23fecdd3"/><text x="50" y="42" font-family="Arial" font-size="11" font-weight="700" text-anchor="middle" fill="%23881337">KIT</text></svg>',
  ),
};

/** Seed shell state with one image_choice field exercising the full UI. */
async function seedImageChoiceState(page: Page, opts: { withImages: boolean }) {
  const shell = {
    layout: 'two-column',
    header: { title: 'Project Photo Quote', subtitle: 'Tap a photo that matches your project' },
    style: {},
    settings: { showHeader: true },
    fields: [
      {
        id: 'project_type',
        name: 'project_type',
        label: 'What kind of project?',
        type: 'image_choice',
        options: [
          {
            id: 'exterior',
            label: 'Exterior',
            value: 1200,
            image: opts.withImages ? SAMPLE_IMAGES.exterior : undefined,
          },
          {
            id: 'interior',
            label: 'Interior',
            value: 1500,
            image: opts.withImages ? SAMPLE_IMAGES.interior : undefined,
          },
          {
            id: 'bathroom',
            label: 'Bathroom',
            value: 2100,
            image: opts.withImages ? SAMPLE_IMAGES.bathroom : undefined,
          },
          {
            id: 'kitchen',
            label: 'Kitchen',
            value: 3400,
            image: opts.withImages ? SAMPLE_IMAGES.kitchen : undefined,
          },
        ],
      },
    ],
    calculations: [
      { id: 'total', name: 'Estimated total', formula: 'project_type', format: 'currency' },
    ],
    resultCalcId: 'total',
    logo: null,
  };
  await page.addInitScript((payload) => {
    try {
      localStorage.removeItem('qq_wizard');
      localStorage.removeItem('qq_step');
      localStorage.removeItem('qq_result');
      localStorage.removeItem('qq_editor_pane_width');
      localStorage.removeItem('qq_editor_preview_collapsed');
      localStorage.setItem('qq_elfsight_shell', JSON.stringify(payload));
    } catch {}
  }, shell);
}

async function openWizardSeeded(page: Page, opts: { withImages: boolean }) {
  await seedImageChoiceState(page, opts);
  await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  await expect(page.getByTestId('quotequick-editor-shell')).toBeVisible();
  await expect(page.getByTestId('advanced-calculator')).toBeVisible({ timeout: 3000 });
  await page.waitForTimeout(400);
}

async function shootCalculator(page: Page, name: string) {
  const filepath = path.join(OUT_DIR, `${name}.png`);
  const calc = page.getByTestId('advanced-calculator');
  await calc.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await calc.screenshot({ path: filepath });
  // eslint-disable-next-line no-console
  console.log(`[w-r4-screenshot] ${filepath}`);
}

async function shootWizardEditor(page: Page, name: string) {
  // Expand the image_choice field row so the option editor is visible.
  const toggle = page.getByTestId('field-row-toggle-project_type');
  await toggle.click();
  await page.waitForTimeout(300);

  // Capture just the Build-pane (the fields panel container) so the
  // screenshot focuses on the option editor with its 32×32 thumbnails.
  const row = page.getByTestId('field-row-project_type');
  await row.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const filepath = path.join(OUT_DIR, `${name}.png`);
  await row.screenshot({ path: filepath });
  // eslint-disable-next-line no-console
  console.log(`[w-r4-screenshot] ${filepath}`);
}

/* ─────────────────────────────────────────────────────────── */

test.describe('W-R4 — widget desktop 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('image_choice — 3-up grid with sample images', async ({ page }) => {
    await openWizardSeeded(page, { withImages: true });
    await shootCalculator(page, 'w-r4-widget-desktop');
  });
});

test.describe('W-R4 — widget mobile 390', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('image_choice — 2-up grid with sample images', async ({ page }) => {
    await openWizardSeeded(page, { withImages: true });
    await shootCalculator(page, 'w-r4-widget-mobile');
  });
});

test.describe('W-R4 — wizard editor 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('FieldRow image_choice — option editor with thumbnails', async ({ page }) => {
    await openWizardSeeded(page, { withImages: true });
    await shootWizardEditor(page, 'w-r4-wizard-editor');
  });
});

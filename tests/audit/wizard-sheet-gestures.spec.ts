/**
 * QuoteQuick wizard — mobile bottom-sheet gesture self-check (feat/wizard-sheet-gestures).
 *
 * Drives the FINAL rendered MobileBottomSheet at mobile 375px against the five
 * owner-reported fixes:
 *   (a) drag DOWN from the title area collapses the sheet to its peek
 *   (b) the "Drag to resize" teaching hint is present BEFORE any real drag
 *   (c) after scrolling the preview, the FIRST drag on the bar resizes (no race)
 *   (d) an `is-grabbing` active state toggles on pointerdown / clears on up
 *   (e) the visible drag bar is slimmer than the legacy ~42px grabber area
 *
 * Runs under audit.config.ts (vite preview on :5000, no API/DB/secrets).
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'fs';

const SHOT_DIR =
  'C:/Users/Owner/claude-orchestrator/review-shots/wizard-sheet-gestures';

test.use({ viewport: { width: 375, height: 780 } });

function shot(name: string) {
  return `${SHOT_DIR}/${name}.png`;
}

async function clearShellState(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('qq_wizard');
      localStorage.removeItem('qq_step');
      localStorage.removeItem('qq_result');
      localStorage.removeItem('qq_elfsight_shell');
      localStorage.removeItem('qq_editor_pane_width');
      // Critical: clear the "learned" flag so the persistent drag hint shows.
      localStorage.removeItem('qq_wizard_sheet_dragged');
      localStorage.removeItem('qq_wizard_sheet_hint_opens');
      localStorage.removeItem('qq_wizard_sheet_height_frac');
    } catch {}
  });
}

async function openWizard(page: Page) {
  await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  await expect(page.getByTestId('quotequick-editor-shell')).toBeVisible();
}

async function ensureSheetOpen(page: Page) {
  const sheet = page.getByTestId('wizard-bottom-sheet');
  // First-run auto-opens the sheet on mobile; if not open, tap a bottom-tab.
  if ((await sheet.getAttribute('data-open')) !== 'true') {
    const tab = page.locator('[data-testid^="bottom-tab-"]').first();
    if (await tab.count()) { await tab.click(); await page.waitForTimeout(400); }
  }
  await expect(sheet).toHaveAttribute('data-open', 'true');
  // Make sure it isn't resting collapsed.
  if ((await sheet.getAttribute('data-collapsed')) === 'true') {
    await page.getByTestId('wizard-sheet-handle').click();
    await page.waitForTimeout(400);
  }
  return sheet;
}

test.beforeEach(async ({ page }) => { await clearShellState(page); });

test('mobile bottom-sheet gestures — all five fixes', async ({ page }) => {
  await openWizard(page);
  mkdirSync(SHOT_DIR, { recursive: true });
  const sheet = await ensureSheetOpen(page);
  const header = page.getByTestId('wizard-sheet-header');
  const title = page.getByTestId('wizard-sheet-title');

  // ── (b) persistent "Drag to resize" hint present before any drag ──
  // The is-hinting class drives the teaching cue; the caption is rendered with
  // the visible "Drag to resize" copy.
  await page.waitForTimeout(300);
  const hintingClass = await sheet.getAttribute('class');
  expect(hintingClass).toContain('is-hinting');
  await expect(page.locator('.qq-sheet-drag-caption')).toBeVisible();
  await expect(page.locator('.qq-sheet-drag-caption')).toContainText('Drag to resize');
  await page.screenshot({ path: shot('01-hint-present') });

  // Wait well past the OLD ~2.6s timeout to prove the hint now persists.
  await page.waitForTimeout(3200);
  expect(await sheet.getAttribute('class')).toContain('is-hinting');
  await expect(page.locator('.qq-sheet-drag-caption')).toBeVisible();
  await page.screenshot({ path: shot('02-hint-persists-after-3s') });

  // ── (e) visible drag bar is slimmer (~30% trim) ──
  // The grabber row (handle area) should be well under the legacy ~42px.
  const grabberBox = await page.locator('.qq-sheet-grabber').boundingBox();
  expect(grabberBox).not.toBeNull();
  // New visible grabber area = 18px min-height + 6/3 padding ≈ 27px; legacy ≈42.
  expect(grabberBox!.height).toBeLessThan(34);
  await page.screenshot({ path: shot('03-slim-bar') });

  // ── (d) is-grabbing active state toggles on pointerdown / clears on up ──
  const hb = (await header.boundingBox())!;
  const cx = hb.x + hb.width / 2;
  const downY = hb.y + hb.height * 0.4;
  await page.mouse.move(cx, downY);
  await page.mouse.down();
  await page.waitForTimeout(80);
  expect(await sheet.getAttribute('class')).toContain('is-grabbing');
  await page.screenshot({ path: shot('04-is-grabbing-active') });
  await page.mouse.up();
  await page.waitForTimeout(120);
  expect(await sheet.getAttribute('class')).not.toContain('is-grabbing');

  // ── (a) drag DOWN from the title area collapses to peek ──
  const tb = (await title.boundingBox())!;
  const startX = tb.x + tb.width / 2;
  const startY = tb.y + tb.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Drag down well past the threshold, in steps so move handlers fire.
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(startX, startY + i * 40, { steps: 1 });
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await page.waitForTimeout(500);
  await expect(sheet).toHaveAttribute('data-collapsed', 'true');
  await page.screenshot({ path: shot('05-drag-down-collapsed') });

  // Re-open for the scroll-then-drag race test.
  await page.getByTestId('wizard-sheet-handle').click();
  await page.waitForTimeout(450);
  await expect(sheet).toHaveAttribute('data-collapsed', 'false');

  // ── (c) scroll the preview, then FIRST drag on the bar resizes ──
  // Scroll inside the preview/canvas area above the sheet to start momentum.
  const previewMid = { x: 187, y: 180 };
  await page.mouse.move(previewMid.x, previewMid.y);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(60); // immediate — do NOT let momentum settle
  // First drag UP on the bar should resize on the first attempt.
  const hb2 = (await header.boundingBox())!;
  const dragX = hb2.x + hb2.width / 2;
  const dragStartY = hb2.y + hb2.height * 0.5;
  const heightBefore = (await sheet.boundingBox())!.height;
  await page.mouse.move(dragX, dragStartY);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(dragX, dragStartY - i * 30, { steps: 1 });
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await page.waitForTimeout(450);
  const heightAfter = (await sheet.boundingBox())!.height;
  // The very first post-scroll drag changed the height → no gesture race.
  expect(heightAfter).toBeGreaterThan(heightBefore + 20);
  await page.screenshot({ path: shot('06-first-drag-after-scroll-resized') });
});

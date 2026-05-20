/**
 * QuoteQuick wizard — Wave J UI refinement UX-QA.
 *
 * Asserts the 7 Wave J items against the canonical /wizard editor shell.
 * Every item has a mobile-parity check too (viewport 390×844). Items:
 *
 *  (1) Floating labels on editor inputs (no separate label-above element).
 *  (2) `?` info icon next to section title → tooltip on hover/tap.
 *  (3) Day / night theme toggle in the top bar — flips `data-theme`.
 *  (4) Drag-handle always visible on FieldRow + CalculationRow.
 *  (5) Hover over a row sets a `data-hover-outline="true"` data attr.
 *  (6) Business-name field is a composite: logo upload + name input.
 *  (7) Preview area uses a dotted-grid (radial-gradient) background.
 *
 * Runs under audit.config.ts (vite preview on :5000, no API).
 */
import { test, expect, type Page } from '@playwright/test';

async function clearShellState(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('qq_wizard');
      localStorage.removeItem('qq_step');
      localStorage.removeItem('qq_result');
      localStorage.removeItem('qq_elfsight_shell');
      localStorage.removeItem('qq_editor_pane_width');
      localStorage.removeItem('qq_editor_theme');
    } catch {}
  });
}

async function openWizard(page: Page) {
  await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('quotequick-editor-shell')).toBeVisible();
}

test.describe('wizard J — Wave J UI refinement (desktop)', () => {
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('(1) business-name input has a floating label and NO separate label-above', async ({ page }) => {
    await openWizard(page);
    const input = page.getByTestId('input-business-name');
    await expect(input).toBeVisible();
    // The input is inside a .float-field wrapper, and the wrapper's sibling
    // pattern matches "input THEN label" (per index.css). Confirm by reading
    // the wrapper structure.
    const wrapped = await input.evaluate((el) => {
      const wrap = el.parentElement;
      if (!wrap) return false;
      if (!wrap.classList.contains('float-field')) return false;
      const lbl = wrap.querySelector('label');
      if (!lbl) return false;
      return lbl.textContent?.trim() === 'Business name';
    });
    expect(wrapped).toBe(true);

    // There must NOT be a non-floating <label for="qq-shell-business-name">
    // sitting OUTSIDE the float-field wrapper.
    const aboveLabelCount = await page.evaluate(() => {
      const lbls = Array.from(document.querySelectorAll('label[for="qq-shell-business-name"]'));
      return lbls.filter((l) => !l.closest('.float-field')).length;
    });
    expect(aboveLabelCount).toBe(0);
  });

  test('(2) clicking a section InfoCue reveals its tooltip', async ({ page }) => {
    await openWizard(page);
    // Switch to Settings to find one of the InfoCues we know exists.
    await page.getByTestId('editor-tab-settings').click();
    await expect(page.getByTestId('editor-tabpanel-settings')).toBeVisible();
    const cue = page.getByTestId('info-cue-settings-lead-email');
    await expect(cue).toBeVisible();
    await cue.click();
    await expect(page.getByTestId('info-cue-settings-lead-email-popover')).toBeVisible();
    // Wave L P2 — popovers are now portaled to document.body. Escape is the
    // canonical dismiss path tracked by InfoCue.useEffect's keydown handler;
    // a click-outside at viewport (5,5) is racey because moving the mouse
    // toward the corner can re-enter the trigger and re-open via
    // onMouseEnter. Escape avoids that race.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('info-cue-settings-lead-email-popover')).toHaveCount(0);
  });

  test('(3) theme toggle flips data-theme on the shell root and persists', async ({ page }) => {
    await openWizard(page);
    const shell = page.getByTestId('quotequick-editor-shell');
    const toggle = page.getByTestId('editor-theme-toggle');
    await expect(toggle).toBeVisible();
    const initial = await shell.getAttribute('data-theme');
    expect(initial === 'light' || initial === 'dark').toBe(true);
    await toggle.click();
    const flipped = initial === 'dark' ? 'light' : 'dark';
    await expect(shell).toHaveAttribute('data-theme', flipped);
    await toggle.click();
    await expect(shell).toHaveAttribute('data-theme', initial!);
    // Persisted to localStorage.
    const persisted = await page.evaluate(() => localStorage.getItem('qq_editor_theme'));
    expect(persisted === 'light' || persisted === 'dark').toBe(true);
  });

  test('(3) theme toggle lives immediately to the left of the help icon', async ({ page }) => {
    await openWizard(page);
    const order = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="editor-top-bar"]');
      if (!bar) return [];
      const ids = Array.from(bar.querySelectorAll('[data-testid]'))
        .map((el) => el.getAttribute('data-testid'))
        .filter((id): id is string => Boolean(id))
        .filter((id) => id === 'editor-theme-toggle' || id === 'editor-help');
      return ids;
    });
    expect(order).toEqual(['editor-theme-toggle', 'editor-help']);
  });

  test('(4) every FieldRow + CalculationRow exposes a visible drag handle without hover', async ({ page }) => {
    await openWizard(page);
    const fieldRows = page.locator('[data-testid^="field-row-"][data-field-type]');
    const fn = await fieldRows.count();
    expect(fn).toBeGreaterThan(0);
    for (let i = 0; i < fn; i++) {
      const id = (await fieldRows.nth(i).getAttribute('data-testid'))!.replace(/^field-row-/, '');
      const handle = page.getByTestId(`field-row-handle-${id}`);
      const w = await handle.evaluate((el) => (el as HTMLElement).getBoundingClientRect().width);
      expect(w).toBeGreaterThan(0);
    }
    const calcRows = page.locator('[data-testid^="calc-row-"][data-calc-row]');
    const cn = await calcRows.count();
    expect(cn).toBeGreaterThan(0);
    for (let i = 0; i < cn; i++) {
      const id = (await calcRows.nth(i).getAttribute('data-testid'))!.replace(/^calc-row-/, '');
      const handle = page.getByTestId(`calc-row-handle-${id}`);
      const w = await handle.evaluate((el) => (el as HTMLElement).getBoundingClientRect().width);
      expect(w).toBeGreaterThan(0);
    }
  });

  test('(5) hovering a FieldRow flips data-hover-outline to true', async ({ page }) => {
    await openWizard(page);
    const row = page.locator('[data-testid^="field-row-"][data-field-type]').first();
    await expect(row).toHaveAttribute('data-hover-outline', 'false');
    await row.hover();
    await expect(row).toHaveAttribute('data-hover-outline', 'true');
  });

  test('(6) business-name field is a composite with a logo-upload slot', async ({ page }) => {
    await openWizard(page);
    const composite = page.getByTestId('editor-business-composite');
    await expect(composite).toBeVisible();
    const upload = page.getByTestId('editor-logo-upload');
    await expect(upload).toBeVisible();
    const input = page.getByTestId('input-business-name');
    await expect(input).toBeVisible();
    // The logo slot is structurally on the LEFT of the input.
    const box = (await upload.boundingBox())!;
    const ibox = (await input.boundingBox())!;
    expect(box.x).toBeLessThan(ibox.x);
  });

  test('(7) preview pane has a dotted-grid radial-gradient background', async ({ page }) => {
    await openWizard(page);
    const right = page.getByTestId('editor-right-pane');
    await expect(right).toBeVisible();
    const cs = await right.evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundImage, size: s.backgroundSize };
    });
    // The dot pattern uses `radial-gradient(circle, ...)` — the old leftover
    // pre-Wave-J gradient was also a radial-gradient but with a percentage
    // ellipse, so asserting just "radial-gradient" was a false-positive guard.
    expect(cs.bg.toLowerCase()).toContain('radial-gradient(circle,');
    // Dot spacing is 16px × 16px.
    expect(cs.size.replace(/\s+/g, ' ').trim()).toMatch(/^16px 16px$/);
  });
});

test.describe('wizard J — Wave J UI refinement (mobile 390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.beforeEach(async ({ page }) => { await clearShellState(page); });

  test('(1) business-name input still uses the floating label on mobile', async ({ page }) => {
    await openWizard(page);
    const input = page.getByTestId('input-business-name');
    await expect(input).toBeVisible();
    const ok = await input.evaluate((el) => el.parentElement?.classList.contains('float-field'));
    expect(ok).toBe(true);
  });

  test('(2) InfoCue tap-to-toggle works on mobile', async ({ page }) => {
    await openWizard(page);
    await page.getByTestId('editor-tab-settings').click();
    const cue = page.getByTestId('info-cue-settings-lead-email');
    await cue.click();
    await expect(page.getByTestId('info-cue-settings-lead-email-popover')).toBeVisible();
    await cue.click();
    await expect(page.getByTestId('info-cue-settings-lead-email-popover')).toHaveCount(0);
  });

  test('(3) theme toggle works on mobile', async ({ page }) => {
    await openWizard(page);
    const shell = page.getByTestId('quotequick-editor-shell');
    const toggle = page.getByTestId('editor-theme-toggle');
    await expect(toggle).toBeVisible();
    const initial = await shell.getAttribute('data-theme');
    await toggle.click();
    const flipped = initial === 'dark' ? 'light' : 'dark';
    await expect(shell).toHaveAttribute('data-theme', flipped);
  });

  test('(4) drag handles visible on mobile too', async ({ page }) => {
    await openWizard(page);
    const fieldRows = page.locator('[data-testid^="field-row-"][data-field-type]');
    const fn = await fieldRows.count();
    expect(fn).toBeGreaterThan(0);
    const id = (await fieldRows.first().getAttribute('data-testid'))!.replace(/^field-row-/, '');
    const handle = page.getByTestId(`field-row-handle-${id}`);
    const w = await handle.evaluate((el) => (el as HTMLElement).getBoundingClientRect().width);
    expect(w).toBeGreaterThan(0);
  });

  test('(5) hover-outline still flips on mobile via row hover/tap', async ({ page }) => {
    await openWizard(page);
    const row = page.locator('[data-testid^="field-row-"][data-field-type]').first();
    // Mobile playwright still synthesises a hover via the pointer move.
    await row.hover();
    await expect(row).toHaveAttribute('data-hover-outline', 'true');
  });

  test('(6) logo upload has a ≥44px tap target on mobile', async ({ page }) => {
    await openWizard(page);
    const upload = page.getByTestId('editor-logo-upload');
    await expect(upload).toBeVisible();
    const box = (await upload.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('(7) preview pane dotted-grid background renders on mobile', async ({ page }) => {
    await openWizard(page);
    const right = page.getByTestId('editor-right-pane');
    await expect(right).toBeVisible();
    const cs = await right.evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundImage, size: s.backgroundSize };
    });
    expect(cs.bg.toLowerCase()).toContain('radial-gradient(circle,');
    expect(cs.size.replace(/\s+/g, ' ').trim()).toMatch(/^16px 16px$/);
  });
});

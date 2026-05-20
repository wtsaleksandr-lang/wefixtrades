/**
 * Wave N — editor pane width + Add-button sizing polish.
 *
 * On a 390 × 844 mobile viewport, the Build tab's left pane must give
 * field-row titles enough horizontal room that long labels like "Local
 * Incentives" and "Professional installation" render WITHOUT being
 * ellipsis-clamped inside their FieldRow.
 *
 * The pane reduction is driven by tightening .qq-editor-left-inner's mobile
 * padding (18 → 8 px on each side). The FieldRow's own row chrome is
 * untouched; we only freed the gutter outside of it.
 */
import { test, expect } from '@playwright/test';

const WIZARD_URL = '/wizard';

test.use({ viewport: { width: 390, height: 844 } });

test.describe('Wave N — editor pane width + Add-button sizing', () => {
  test('"Local Incentives" renders un-truncated inside its FieldRow on 390x844', async ({ page }) => {
    // Seed an editor state matching the energy_upgrade template — the
    // multi_select "Local Incentives" + toggle "Professional installation"
    // are the long-label rows shown in the Wave N reference screenshot.
    await page.addInitScript(() => {
      try {
        localStorage.removeItem('qq_dnd_hint_seen');
        localStorage.setItem('qq_elfsight_shell', JSON.stringify({
          businessName: 'Energy Co',
          activeTemplateId: 'energy_upgrade',
          layout: 'multi-column',
          fields: [
            { id: 'upgrade', name: 'Upgrade Type', label: 'Upgrade Type', type: 'select',
              options: [
                { id: 'insulation', label: 'Insulation', value: 0 },
                { id: 'windows', label: 'Windows', value: 1500 },
              ] },
            { id: 'home_size', name: 'Home Size', label: 'Home Size', type: 'number',
              min: 200, max: 8000, step: 50, default_value: 1500 },
            { id: 'incentives', name: 'Local Incentives', label: 'Local Incentives',
              type: 'multi_select',
              options: [
                { id: 'rebates', label: 'Rebates', value: -500 },
                { id: 'tax', label: 'Tax Incentives', value: -800 },
              ] },
            { id: 'install', name: 'Installation', label: 'Professional installation',
              type: 'toggle', on_value: 1200 },
          ],
          calculations: [
            { id: 'calc_est', name: 'Estimated Upgrade Cost', formula: '[Upgrade Type]', format: 'currency' },
          ],
        }));
      } catch {}
    });

    await page.goto(WIZARD_URL);
    await expect(page.getByTestId('quotequick-editor-shell')).toBeVisible();

    // Build tab is the default. Find the "Local Incentives" row label.
    const label = page.getByTestId('field-row-label-incentives');
    await expect(label).toBeVisible();

    // The visible text must be the full label — no "Local Ince..." clamp.
    await expect(label).toHaveText('Local Incentives');

    // The label has `text-overflow: ellipsis; white-space: nowrap` so visual
    // truncation manifests as scrollWidth > clientWidth. Assert equality
    // (allow a 1px rounding tolerance).
    const truncated = await label.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(truncated).toBe(false);

    // Same check for the toggle row's longer label.
    const installLabel = page.getByTestId('field-row-label-install');
    await expect(installLabel).toHaveText('Professional installation');
    const installTrunc = await installLabel.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(installTrunc).toBe(false);
  });

  test('+ Add field trigger is the smaller secondary size on mobile', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.removeItem('qq_dnd_hint_seen');
        // Seed at least one field so AddFieldMenu renders its standard
        // (non-emphasis) trigger in FieldsPanel's header.
        localStorage.setItem('qq_elfsight_shell', JSON.stringify({
          fields: [
            { id: 'f1', name: 'Quantity', label: 'Quantity', type: 'number',
              min: 0, max: 100, step: 1, default_value: 1 },
          ],
          calculations: [],
        }));
      } catch {}
    });

    await page.goto(WIZARD_URL);
    await expect(page.getByTestId('quotequick-editor-shell')).toBeVisible();

    const trigger = page.getByTestId('add-field-trigger').first();
    await expect(trigger).toBeVisible();

    const metrics = await trigger.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        fontSize: s.fontSize,
        paddingTop: s.paddingTop,
        paddingRight: s.paddingRight,
        paddingBottom: s.paddingBottom,
        paddingLeft: s.paddingLeft,
        minHeight: s.minHeight,
        height: el.getBoundingClientRect().height,
      };
    });

    // Mobile (≤480px) values from the Wave N CSS:
    //   font-size 12px · padding 6px 10px · min-height 32px.
    expect(metrics.fontSize).toBe('12px');
    expect(metrics.paddingLeft).toBe('10px');
    expect(metrics.paddingRight).toBe('10px');
    expect(metrics.paddingTop).toBe('6px');
    expect(metrics.paddingBottom).toBe('6px');
    expect(metrics.minHeight).toBe('32px');
    expect(metrics.height).toBeLessThan(40);
  });
});

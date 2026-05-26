/**
 * QuoteQuick wizard — Wave H6 Settings tab + WeFixTrades extras UX-QA.
 *
 * Asserts the Settings tab renders the 5 sections and that each section's
 * controls drive the right state — preview where it applies, save-draft
 * payload where it doesn't.
 *
 *  1. Settings tab renders 5 sections.
 *  2. Trade picker — selecting a trade updates the "Selected: <label>"
 *     readout and sets the `aria-pressed="true"` flag on the chosen row.
 *  3. Lead email input accepts and persists a value across a remount via
 *     localStorage.
 *  4. Pricing model segmented control changes the active mode and shows
 *     the matching per-mode value input.
 *  5. Number-format changes flow into the preview (`1,234` → `1.234` /
 *     currency symbol swap).
 *  6. Custom CTA label override changes the preview's CTA button text.
 *  7. Save-draft payload — POST /api/calculators body carries the new
 *     settings values (mocked so the spec runs under audit.config.ts
 *     where the API isn't served).
 *
 * Runs under audit.config.ts (vite preview on :5000, no API).
 */
import { test, expect, type Page } from '@playwright/test';
import { calculatorSettingsSchema } from '../../shared/schemas/calculator';

/**
 * BD-3d migrated `settings-input-cta-label` from plain `<input>` to
 * RichTextField (contenteditable). Test-id stays on the field root; the
 * editable surface is at `[data-testid="${root}-editor"]`.
 */
async function fillRichText(page: Page, rootTestId: string, text: string) {
  const root = page.getByTestId(rootTestId);
  await root.click();
  const editor = page.getByTestId(`${rootTestId}-editor`);
  await editor.waitFor({ state: 'visible', timeout: 2000 });
  await editor.evaluate((el, value) => {
    (el as HTMLElement).innerHTML = '';
    (el as HTMLElement).textContent = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  await editor.evaluate((el) => (el as HTMLElement).blur());
}

async function clearShellState(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('qq_wizard');
      localStorage.removeItem('qq_step');
      localStorage.removeItem('qq_result');
      localStorage.removeItem('qq_elfsight_shell');
      // Wave 10 — wizard preview defaults to stepper layout which routes
      // the CTA through the contact step (different testid). Seed
      // single-page layout so `advanced-cta` renders inline, matching the
      // legacy flow this CTA-label test was written for.
      localStorage.setItem('qq_elfsight_shell', JSON.stringify({
        stepLayout: 'single',
      }));
    } catch {}
  });
}

/** Open the wizard and switch to the Settings tab. */
async function gotoSettingsTab(page: Page) {
  await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.getByTestId('editor-tab-settings').click();
  await expect(page.getByTestId('editor-tabpanel-settings')).toBeVisible({ timeout: 2000 });
}

test.describe('wizard H6 — Settings tab', () => {
  test.beforeEach(async ({ page }) => {
    await clearShellState(page);
  });

  test('Settings tab renders the 5 sections', async ({ page }) => {
    await gotoSettingsTab(page);

    await expect(page.getByTestId('settings-group-trade')).toBeVisible();
    await expect(page.getByTestId('settings-group-lead-email')).toBeVisible();
    await expect(page.getByTestId('settings-group-pricing')).toBeVisible();
    await expect(page.getByTestId('settings-group-numberformat')).toBeVisible();
    await expect(page.getByTestId('settings-group-cta')).toBeVisible();
  });

  test('Trade picker — selecting a trade updates internal state', async ({ page }) => {
    await gotoSettingsTab(page);

    // Pre-state: nothing selected. Wave X #13 refactor: when no trade
    // is selected the "Selected: ..." readout is omitted entirely (it
    // only renders when `current` is truthy), so we assert the empty
    // state by counting matching nodes.
    await expect(page.getByTestId('settings-current-trade')).toHaveCount(0);

    // Wave X #13 — Trade picker is now a native <select> with
    // <optgroup>s per category. The typed filter input still narrows
    // which options the select renders (verified separately by
    // settings-input-trade-search), but selection itself uses
    // selectOption on the <select>, not click() on an <option>.
    const select = page.getByTestId('settings-input-trade-select');
    await select.selectOption('house_cleaning');

    await expect(select).toHaveValue('house_cleaning');
    await expect(page.getByTestId('settings-current-trade')).toContainText('House Cleaning');
  });

  test('Lead email input accepts a value, validates format, and persists in state', async ({ page }) => {
    await gotoSettingsTab(page);

    // Invalid format → error banner visible.
    await page.getByTestId('settings-input-lead-email').fill('not-an-email');
    await expect(page.getByTestId('settings-lead-email-error')).toBeVisible({ timeout: 1500 });

    // Valid format → input retains value, error banner disappears.
    const email = `qa-${Date.now()}@example.com`;
    await page.getByTestId('settings-input-lead-email').fill(email);
    await expect(page.getByTestId('settings-input-lead-email')).toHaveValue(email);
    await expect(page.getByTestId('settings-lead-email-error')).toHaveCount(0);

    // Switching tabs and back should NOT clear the value (state lives in the
    // shell, not the input's DOM — a regression here would mean a missed
    // controlled-input binding).
    await page.getByTestId('editor-tab-build').click();
    await page.waitForTimeout(120);
    await page.getByTestId('editor-tab-settings').click();
    await expect(page.getByTestId('settings-input-lead-email')).toHaveValue(email);

    // And the persisted localStorage payload carries the value too — proves
    // the rehydrate path will work after a reload (which we don't perform
    // here because the suite's beforeEach wipes localStorage via an
    // addInitScript that re-runs on reload).
    const stored = await page.evaluate(() => localStorage.getItem('qq_elfsight_shell'));
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored as string);
    expect(parsed?.settings?.leadEmail).toBe(email);
  });

  test('Pricing model segmented control swaps the per-mode value input', async ({ page }) => {
    await gotoSettingsTab(page);

    // Default = hourly → the hourly rate input is visible.
    await expect(page.getByTestId('settings-pricing-hourly')).toBeVisible();
    await expect(page.getByTestId('settings-input-pricing-rate')).toBeVisible();
    await expect(page.getByTestId('settings-pricing-fixed')).toHaveCount(0);
    await expect(page.getByTestId('settings-pricing-custom')).toHaveCount(0);

    // Fixed → swap inputs.
    await page.getByTestId('settings-segmented-pricing-fixed').click();
    await expect(page.getByTestId('settings-segmented-pricing-fixed')).toHaveAttribute(
      'aria-checked', 'true',
    );
    await expect(page.getByTestId('settings-pricing-fixed')).toBeVisible();
    await expect(page.getByTestId('settings-input-pricing-value')).toBeVisible();
    await expect(page.getByTestId('settings-pricing-hourly')).toHaveCount(0);

    // Custom → both label + rate inputs visible.
    await page.getByTestId('settings-segmented-pricing-custom').click();
    await expect(page.getByTestId('settings-pricing-custom')).toBeVisible();
    await expect(page.getByTestId('settings-input-pricing-label')).toBeVisible();
    await expect(page.getByTestId('settings-input-pricing-custom-rate')).toBeVisible();
  });

  test('Number-format changes flow into the preview headline figure', async ({ page }) => {
    await gotoSettingsTab(page);

    // Preview is always live — the headline is currency-formatted with the
    // brand defaults (USD, comma thousands, dot decimal → `$Y,YYY.YY`).
    const result = page.getByTestId('advanced-result');
    await expect(result).toBeVisible({ timeout: 3000 });

    // Default seed evaluates to "$100.00" (Service=Standard=100, Quantity=1,
    // Add-ons=[] → 100 * 1 + 0). We only need a robust assertion that the
    // headline contains a US-style figure first…
    const beforeText = (await result.textContent()) ?? '';
    expect(beforeText).toContain('$');
    // The literal `,` is present in the default `1,234`-style separator
    // when the figure is large enough — but the seed evaluates to "100.00"
    // (no thousands) so we check the decimal `.` instead.
    expect(beforeText).toContain('.');

    // Flip thousands to "space" and decimal to "comma" — values like
    // `1 234,56`. Also flip currency to EUR.
    await page.getByTestId('settings-select-thousands').selectOption('space');
    await page.getByTestId('settings-select-decimal').selectOption('comma');
    await page.getByTestId('settings-input-currency').fill('EUR');

    // The renderer's currency symbol map maps EUR → €; the headline must
    // now contain the new symbol and the EU-style decimal comma.
    await expect.poll(
      async () => (await result.textContent()) ?? '',
      { timeout: 1500, intervals: [100, 200, 300] },
    ).toMatch(/€\d+,\d{2}/);
  });

  test('Custom CTA label override changes the preview CTA button text', async ({ page }) => {
    await gotoSettingsTab(page);

    const cta = page.getByTestId('advanced-cta');
    await expect(cta).toBeVisible({ timeout: 3000 });
    // Pre-state — the default CTA label is "Get My Quote".
    await expect(cta).toContainText('Get My Quote');

    const distinct = `QA_CTA_${Date.now()}`;
    // BD-3d — settings-input-cta-label is now a RichTextField.
    await fillRichText(page, 'settings-input-cta-label', distinct);

    await expect(cta).toContainText(distinct, { timeout: 1500 });
  });

  test('Save-draft payload carries the new settings values', async ({ page }) => {
    // The audit suite serves the static build (no API) — mock the route so
    // we can capture and inspect the outgoing payload.
    let capturedBody: Record<string, unknown> | null = null;
    await page.route('**/api/calculators', async (route) => {
      try {
        capturedBody = JSON.parse(route.request().postData() || '{}');
      } catch {
        capturedBody = null;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          calculator: { id: 1, slug: 'qa-h6', edit_token: 'qa', is_token_expired: false },
          slug: 'qa-h6',
          subdomain: 'qa.example.com',
          hosted_url: 'https://qa.example.com',
          edit_token: 'qa',
          edit_url: '/EditCalculator?token=qa',
          calculator_url: '/Calculator?slug=qa-h6',
          leads_url: '/Leads?token=qa',
          dashboard_url: '/Dashboard?token=qa',
        }),
      });
    });

    await gotoSettingsTab(page);

    // Fill enough Settings values so the payload has something to assert.
    // Wave X #13 — trade picker is a native <select>; use selectOption.
    await page.getByTestId('settings-input-trade-select').selectOption('house_cleaning');
    await page.getByTestId('settings-input-lead-email').fill('qa@example.com');
    await page.getByTestId('settings-segmented-pricing-fixed').click();
    await page.getByTestId('settings-input-pricing-value').fill('350');
    await page.getByTestId('settings-input-currency').fill('EUR');
    // BD-3d — settings-input-cta-label is now a RichTextField.
    await fillRichText(page, 'settings-input-cta-label', 'Book Now');

    // Business name is required for the Save-draft button to enable.
    await page.getByTestId('editor-tab-build').click();
    await page.getByTestId('input-business-name').fill('QA H6 Co');

    // Hit Save draft and wait for the mocked POST to resolve.
    const reqPromise = page.waitForRequest('**/api/calculators');
    await page.getByTestId('quotequick-save-draft').click();
    await reqPromise;

    // Body shape — business name, trade_type, owner_email, pricing_config
    // (derived from fixed-mode), advanced.numberFormat + cta_label override.
    expect(capturedBody).not.toBeNull();
    const body = capturedBody as Record<string, any>;
    expect(body.business_name).toBe('QA H6 Co');
    expect(body.trade_type).toBe('house_cleaning');
    expect(body.owner_email).toBe('qa@example.com');
    // Fixed pricing maps to min_charge_plus_addons with minCharge = 350.
    expect(body.pricing_config?.pricingType).toBe('min_charge_plus_addons');
    expect(body.pricing_config?.minCharge).toBe(350);
    // Number-format slot lives under calculator_settings.advanced.numberFormat
    // — currency must be uppercased to EUR.
    expect(body.calculator_settings?.advanced?.numberFormat?.currency).toBe('EUR');
    // Custom CTA label is mirrored into advanced.results.cta_label.
    expect(body.calculator_settings?.advanced?.results?.cta_label).toBe('Book Now');
  });

  /**
   * Regression guard — the H6 reviewer flagged that the server-side
   * `calculatorSettingsSchema.parse()` was silently stripping
   * `calculator_settings.advanced.numberFormat` and
   * `calculator_settings.shell_settings` (Zod drops unknown keys by default).
   * A user who picked EUR / comma-decimal lost those settings on save.
   *
   * Round-trip the captured payload through the real schema and assert both
   * keys survive. Mocked transport is fine for the request itself — we're
   * testing the server's validator contract, not the network round-trip.
   */
  test('Save-draft payload survives calculatorSettingsSchema.parse() round-trip', async ({ page }) => {
    let capturedBody: Record<string, unknown> | null = null;
    await page.route('**/api/calculators', async (route) => {
      try {
        capturedBody = JSON.parse(route.request().postData() || '{}');
      } catch {
        capturedBody = null;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          calculator: { id: 1, slug: 'qa-h6-rt', edit_token: 'qa', is_token_expired: false },
          slug: 'qa-h6-rt',
          subdomain: 'qa.example.com',
          hosted_url: 'https://qa.example.com',
          edit_token: 'qa',
          edit_url: '/EditCalculator?token=qa',
          calculator_url: '/Calculator?slug=qa-h6-rt',
          leads_url: '/Leads?token=qa',
          dashboard_url: '/Dashboard?token=qa',
        }),
      });
    });

    await gotoSettingsTab(page);

    // Pick the data-loss scenario: EUR currency, comma decimal, space
    // thousands — the exact combo that vanished pre-fix.
    // Wave X #13 — trade picker is a native <select>; use selectOption.
    await page.getByTestId('settings-input-trade-select').selectOption('house_cleaning');
    await page.getByTestId('settings-select-thousands').selectOption('space');
    await page.getByTestId('settings-select-decimal').selectOption('comma');
    await page.getByTestId('settings-input-currency').fill('EUR');
    // BD-3d — settings-input-cta-label is now a RichTextField.
    await fillRichText(page, 'settings-input-cta-label', 'Reserver');

    await page.getByTestId('editor-tab-build').click();
    await page.getByTestId('input-business-name').fill('QA H6 Roundtrip');

    const reqPromise = page.waitForRequest('**/api/calculators');
    await page.getByTestId('quotequick-save-draft').click();
    await reqPromise;

    expect(capturedBody).not.toBeNull();
    const body = capturedBody as Record<string, any>;

    // Pre-fix: parsed.advanced.numberFormat was undefined (Zod stripped it).
    // Post-fix: explicit schema field preserves it through the round-trip.
    const parsed = calculatorSettingsSchema.parse(body.calculator_settings);
    expect((parsed as any).advanced?.numberFormat).toBeDefined();
    expect((parsed as any).advanced?.numberFormat?.currency).toBe('EUR');
    expect((parsed as any).advanced?.numberFormat?.thousands).toBe(' ');
    expect((parsed as any).advanced?.numberFormat?.decimal).toBe(',');

    // Pre-fix: parsed.shell_settings was undefined. Post-fix: preserved.
    expect((parsed as any).shell_settings).toBeDefined();
    expect((parsed as any).shell_settings?.tradeId).toBe('house_cleaning');
    expect((parsed as any).shell_settings?.numberFormat?.currency).toBe('EUR');
    expect((parsed as any).shell_settings?.numberFormat?.thousands).toBe('space');
    expect((parsed as any).shell_settings?.numberFormat?.decimal).toBe('comma');
    expect((parsed as any).shell_settings?.ctaLabel).toBe('Reserver');
  });
});

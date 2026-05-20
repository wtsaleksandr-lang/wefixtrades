/**
 * QuoteQuick wizard — Wave K AI assistant + budget UI UX-QA.
 *
 * The AI chat endpoint isn't served under audit.config.ts (vite preview
 * only), so every test that exercises the chat mocks /api/quotequick/ai/*
 * with `page.route` and replays a hand-crafted SSE stream. The contract
 * matches what server/routes/quotequickAiChatRoutes.ts emits in production.
 *
 *  1. AI bubble visible in the editor; click opens the chat panel.
 *  2. Text message hits the API and the assistant response appears.
 *  3. Server `tool_use` events surface in the UI AND mutate ShellState —
 *     an `add_field` call causes a new field row to render in the preview.
 *  4. Budget meter shows the cumulative / cap pair returned by the snapshot.
 *  5. Cap-reached state replaces the compose row when the API returns 403.
 *  6. Image upload accepts a file and shows a thumbnail in the message.
 *  7. Reset conversation clears history.
 *  8. Mobile viewport renders the bottom-sheet variant.
 *
 * Runs under audit.config.ts (no server / DB).
 */

import { test, expect, type Page } from '@playwright/test';

const SMALL_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** Build an SSE payload string from a list of events. */
function buildSseStream(events: Array<{ event: string; data: unknown }>): string {
  return events.map(e => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');
}

const DEFAULT_BUDGET = {
  cumulative_usd: 0.05,
  today_usd: 0.01,
  images_used: 0,
  config: {
    cap_lifetime_usd: 0.5,
    soft_warn_pct: 80,
    per_call_max_usd: 0.15,
    daily_ceiling_usd: 0.2,
    image_lifetime_cap: 10,
  },
  scope: 'global',
  tier: 'free',
};

async function clearShellState(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('qq_elfsight_shell');
      // Wipe the AI history bucket from any prior run.
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('qq_ai_chat_')) localStorage.removeItem(k);
      }
    } catch {}
  });
}

async function mockBudget(page: Page, snapshot = DEFAULT_BUDGET) {
  await page.route('**/api/quotequick/ai/budget', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(snapshot),
    }),
  );
}

/** Mock the streaming chat endpoint with a custom SSE payload. */
async function mockChat(page: Page, body: string, status = 200) {
  await page.route('**/api/quotequick/ai/chat', (route) =>
    route.fulfill({
      status,
      headers: { 'Content-Type': 'text/event-stream' },
      body,
    }),
  );
}

async function gotoEditor(page: Page) {
  await page.goto('/wizard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await expect(page.getByTestId('quotequick-editor-shell')).toBeVisible({ timeout: 4000 });
}

test.describe('wizard K — AI bubble UI', () => {
  test.beforeEach(async ({ page }) => {
    await clearShellState(page);
    await mockBudget(page);
  });

  test('bubble is visible; click opens the panel', async ({ page }) => {
    await gotoEditor(page);

    const bubble = page.getByTestId('aibubble-toggle');
    await expect(bubble).toBeVisible();
    await bubble.click();

    await expect(page.getByTestId('aibubble-panel')).toBeVisible({ timeout: 1500 });
    await expect(page.getByTestId('aibubble-empty')).toBeVisible();
    await expect(page.getByTestId('aibubble-budget-meter')).toBeVisible();
  });

  test('sending a text message renders the assistant reply', async ({ page }) => {
    await gotoEditor(page);
    await mockChat(page, buildSseStream([
      { event: 'open', data: { model: 'claude-haiku-4-5-20251001', estimate_usd: 0.01 } },
      { event: 'text', data: { delta: 'Hi! I can help you ' } },
      { event: 'text', data: { delta: 'build that calculator.' } },
      { event: 'done', data: {
        cost_usd: 0.012,
        snapshot: { ...DEFAULT_BUDGET, cumulative_usd: 0.062 },
        warn: false,
      } },
    ]));

    await page.getByTestId('aibubble-toggle').click();
    await page.getByTestId('aibubble-input').fill('Hello AI');
    await page.getByTestId('aibubble-send').click();

    // User bubble shows the typed message.
    await expect(page.getByTestId('aibubble-msg-user')).toContainText('Hello AI');

    // Assistant bubble fills in with the streamed text.
    const assistant = page.getByTestId('aibubble-msg-assistant');
    await expect(assistant).toContainText('Hi! I can help you build that calculator.', { timeout: 4000 });
  });

  test('tool_use event mutates ShellState (add_field adds a row)', async ({ page }) => {
    await gotoEditor(page);
    await mockChat(page, buildSseStream([
      { event: 'open', data: { model: 'claude-haiku-4-5-20251001', estimate_usd: 0.01 } },
      { event: 'text', data: { delta: 'Added the field.' } },
      { event: 'tool_use', data: {
        id: 'toolu_1',
        name: 'add_field',
        input: { type: 'number', label: 'Material cost', default_value: 50 },
      } },
      { event: 'done', data: {
        cost_usd: 0.011,
        snapshot: { ...DEFAULT_BUDGET, cumulative_usd: 0.061 },
        warn: false,
      } },
    ]));

    await page.getByTestId('aibubble-toggle').click();
    await page.getByTestId('aibubble-input').fill('add a material cost field');
    await page.getByTestId('aibubble-send').click();

    // Tool chip appears in the assistant bubble.
    await expect(page.getByTestId('aibubble-tool-chip')).toContainText('Added field', { timeout: 4000 });

    // The Build tab is the default; the FieldsPanel should pick up the new
    // field. We assert against the persisted shell state too since the
    // FieldsPanel's row testid uses a generated id we can't predict.
    const stored = await page.evaluate(() => localStorage.getItem('qq_elfsight_shell'));
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored as string);
    const labels = (parsed.fields ?? []).map((f: any) => f.label);
    expect(labels).toContain('Material cost');
  });

  test('budget meter renders the snapshot pair', async ({ page }) => {
    await gotoEditor(page);
    await page.getByTestId('aibubble-toggle').click();

    const meter = page.getByTestId('aibubble-budget-meter');
    await expect(meter).toBeVisible({ timeout: 2000 });
    await expect(meter).toContainText('0.05');
    await expect(meter).toContainText('0.50');
  });

  test('cap-reached state replaces compose row on 403 from the API', async ({ page }) => {
    await gotoEditor(page);
    await page.route('**/api/quotequick/ai/chat', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'budget_exceeded',
          code: 'cap_exceeded',
          snapshot: DEFAULT_BUDGET,
        }),
      }),
    );

    await page.getByTestId('aibubble-toggle').click();
    await page.getByTestId('aibubble-input').fill('try anything');
    await page.getByTestId('aibubble-send').click();

    await expect(page.getByTestId('aibubble-cap-reached')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('aibubble-input')).toHaveCount(0);
  });

  test('image upload shows a thumbnail in the pending row', async ({ page }) => {
    await gotoEditor(page);
    await page.getByTestId('aibubble-toggle').click();

    // The file input is hidden — set its files directly. Smallest valid PNG.
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64',
    );
    await page.getByTestId('aibubble-file-input').setInputFiles({
      name: 'shot.png',
      mimeType: 'image/png',
      buffer: pngBytes,
    });

    const pending = page.getByTestId('aibubble-pending-image');
    await expect(pending).toBeVisible({ timeout: 3000 });
    await expect(pending.locator('img')).toBeVisible();
  });

  test('reset conversation clears the history', async ({ page }) => {
    await gotoEditor(page);
    await mockChat(page, buildSseStream([
      { event: 'open', data: { model: 'claude-haiku-4-5-20251001', estimate_usd: 0.01 } },
      { event: 'text', data: { delta: 'Sure.' } },
      { event: 'done', data: {
        cost_usd: 0.008,
        snapshot: { ...DEFAULT_BUDGET, cumulative_usd: 0.058 },
        warn: false,
      } },
    ]));

    await page.getByTestId('aibubble-toggle').click();
    await page.getByTestId('aibubble-input').fill('Hi');
    await page.getByTestId('aibubble-send').click();
    await expect(page.getByTestId('aibubble-msg-user')).toBeVisible({ timeout: 3000 });

    await page.getByTestId('aibubble-reset').click();
    await expect(page.getByTestId('aibubble-empty')).toBeVisible({ timeout: 2000 });
    await expect(page.getByTestId('aibubble-msg-user')).toHaveCount(0);
  });
});

test.describe('wizard K — destructive tool confirmation gating', () => {
  test.beforeEach(async ({ page }) => {
    await clearShellState(page);
    await mockBudget(page);
  });

  test('replace_template is queued until the user clicks Apply', async ({ page }) => {
    await gotoEditor(page);

    const newTemplate = {
      layout: 'single-column',
      header: { title: 'Roof Repair Pro', subtitle: 'Get a quick estimate' },
      fields: [
        { id: 'rrp_area', name: 'Area (sqft)', label: 'Area (sqft)', type: 'number', default_value: 500 },
        { id: 'rrp_pitch', name: 'Pitch', label: 'Pitch', type: 'slider', default_value: 4, min: 1, max: 12 },
      ],
      calculations: [
        { id: 'rrp_total', name: 'Estimate', formula: '[Area (sqft)] * 6 + [Pitch] * 50', format: 'currency' },
      ],
      result_calc: 'rrp_total',
    };

    await mockChat(page, buildSseStream([
      { event: 'open', data: { model: 'claude-haiku-4-5-20251001', estimate_usd: 0.01 } },
      { event: 'text', data: { delta: 'Here is a new roof repair calculator.' } },
      { event: 'tool_use', data: {
        id: 'toolu_replace_1',
        name: 'replace_template',
        input: { template_config: newTemplate, confirm_required: true },
      } },
      { event: 'done', data: {
        cost_usd: 0.018,
        snapshot: { ...DEFAULT_BUDGET, cumulative_usd: 0.068 },
        warn: false,
      } },
    ]));

    await page.getByTestId('aibubble-toggle').click();
    await page.getByTestId('aibubble-input').fill('build a roof repair calculator');
    await page.getByTestId('aibubble-send').click();

    // Confirmation card surfaces, with both Apply and Cancel buttons visible.
    const confirmCard = page.getByTestId('aibubble-confirm-card');
    await expect(confirmCard).toBeVisible({ timeout: 4000 });
    await expect(confirmCard).toHaveAttribute('data-state', 'pending');
    await expect(page.getByTestId('aibubble-confirm-apply')).toBeVisible();
    await expect(page.getByTestId('aibubble-confirm-cancel')).toBeVisible();
    await expect(page.getByTestId('aibubble-confirm-title')).toContainText('Roof Repair Pro');

    // Before clicking Apply: ShellState must NOT yet reflect the new template.
    const before = await page.evaluate(() => localStorage.getItem('qq_elfsight_shell'));
    if (before) {
      const parsedBefore = JSON.parse(before);
      const labelsBefore = (parsedBefore.fields ?? []).map((f: any) => f.label);
      expect(labelsBefore).not.toContain('Area (sqft)');
      expect(labelsBefore).not.toContain('Pitch');
    }
    // Tool chip should NOT exist yet (chip is only added on apply).
    await expect(page.getByTestId('aibubble-tool-chip')).toHaveCount(0);

    // Click Apply.
    await page.getByTestId('aibubble-confirm-apply').click();

    // Card flips to applied state and the tool chip appears.
    await expect(confirmCard).toHaveAttribute('data-state', 'applied', { timeout: 3000 });
    await expect(page.getByTestId('aibubble-confirm-applied')).toBeVisible();
    await expect(page.getByTestId('aibubble-tool-chip')).toHaveCount(1);

    // Now ShellState reflects the AI-supplied config.
    const after = await page.evaluate(() => localStorage.getItem('qq_elfsight_shell'));
    expect(after).not.toBeNull();
    const parsedAfter = JSON.parse(after as string);
    const labelsAfter = (parsedAfter.fields ?? []).map((f: any) => f.label);
    expect(labelsAfter).toContain('Area (sqft)');
    expect(labelsAfter).toContain('Pitch');
  });

  test('Cancel on a queued replace_template leaves fields untouched', async ({ page }) => {
    await gotoEditor(page);

    const newTemplate = {
      layout: 'single-column',
      header: { title: 'Some Template' },
      fields: [
        { id: 'x_a', name: 'Should Not Appear', label: 'Should Not Appear', type: 'number' },
      ],
      calculations: [
        { id: 'x_t', name: 'Total', formula: '[Should Not Appear]', format: 'currency' },
      ],
      result_calc: 'x_t',
    };

    await mockChat(page, buildSseStream([
      { event: 'open', data: { model: 'claude-haiku-4-5-20251001', estimate_usd: 0.01 } },
      { event: 'tool_use', data: {
        id: 'toolu_replace_2',
        name: 'replace_template',
        input: { template_config: newTemplate, confirm_required: true },
      } },
      { event: 'done', data: {
        cost_usd: 0.011,
        snapshot: { ...DEFAULT_BUDGET, cumulative_usd: 0.061 },
        warn: false,
      } },
    ]));

    await page.getByTestId('aibubble-toggle').click();
    await page.getByTestId('aibubble-input').fill('replace it');
    await page.getByTestId('aibubble-send').click();

    await expect(page.getByTestId('aibubble-confirm-card')).toBeVisible({ timeout: 4000 });
    await page.getByTestId('aibubble-confirm-cancel').click();

    await expect(page.getByTestId('aibubble-confirm-cancelled')).toBeVisible({ timeout: 2000 });
    await expect(page.getByTestId('aibubble-tool-chip')).toHaveCount(0);

    // ShellState was NOT mutated — the cancelled field never lands.
    const stored = await page.evaluate(() => localStorage.getItem('qq_elfsight_shell'));
    if (stored) {
      const parsed = JSON.parse(stored);
      const labels = (parsed.fields ?? []).map((f: any) => f.label);
      expect(labels).not.toContain('Should Not Appear');
    }
  });
});

test.describe('wizard K — AI bubble (mobile)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await clearShellState(page);
    await mockBudget(page);
  });

  test('bottom-sheet variant on mobile', async ({ page }) => {
    await gotoEditor(page);

    await page.getByTestId('aibubble-toggle').click();
    const panel = page.getByTestId('aibubble-panel');
    await expect(panel).toBeVisible({ timeout: 2000 });

    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    // On mobile the sheet stretches to roughly the full viewport width.
    // 390px viewport - browser scrollbar (≈ 15px) leaves ~374px usable.
    expect(Math.round(box!.width)).toBeGreaterThanOrEqual(360);
    // And the desktop fixed-360 width should not be in force.
    expect(Math.round(box!.width)).toBeGreaterThan(360);
  });
});

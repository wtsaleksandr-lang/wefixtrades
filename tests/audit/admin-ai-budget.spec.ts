/**
 * Wave K — /admin/crm/ai-budget admin page UX-QA.
 *
 * The page is admin-gated by RequirePortal, so under audit.config.ts (no
 * server) we have to mock the auth/me + admin endpoints alongside the
 * ai-budget endpoints. The test asserts the form renders and the save
 * button dispatches a PUT to /api/admin/crm/ai-budget/global.
 */

import { test, expect, type Page } from '@playwright/test';

const FAKE_ADMIN = { id: 1, email: 'admin@example.com', name: 'Admin', role: 'admin' };

const SEED_BUDGET = {
  global: {
    cap_lifetime_usd: 0.5,
    soft_warn_pct: 80,
    per_call_max_usd: 0.15,
    daily_ceiling_usd: 0.2,
    image_lifetime_cap: 10,
  },
  tiers: {
    tier_free: null,
    tier_starter: null,
    tier_pro: null,
    tier_agency: null,
  },
  top_spenders: [
    {
      user_id: 42,
      email: 'spendy@example.com',
      name: 'Spendy McTest',
      cumulative_usd: 0.45,
      month_usd: 0.30,
      today_usd: 0.05,
      images_used: 3,
    },
  ],
  scopes: ['global', 'tier_free', 'tier_starter', 'tier_pro', 'tier_agency'],
};

async function mockAdminContext(page: Page) {
  // RequirePortal pulls the user via /api/auth/me — pretend we're admin.
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: FAKE_ADMIN }),
    }),
  );
  // The AdminLayout sidebar calls a handful of background endpoints.
  // Return empty data for anything we don't care about so the page mounts.
  await page.route('**/api/admin/copilot/history', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/api/admin/crm/support/unresolved-count', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"count":0}' }),
  );
  await page.route('**/api/admin/crm/alerts/count', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"count":0}' }),
  );
}

test.describe('admin — /admin/crm/ai-budget', () => {
  test('renders the global form and the top-spenders table', async ({ page }) => {
    await mockAdminContext(page);
    await page.route('**/api/admin/crm/ai-budget', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SEED_BUDGET),
      }),
    );

    await page.goto('/admin/crm/ai-budget', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    // Form mounts.
    await expect(page.getByTestId('aibudget-card-global')).toBeVisible({ timeout: 4000 });
    await expect(page.getByTestId('aibudget-input-global-cap_lifetime_usd')).toHaveValue('0.5');
    await expect(page.getByTestId('aibudget-input-global-soft_warn_pct')).toHaveValue('80');

    // Per-tier card renders all 4 inheriting badges.
    await expect(page.getByTestId('aibudget-card-tiers')).toBeVisible();

    // Top-spenders table includes the seeded row.
    await expect(page.getByTestId('aibudget-spender-42')).toBeVisible();
  });

  test('save button dispatches PUT with the edited values', async ({ page }) => {
    await mockAdminContext(page);
    await page.route('**/api/admin/crm/ai-budget', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SEED_BUDGET),
      }),
    );

    let putBody: any = null;
    await page.route('**/api/admin/crm/ai-budget/global', async (route) => {
      try { putBody = JSON.parse(route.request().postData() || '{}'); } catch { putBody = null; }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, scope: 'global', values: putBody }),
      });
    });

    await page.goto('/admin/crm/ai-budget', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    // Bump the cap.
    const capInput = page.getByTestId('aibudget-input-global-cap_lifetime_usd');
    await capInput.fill('0.75');

    const req = page.waitForRequest('**/api/admin/crm/ai-budget/global');
    await page.getByTestId('aibudget-save-global').click();
    await req;

    expect(putBody).not.toBeNull();
    expect(putBody.cap_lifetime_usd).toBeCloseTo(0.75, 5);
    expect(putBody.soft_warn_pct).toBe(80);
  });
});

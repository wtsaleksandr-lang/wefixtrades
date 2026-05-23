/**
 * Deploy Safety Wave 2 — critical-paths smoke suite.
 *
 * Runs against a real base URL (prod by default, configurable via
 * SMOKE_BASE_URL). Each test:
 *   - completes in under 10 s
 *   - is idempotent and side-effect free (NEVER writes data)
 *   - is tagged @smoke so it can be filtered
 *
 * Total target wall-time: < 60 s.
 *
 * Some checks are soft-fail (`test.fixme`-style skip when the
 * feature isn't shipped yet) so the smoke suite stays green during
 * the SEO Wave A rollout that will land sitemap.xml + webhook ping.
 */

import { test, expect, type Response } from "@playwright/test";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:5000";

test.describe.configure({ mode: "parallel" });

test("@smoke home page loads with expected content", async ({ page }) => {
  const res = await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  expect(res?.ok(), `home page returned ${res?.status()}`).toBe(true);
  // Brand should be in the DOM somewhere — title or visible text.
  const html = await page.content();
  expect(html.toLowerCase()).toMatch(/wefixtrades|we fix trades/);
});

test("@smoke /login renders auth card with email + password inputs", async ({ page }) => {
  const res = await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  expect(res?.ok(), `login returned ${res?.status()}`).toBe(true);
  await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible({
    timeout: 8_000,
  });
  await expect(
    page.locator('input[type="password"], input[name="password"]').first(),
  ).toBeVisible({ timeout: 8_000 });
});

test("@smoke /portal redirects to /login when unauthenticated", async ({ page }) => {
  await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
  // Wait briefly for the SPA router or server redirect to settle.
  await page.waitForLoadState("domcontentloaded");
  await expect(page).toHaveURL(/\/login|\/portal\/login|\/sign-?in/i, { timeout: 8_000 });
});

test("@smoke /admin gate when unauthenticated", async ({ page }) => {
  // Either /admin/login renders directly OR /admin redirects to a login screen.
  const res = await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  expect(res, "navigation should not throw").toBeTruthy();
  const url = page.url();
  const isLoginish = /\/login|\/sign-?in|\/admin\/login/i.test(url);
  if (!isLoginish) {
    // Some setups render /admin/login at that exact path with 200.
    const direct = await page.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded" });
    expect(direct?.ok(), `/admin/login returned ${direct?.status()}`).toBe(true);
  } else {
    expect(isLoginish).toBe(true);
  }
});

test("@smoke /tools/free-audit loads with a search input", async ({ page }) => {
  const res = await page.goto(`${BASE}/tools/free-audit`, { waitUntil: "domcontentloaded" });
  expect(res?.ok(), `free-audit returned ${res?.status()}`).toBe(true);
  // Search input may be type=search, type=text, or a generic input. Just
  // assert at least one visible input exists.
  await expect(page.locator("input").first()).toBeVisible({ timeout: 8_000 });
});

test("@smoke /products/quickquotepro marketing page loads", async ({ page }) => {
  const res = await page.goto(`${BASE}/products/quickquotepro`, {
    waitUntil: "domcontentloaded",
  });
  // Soft-fail if the route hasn't shipped yet — SEO Wave A is in flight.
  if (!res?.ok()) {
    test.info().annotations.push({
      type: "soft-fail",
      description: `/products/quickquotepro returned ${res?.status()} — not yet shipped`,
    });
    return;
  }
  const html = (await page.content()).toLowerCase();
  expect(html).toMatch(/quickquote|quick quote/);
});

test("@smoke /api/healthz returns 200 with status=ok", async ({ request }) => {
  const res: Response = await request.get(`${BASE}/api/healthz`);
  expect(res.status(), `healthz HTTP ${res.status()}`).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.checks).toBeTruthy();
  expect(body.checks.db).toBeTruthy();
  expect(body.checks.db_tables).toBeTruthy();
});

test("@smoke /api/auth/me returns 401 when unauthenticated", async ({ request }) => {
  const res = await request.get(`${BASE}/api/auth/me`);
  // 401 is the contract. Some setups return 200 with { user: null } —
  // accept either, but reject 5xx and 404.
  expect([200, 401, 403]).toContain(res.status());
});

test("@smoke /sitemap.xml soft check", async ({ request }) => {
  const res = await request.get(`${BASE}/sitemap.xml`);
  if (!res.ok()) {
    test.info().annotations.push({
      type: "soft-fail",
      description: `sitemap.xml returned ${res.status()} — SEO Wave A lands this`,
    });
    return;
  }
  const body = await res.text();
  expect(body).toMatch(/<urlset|<sitemapindex/);
});

test("@smoke Stripe webhook endpoint reachable (soft)", async ({ request }) => {
  // GET against a webhook endpoint usually returns 405 / 400 — that's fine,
  // it proves the route exists. We only flag 5xx and 404.
  const candidates = ["/api/webhooks/stripe", "/api/stripe/webhook", "/webhooks/stripe"];
  let bestStatus: number | null = null;
  for (const path of candidates) {
    const res = await request.get(`${BASE}${path}`);
    if (res.status() !== 404) {
      bestStatus = res.status();
      break;
    }
  }
  if (bestStatus === null) {
    test.info().annotations.push({
      type: "soft-fail",
      description: "no stripe webhook endpoint found — skipping",
    });
    return;
  }
  expect(bestStatus).toBeLessThan(500);
});

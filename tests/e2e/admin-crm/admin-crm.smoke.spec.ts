/**
 * Admin CRM — Smoke Tests (Tier 1)
 *
 * Fast confidence checks: login, routing, sidebar nav, route protection, logout.
 * These should pass in < 30s total.
 */

import { test, expect } from "./fixtures";
import { test as baseTest, expect as baseExpect } from "@playwright/test";

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@wefixtrades.com";
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "TestAdmin123!";

/* ═══════════════════════════════════════════
   S1 — Login with valid admin credentials
   ═══════════════════════════════════════════ */

baseTest.describe("Smoke: Auth", () => {
  baseTest("S1 — should login and land on /admin/crm", async ({ page }) => {
    await page.goto("/login");

    // Page renders sign-in form
    await baseExpect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();

    // Fill credentials
    await page.getByRole("textbox", { name: /email/i }).fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Should redirect to admin CRM overview
    await page.waitForURL("**/admin/crm**", { timeout: 15000 });
    await baseExpect(page).toHaveURL(/\/admin\/crm/);
  });

  baseTest("S4 — unauthenticated user is redirected to /login", async ({ page }) => {
    // Go directly to a protected route without logging in
    await page.goto("/admin/crm/clients");

    // Should redirect to /login
    await page.waitForURL("**/login**", { timeout: 10000 });
    await baseExpect(page).toHaveURL(/\/login/);
  });

  baseTest("S5 — login with wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill("WrongPassword999!");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Error message should appear, should stay on /login
    await baseExpect(page.locator("text=Login failed").or(page.locator("text=Invalid"))).toBeVisible({
      timeout: 5000,
    });
    await baseExpect(page).toHaveURL(/\/login/);
  });
});

/* ═══════════════════════════════════════════
   S2/S3 — Sidebar navigation (requires auth)
   ═══════════════════════════════════════════ */

test.describe("Smoke: Navigation", () => {
  test("S2 — admin lands on /admin/crm overview", async ({ adminPage }) => {
    await expect(adminPage).toHaveURL(/\/admin\/crm/);
    // Overview page should show key headings or KPI cards
    await expect(adminPage.locator("text=Overview").or(adminPage.locator("text=Total Clients").or(adminPage.locator("text=Active Services")))).toBeVisible({
      timeout: 10000,
    });
  });

  test("S3 — sidebar links navigate to correct pages", async ({ adminPage }) => {
    const navChecks = [
      { link: /clients/i, url: /\/admin\/crm\/clients/ },
      { link: /inbox/i, url: /\/admin\/crm\/inbox/ },
      { link: /billing/i, url: /\/admin\/crm\/billing/ },
      { link: /services/i, url: /\/admin\/crm\/services/ },
    ];

    for (const { link, url } of navChecks) {
      // Click sidebar link — look in nav/sidebar area
      const navLink = adminPage.locator("nav a, aside a, [role=navigation] a").filter({ hasText: link }).first();
      if (await navLink.isVisible()) {
        await navLink.click();
        await adminPage.waitForURL(url, { timeout: 10000 });
        await expect(adminPage).toHaveURL(url);
      }
    }
  });

  test("S6 — logout returns user to /login", async ({ adminPage }) => {
    // Open user menu (the avatar/initials button)
    const avatar = adminPage.locator("button").filter({ has: adminPage.locator("span.text-white") }).first();
    if (await avatar.isVisible()) {
      await avatar.click();
    }

    // Click Log Out
    const logoutBtn = adminPage.getByText(/log out/i);
    await expect(logoutBtn).toBeVisible({ timeout: 3000 });
    await logoutBtn.click();

    // Should redirect to /login
    await adminPage.waitForURL("**/login**", { timeout: 10000 });
    await expect(adminPage).toHaveURL(/\/login/);
  });
});
